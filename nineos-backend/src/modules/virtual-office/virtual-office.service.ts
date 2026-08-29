import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AIService, AIChatMessage } from '../../common/ai/ai.service';
import { AgentRunnerService } from '../agent/agent-runner.service';
import { AgentRunResult } from '../../common/agent/agent.types';
import {
  CreateSessionDto, SendMessageDto, EndSessionDto, AddFinancialSnapshotDto,
} from './dto/virtual-office.dto';

@Injectable()
export class VirtualOfficeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    private readonly agent: AgentRunnerService,
  ) {}

  // ── Executives ────────────────────────────────────────────────

  async listExecutives() {
    const executives = await this.prisma.executive.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, roleCode: true, displayName: true,
        scopeDescription: true, status: true, sortOrder: true,
        dataSources: { select: { dataDomain: true } },
      },
    });
    return {
      data: executives.map((e) => ({
        role_code: e.roleCode,
        display_name: e.displayName,
        scope: e.scopeDescription,
        status: e.status,
        data_domains: e.dataSources.map((d) => d.dataDomain),
      })),
    };
  }

  async getExecutive(roleCode: string) {
    const exec = await this.prisma.executive.findUnique({
      where: { roleCode: roleCode.toUpperCase() },
      include: { dataSources: { select: { dataDomain: true } } },
    });
    if (!exec) throw new NotFoundException(`Executive '${roleCode}' tidak ditemukan`);
    return {
      role_code: exec.roleCode,
      display_name: exec.displayName,
      scope: exec.scopeDescription,
      status: exec.status,
      ai_model: exec.aiModel,
      data_domains: exec.dataSources.map((d) => d.dataDomain),
    };
  }

  // ── Sessions ──────────────────────────────────────────────────

  async createSession(dto: CreateSessionDto) {
    const roles = dto.participant_roles.map((r) => r.toUpperCase());

    const executives = await this.prisma.executive.findMany({
      where: { roleCode: { in: roles } },
    });

    const notReady = executives.filter((e) => e.status === 'not_ready').map((e) => e.roleCode);
    if (notReady.length) {
      throw new BadRequestException(`Role berikut belum siap: ${notReady.join(', ')}`);
    }

    const notFound = roles.filter((r) => !executives.find((e) => e.roleCode === r));
    if (notFound.length) {
      throw new NotFoundException(`Role tidak ditemukan: ${notFound.join(', ')}`);
    }

    const session = await this.prisma.executiveSession.create({
      data: {
        mode: dto.mode,
        title: dto.title ?? null,
        participantExecutiveIds: executives.map((e) => e.id),
        status: 'active',
        startedAt: new Date(),
        scheduledAt: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
      },
    });

    return {
      session_id: session.id,
      mode: session.mode,
      title: session.title,
      participants: executives.map((e) => ({ role_code: e.roleCode, display_name: e.displayName })),
      status: session.status,
      started_at: session.startedAt?.toISOString(),
    };
  }

  async listSessions(mode?: string, status?: string) {
    const sessions = await this.prisma.executiveSession.findMany({
      where: {
        ...(mode && { mode }),
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { data: sessions.map(this.formatSession) };
  }

  async getSession(id: string) {
    const session = await this.prisma.executiveSession.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { executive: { select: { roleCode: true, displayName: true } } },
        },
      },
    });
    if (!session) throw new NotFoundException(`Session '${id}' tidak ditemukan`);

    return {
      ...this.formatSession(session),
      messages: session.messages.map((m) => ({
        id: m.id,
        sender_type: m.senderType,
        speaker: m.executive ? { role_code: m.executive.roleCode, name: m.executive.displayName } : null,
        message: m.messageText,
        created_at: m.createdAt.toISOString(),
      })),
    };
  }

  // ── Messages (founder → AI → response) ───────────────────────

  async sendMessage(sessionId: string, dto: SendMessageDto) {
    const session = await this.prisma.executiveSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`Session '${sessionId}' tidak ditemukan`);
    if (session.status !== 'active') throw new BadRequestException(`Session sudah ${session.status}`);

    // 1. Simpan pesan founder
    await this.prisma.executiveMessage.create({
      data: {
        sessionId,
        senderType: 'founder',
        messageText: dto.message_text,
      },
    });

    // 2. Ambil executives yang terlibat
    const executives = await this.prisma.executive.findMany({
      where: { id: { in: session.participantExecutiveIds as string[] } },
      orderBy: { sortOrder: 'asc' },
    });

    // 3. Ambil riwayat pesan untuk context AI
    const history = await this.prisma.executiveMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 30,
      include: { executive: { select: { roleCode: true } } },
    });

    const replies: Array<{
      role_code: string;
      display_name: string;
      message: string;
      tool_calls: AgentRunResult['tool_calls'];
    }> = [];

    // 4. Untuk setiap executive, jalankan agent (boleh panggil tool sendiri)
    for (const exec of executives) {
      const run = await this.runExecutive(exec, history, dto.message_text, sessionId);

      const saved = await this.prisma.executiveMessage.create({
        data: {
          sessionId,
          senderType: 'executive',
          speakerExecutiveId: exec.id,
          messageText: run.text,
          // Jejak tool disimpan menggantikan dump statis lama — inilah bukti
          // data mana yang benar-benar dipakai executive untuk menjawab.
          contextData: {
            provider: run.provider,
            iterations: run.iterations,
            tool_calls: run.tool_calls,
          } as object,
        },
      });

      replies.push({
        role_code: exec.roleCode,
        display_name: exec.displayName,
        message: saved.messageText,
        tool_calls: run.tool_calls,
      });
    }

    return { session_id: sessionId, replies };
  }

  async endSession(id: string, dto: EndSessionDto) {
    const session = await this.prisma.executiveSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`Session '${id}' tidak ditemukan`);

    const updated = await this.prisma.executiveSession.update({
      where: { id },
      data: { status: 'completed', endedAt: new Date(), summary: dto.summary ?? null },
    });
    return this.formatSession(updated);
  }

  getAIProvider(): string {
    return this.ai.activeProvider;
  }

  // ── Data Context (untuk n8n / debugging) ─────────────────────

  async getDataContext(domain: string) {
    const data = await this.buildContext(domain);
    return { domain, data };
  }

  // ── Financial Snapshots (untuk CFO) ──────────────────────────

  async addFinancialSnapshot(dto: AddFinancialSnapshotDto) {
    const snap = await this.prisma.financialSnapshot.create({
      data: {
        periodStart: new Date(dto.period_start),
        periodEnd: new Date(dto.period_end),
        revenueTotal: dto.revenue_total ?? null,
        expenseTotal: dto.expense_total ?? null,
        notes: dto.notes ?? null,
        source: 'manual',
      },
    });
    return {
      id: snap.id,
      period: `${snap.periodStart.toISOString().slice(0, 10)} ~ ${snap.periodEnd.toISOString().slice(0, 10)}`,
      revenue: snap.revenueTotal,
      expense: snap.expenseTotal,
      notes: snap.notes,
    };
  }

  async listFinancialSnapshots() {
    const snaps = await this.prisma.financialSnapshot.findMany({
      orderBy: { periodStart: 'desc' },
      take: 12,
    });
    return {
      data: snaps.map((s) => ({
        id: s.id,
        period_start: s.periodStart.toISOString().slice(0, 10),
        period_end: s.periodEnd.toISOString().slice(0, 10),
        revenue: s.revenueTotal,
        expense: s.expenseTotal,
        profit: s.revenueTotal && s.expenseTotal
          ? Number(s.revenueTotal) - Number(s.expenseTotal)
          : null,
        notes: s.notes,
      })),
    };
  }

  // ── private: jalankan satu executive sebagai agent ────────────

  private async runExecutive(
    exec: { id: string; roleCode: string; displayName: string; systemPrompt: string; aiModel: string },
    history: Array<{ senderType: string; messageText: string; executive: { roleCode: string } | null }>,
    latestMessage: string,
    sessionId: string,
  ): Promise<AgentRunResult> {
    // Riwayat khusus executive ini: pesan founder + balasannya sendiri.
    // Pesan terakhir (yang sedang diproses) sudah dipisah ke `userMessage`.
    const messages: AIChatMessage[] = [];
    for (const msg of history) {
      if (msg.senderType === 'founder') {
        messages.push({ role: 'user', content: msg.messageText });
      } else if (msg.executive?.roleCode === exec.roleCode) {
        messages.push({ role: 'assistant', content: msg.messageText });
      }
    }
    if (messages[messages.length - 1]?.content === latestMessage) messages.pop();

    return this.agent.run({
      systemPrompt: this.buildAgentPrompt(exec),
      history: messages,
      userMessage: latestMessage,
      roleCode: exec.roleCode,
      preferredModel: exec.aiModel,
      context: {
        sessionId,
        executiveRole: exec.roleCode,
        origin: 'virtual_office',
      },
    });
  }

  /**
   * Prompt agentic. Bedanya dengan versi lama: data TIDAK lagi disuntik
   * sebagai blob statis di awal. Executive diberi tahu tool apa yang dia
   * punya, lalu dia sendiri yang memutuskan data mana yang perlu ditarik.
   */
  private buildAgentPrompt(exec: { roleCode: string; displayName: string; systemPrompt: string }): string {
    return `${exec.systemPrompt}

## Identitas
Kamu ${exec.displayName} NineOS, menjawab langsung ke founder (panggil dia "kapten"). Bahasa Indonesia, ringkas, langsung ke inti, dan selalu berbasis angka nyata.

## Platform yang kamu awasi
- **matcha** — Talent Intelligence Platform (matchascore.com). PRODUCTION, live. Metrik: kandidat terdaftar, recruiter, lowongan aktif, screening, payment.
- **notabe** — Aplikasi kasir laundry NotaBe. PRODUCTION, live. Metrik: GMV, order, omzet, piutang, pengeluaran, jumlah toko, pelanggan.
- **krama** — Super-app jasa lokal. Masih lokal/dev, KPI sering tidak tersedia.
- **nineclip** — SaaS auto-clipping. Masih lokal/dev, KPI sering tidak tersedia.

## Aturan kerja
1. **JANGAN pernah mengarang angka.** Kalau butuh data, panggil tool. Kalau tool bilang tidak tersedia, sampaikan apa adanya dan sebutkan kemungkinan penyebabnya.
2. **KPI yang berhasil ditarik adalah bukti platform hidup.** Kalau \`get_platform_kpi\` atau \`get_all_platforms_kpi\` mengembalikan angka untuk sebuah platform, platform itu SEHAT — jangan pernah menyebutnya bermasalah hanya karena tool lain menampilkan status koneksi yang aneh. Data KPI selalu lebih otoritatif daripada metadata koneksi.
3. Angka mentah tidak cukup — beri interpretasi. Kalau ditanya "naik atau turun", pakai \`get_kpi_trend\` atau \`compare_platform_periods\`, jangan menebak dari satu angka.
4. Boleh memanggil beberapa tool sekaligus dalam satu giliran kalau memang perlu.
5. Tutup jawaban dengan rekomendasi konkret yang bisa langsung dikerjakan kapten.
6. Untuk aksi yang butuh persetujuan, sistem akan mengembalikan status \`pending_approval\` + \`action_id\`. Kalau itu terjadi, **katakan terus terang bahwa aksi belum jalan** dan minta kapten menyetujui. Jangan pernah mengaku sudah melakukannya.
7. Format rupiah dengan pemisah ribuan (mis. Rp140.800).`;
  }

  // ── private: Build context per domain ────────────────────────

  private async buildContext(domain: string): Promise<Record<string, unknown>> {
    switch (domain) {
      case 'CTO':
      case 'platform_health': {
        const platforms = await this.prisma.platform.findMany({
          include: {
            connections: {
              where: { environment: 'staging' },
              select: { connectionStatus: true, lastCheckedAt: true, lastError: true },
            },
            syncJobs: {
              orderBy: { startedAt: 'desc' },
              take: 3,
              select: { jobType: true, status: true, startedAt: true },
            },
          },
        });
        return {
          platform_health: platforms.map((p) => ({
            platform: p.slug,
            readiness: p.readinessStatus,
            connection: p.connections[0]?.connectionStatus ?? 'not_configured',
            last_checked: p.connections[0]?.lastCheckedAt?.toISOString() ?? null,
            last_error: p.connections[0]?.lastError ?? null,
            recent_jobs: p.syncJobs.map((j) => ({ type: j.jobType, status: j.status })),
          })),
          pending_alerts: await this.prisma.automationAlert.count({ where: { status: 'pending' } }),
        };
      }

      case 'CMO':
      case 'social_media':
      case 'helpdesk': {
        const [contentStats, conversations, accounts] = await Promise.all([
          this.prisma.contentItem.groupBy({
            by: ['status'],
            _count: true,
          }),
          this.prisma.helpdeskConversation.groupBy({
            by: ['status'],
            _count: true,
          }),
          this.prisma.socialAccount.findMany({
            select: { channelType: true, isActive: true, platform: { select: { slug: true } } },
            where: { isActive: true },
          }),
        ]);
        return {
          content_by_status: contentStats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
          helpdesk_by_status: conversations.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
          active_social_accounts: accounts.map((a) => ({ platform: a.platform.slug, channel: a.channelType })),
        };
      }

      case 'CFO':
      case 'finance': {
        const snaps = await this.prisma.financialSnapshot.findMany({
          orderBy: { periodStart: 'desc' },
          take: 3,
        });
        return {
          financial_snapshots: snaps.map((s) => ({
            period: `${s.periodStart.toISOString().slice(0, 10)} ~ ${s.periodEnd.toISOString().slice(0, 10)}`,
            revenue: s.revenueTotal,
            expense: s.expenseTotal,
            profit: s.revenueTotal && s.expenseTotal
              ? Number(s.revenueTotal) - Number(s.expenseTotal)
              : null,
            notes: s.notes,
          })),
          note: 'Data finance adalah input manual founder. Integrasi otomatis belum tersedia.',
        };
      }

      case 'CEO':
      case 'all': {
        const [platforms, alertCount, contentCount, convCount] = await Promise.all([
          this.prisma.platform.count({ where: { readinessStatus: 'ready' } }),
          this.prisma.automationAlert.count({ where: { status: 'pending' } }),
          this.prisma.contentItem.count({ where: { status: 'scheduled' } }),
          this.prisma.helpdeskConversation.count({ where: { status: 'open' } }),
        ]);
        return {
          summary: {
            platforms_ready: platforms,
            pending_alerts: alertCount,
            scheduled_content: contentCount,
            open_helpdesk_conversations: convCount,
          },
        };
      }

      default:
        return { note: `Domain '${domain}' belum memiliki data context.` };
    }
  }

  private formatSession(s: {
    id: string; mode: string; title: string | null; status: string;
    scheduledAt: Date | null; startedAt: Date | null; endedAt: Date | null;
    summary: string | null; createdAt: Date;
  }) {
    return {
      id: s.id, mode: s.mode, title: s.title, status: s.status,
      scheduled_at: s.scheduledAt?.toISOString() ?? null,
      started_at: s.startedAt?.toISOString() ?? null,
      ended_at: s.endedAt?.toISOString() ?? null,
      summary: s.summary,
      created_at: s.createdAt.toISOString(),
    };
  }
}
