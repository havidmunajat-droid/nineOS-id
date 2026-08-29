import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformKpiService } from '../platforms/platform-kpi.service';
import {
  AgentExecutionContext,
  AgentToolDefinition,
  ToolInvocation,
  ToolOutcome,
} from '../../common/agent/agent.types';

type Period = 'today' | 'week' | 'month';

const PERIODS: string[] = ['today', 'week', 'month'];

/**
 * Registry tool yang boleh dipanggil AI executive.
 *
 * Tiap tool punya `risk`:
 *   read      → langsung jalan
 *   write     → langsung jalan, tercatat di `agent_actions`
 *   sensitive → ditahan jadi `pending_approval`, baru jalan setelah kapten
 *               menyetujui lewat POST /agent/actions/:id/approve
 *
 * Set `AGENT_AUTONOMY=full` di .env kalau kapten mau tool sensitive
 * ikut jalan otomatis tanpa approval (tidak disarankan).
 */
@Injectable()
export class AgentToolsService {
  private readonly logger = new Logger(AgentToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kpi: PlatformKpiService,
  ) {}

  // ── Definisi tool ─────────────────────────────────────────────

  private readonly definitions: AgentToolDefinition[] = [
    {
      name: 'get_platform_kpi',
      description:
        'Ambil KPI LIVE terbaru langsung dari backend platform. Matcha = talent/rekrutmen (kandidat, recruiter, lowongan, screening, payment). NotaBe = kasir laundry (GMV, order, omzet, piutang, toko, pelanggan). Pakai ini setiap kali ditanya angka terkini sebuah platform.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            description: 'Slug platform',
            enum: ['matcha', 'notabe', 'krama', 'nineclip'],
          },
          period: {
            type: 'string',
            description: 'Rentang waktu KPI',
            enum: PERIODS,
          },
        },
        required: ['platform'],
      },
    },
    {
      name: 'get_all_platforms_kpi',
      description:
        'Ambil KPI live SEMUA platform sekaligus dalam satu panggilan. Pakai ini untuk pertanyaan lintas-platform seperti "gimana bisnis hari ini" atau "platform mana yang paling jalan".',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description: 'Rentang waktu KPI',
            enum: PERIODS,
          },
        },
      },
    },
    {
      name: 'compare_platform_periods',
      description:
        'Bandingkan KPI satu platform pada today vs week vs month sekaligus. Pakai untuk menilai apakah performa hari ini wajar dibanding rata-rata.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            description: 'Slug platform',
            enum: ['matcha', 'notabe', 'krama', 'nineclip'],
          },
        },
        required: ['platform'],
      },
    },
    {
      name: 'get_kpi_trend',
      description:
        'Ambil riwayat snapshot KPI yang direkam watcher tiap jam, untuk melihat tren naik/turun. Berbeda dengan get_platform_kpi yang hanya angka SEKARANG. Pakai ini kalau ditanya "naik atau turun", "dibanding kemarin", atau untuk membuktikan sebuah anomali.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            description: 'Slug platform',
            enum: ['matcha', 'notabe', 'krama', 'nineclip'],
          },
          hours: {
            type: 'integer',
            description: 'Berapa jam ke belakang yang diambil. Default 48, maksimal 720.',
          },
        },
        required: ['platform'],
      },
    },
    {
      name: 'get_platform_health',
      description:
        'Status teknis platform: readiness, sumber kredensial, log health check, dan sync job terakhir. Untuk menilai hidup/mati sebuah platform, pakai field `kpi_reachable` — itu hasil percobaan nyata barusan. JANGAN pakai field `connection.status`: nilai "no_connection_row" hanya berarti kredensialnya disimpan di env var, BUKAN berarti platformnya bermasalah.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            description:
              'Slug platform. Kosongkan untuk melihat ringkasan semua platform.',
          },
        },
      },
    },
    {
      name: 'get_alerts',
      description:
        'Daftar alert operasional NineOS (termasuk anomali yang dideteksi watcher otomatis). Pakai untuk tahu ada masalah apa yang belum ditangani.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Filter status alert',
            enum: ['pending', 'sent', 'acknowledged', 'resolved'],
          },
          severity: {
            type: 'string',
            description: 'Filter tingkat keparahan',
            enum: ['info', 'warning', 'critical'],
          },
          limit: {
            type: 'integer',
            description: 'Jumlah maksimal alert. Default 20.',
          },
        },
      },
    },
    {
      name: 'get_finance_summary',
      description:
        'Ringkasan keuangan: snapshot manual yang diinput founder (revenue/expense/profit) DIGABUNG dengan revenue live dari KPI platform. Pakai untuk pertanyaan finansial.',
      risk: 'read',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'get_operations_summary',
      description:
        'Ringkasan operasional internal NineOS: jumlah konten per status, percakapan helpdesk per status, akun sosial aktif, dan konten yang terjadwal hari ini.',
      risk: 'read',
      parameters: { type: 'object', properties: {} },
    },

    // ── Tool yang MENGUBAH data ────────────────────────────────
    {
      name: 'create_alert',
      description:
        'Catat temuan penting sebagai alert supaya tidak hilang dan muncul di dashboard kapten. Pakai HANYA kalau kamu menemukan sesuatu yang benar-benar perlu ditindaklanjuti — jangan untuk laporan rutin.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            description: 'Slug platform terkait. Kosongkan kalau lintas-platform.',
          },
          severity: {
            type: 'string',
            description: 'Tingkat keparahan',
            enum: ['info', 'warning', 'critical'],
          },
          title: { type: 'string', description: 'Judul singkat, maksimal 200 karakter' },
          message: {
            type: 'string',
            description: 'Penjelasan temuan + angka pendukung + rekomendasi tindakan',
          },
        },
        required: ['severity', 'title', 'message'],
      },
    },
    {
      name: 'record_finance_snapshot',
      description:
        'Simpan catatan keuangan satu periode ke database NineOS. Pakai kalau kapten menyebutkan angka revenue/expense dalam percakapan dan minta dicatat.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          period_start: { type: 'string', description: 'Tanggal mulai, format YYYY-MM-DD' },
          period_end: { type: 'string', description: 'Tanggal akhir, format YYYY-MM-DD' },
          revenue_total: { type: 'number', description: 'Total pendapatan periode itu' },
          expense_total: { type: 'number', description: 'Total pengeluaran periode itu' },
          notes: { type: 'string', description: 'Catatan konteks angka ini' },
        },
        required: ['period_start', 'period_end'],
      },
    },
    {
      name: 'draft_content',
      description:
        'Buat draft konten sosial media (status draft, BELUM terjadwal dan BELUM terbit). Kapten tetap harus meninjau di Content Studio sebelum dijadwalkan.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            description: 'Slug platform pemilik konten',
            enum: ['matcha', 'notabe', 'krama', 'nineclip'],
          },
          title: { type: 'string', description: 'Judul internal draft' },
          caption: { type: 'string', description: 'Isi caption siap posting' },
        },
        required: ['platform', 'caption'],
      },
    },

    // ── Tool SENSITIF — wajib approval kapten ──────────────────
    {
      name: 'schedule_content',
      description:
        'Jadwalkan konten draft untuk terbit pada waktu tertentu. Ini menyentuh jadwal posting nyata, jadi HARUS disetujui kapten dulu.',
      risk: 'sensitive',
      parameters: {
        type: 'object',
        properties: {
          content_id: { type: 'string', description: 'UUID content item yang mau dijadwalkan' },
          scheduled_at: {
            type: 'string',
            description: 'Waktu terbit, format ISO 8601 (mis. 2026-08-30T19:00:00+07:00)',
          },
        },
        required: ['content_id', 'scheduled_at'],
      },
    },
    {
      name: 'escalate_helpdesk_conversation',
      description:
        'Eskalasi percakapan helpdesk ke manusia. Berdampak ke pelanggan nyata, jadi HARUS disetujui kapten dulu.',
      risk: 'sensitive',
      parameters: {
        type: 'object',
        properties: {
          conversation_id: { type: 'string', description: 'UUID percakapan helpdesk' },
          reason: {
            type: 'string',
            description: 'Alasan eskalasi, maksimal 50 karakter',
          },
        },
        required: ['conversation_id', 'reason'],
      },
    },
    {
      name: 'set_platform_readiness',
      description:
        'Ubah status kesiapan sebuah platform di NineOS. Mengubah tampilan dashboard, jadi HARUS disetujui kapten dulu.',
      risk: 'sensitive',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: 'Slug platform' },
          status: {
            type: 'string',
            description: 'Status kesiapan baru',
            enum: ['ready', 'partial', 'not_ready'],
          },
        },
        required: ['platform', 'status'],
      },
    },
  ];

  /** Tool apa saja yang boleh dipegang tiap role C-Level. */
  private readonly roleToolMap: Record<string, string[]> = {
    CEO: [
      'get_all_platforms_kpi',
      'get_platform_kpi',
      'compare_platform_periods',
      'get_kpi_trend',
      'get_platform_health',
      'get_alerts',
      'get_finance_summary',
      'get_operations_summary',
      'create_alert',
      'set_platform_readiness',
    ],
    CFO: [
      'get_all_platforms_kpi',
      'get_platform_kpi',
      'compare_platform_periods',
      'get_kpi_trend',
      'get_finance_summary',
      'get_alerts',
      'create_alert',
      'record_finance_snapshot',
    ],
    CTO: [
      'get_platform_health',
      'get_platform_kpi',
      'get_all_platforms_kpi',
      'get_kpi_trend',
      'get_alerts',
      'create_alert',
      'set_platform_readiness',
    ],
    CMO: [
      'get_all_platforms_kpi',
      'get_platform_kpi',
      'compare_platform_periods',
      'get_kpi_trend',
      'get_operations_summary',
      'get_alerts',
      'create_alert',
      'draft_content',
      'schedule_content',
      'escalate_helpdesk_conversation',
    ],
  };

  toolsForRole(roleCode: string): AgentToolDefinition[] {
    const allowed = this.roleToolMap[roleCode.toUpperCase()];
    // Role tanpa pemetaan (COO, LEGAL) hanya dapat tool read.
    if (!allowed) return this.definitions.filter((t) => t.risk === 'read');
    return this.definitions.filter((t) => allowed.includes(t.name));
  }

  allTools(): AgentToolDefinition[] {
    return this.definitions;
  }

  findDefinition(name: string): AgentToolDefinition | undefined {
    return this.definitions.find((t) => t.name === name);
  }

  // ── Dispatcher ────────────────────────────────────────────────

  async dispatch(call: ToolInvocation, ctx: AgentExecutionContext): Promise<ToolOutcome> {
    const def = this.findDefinition(call.name);
    if (!def) {
      return { ok: false, data: { error: `Tool '${call.name}' tidak dikenal.` } };
    }

    const needsApproval =
      def.risk === 'sensitive' && process.env.AGENT_AUTONOMY !== 'full';

    if (needsApproval) {
      const action = await this.prisma.agentAction.create({
        data: {
          sessionId: ctx.sessionId ?? null,
          executiveRole: ctx.executiveRole ?? null,
          toolName: call.name,
          riskLevel: def.risk,
          status: 'pending_approval',
          args: call.args as object,
        },
      });
      return {
        ok: true,
        data: {
          status: 'pending_approval',
          action_id: action.id,
          note: `Aksi '${call.name}' BELUM dijalankan karena butuh persetujuan kapten. Sampaikan ini ke kapten dan sebutkan action_id-nya. Jangan mengaku sudah melakukannya.`,
        },
      };
    }

    const startedAt = Date.now();
    try {
      const data = await this.execute(call.name, call.args);
      await this.prisma.agentAction.create({
        data: {
          sessionId: ctx.sessionId ?? null,
          executiveRole: ctx.executiveRole ?? null,
          toolName: call.name,
          riskLevel: def.risk,
          status: 'executed',
          args: call.args as object,
          result: this.asJson(data),
          durationMs: Date.now() - startedAt,
        },
      });
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Tool '${call.name}' error: ${message}`);
      await this.prisma.agentAction.create({
        data: {
          sessionId: ctx.sessionId ?? null,
          executiveRole: ctx.executiveRole ?? null,
          toolName: call.name,
          riskLevel: def.risk,
          status: 'failed',
          args: call.args as object,
          error: message,
          durationMs: Date.now() - startedAt,
        },
      });
      return { ok: false, data: { error: message } };
    }
  }

  /** Eksekusi nyata sebuah tool. Dipakai dispatch() dan alur approval. */
  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'get_platform_kpi':
        return this.getPlatformKpi(this.str(args.platform), this.period(args.period));
      case 'get_all_platforms_kpi':
        return this.getAllPlatformsKpi(this.period(args.period));
      case 'compare_platform_periods':
        return this.comparePlatformPeriods(this.str(args.platform));
      case 'get_kpi_trend':
        return this.getKpiTrend(this.str(args.platform), this.int(args.hours, 48));
      case 'get_platform_health':
        return this.getPlatformHealth(args.platform ? this.str(args.platform) : undefined);
      case 'get_alerts':
        return this.getAlerts(args);
      case 'get_finance_summary':
        return this.getFinanceSummary();
      case 'get_operations_summary':
        return this.getOperationsSummary();
      case 'create_alert':
        return this.createAlert(args);
      case 'record_finance_snapshot':
        return this.recordFinanceSnapshot(args);
      case 'draft_content':
        return this.draftContent(args);
      case 'schedule_content':
        return this.scheduleContent(args);
      case 'escalate_helpdesk_conversation':
        return this.escalateConversation(args);
      case 'set_platform_readiness':
        return this.setPlatformReadiness(args);
      default:
        throw new Error(`Tool '${name}' belum diimplementasikan.`);
    }
  }

  // ── Implementasi tool: READ ───────────────────────────────────

  private async getPlatformKpi(slug: string, period: Period) {
    const kpi = await this.kpi.fetchKpi(slug, period);
    if (!kpi) {
      return {
        platform: slug,
        period,
        available: false,
        reason:
          'KPI tidak bisa diambil — platform belum dicolok (URL/key kosong), backend-nya mati, atau menolak key. Cek dengan get_platform_health.',
      };
    }
    return { platform: slug, period, available: true, kpi };
  }

  private async getAllPlatformsKpi(period: Period) {
    const results = await this.kpi.fetchAllKpi(period);
    const platforms = await this.prisma.platform.findMany({
      select: { slug: true, readinessStatus: true },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      period,
      live: results,
      unavailable: platforms
        .filter((p) => !results[p.slug])
        .map((p) => ({ platform: p.slug, readiness: p.readinessStatus })),
    };
  }

  private async comparePlatformPeriods(slug: string) {
    const [today, week, month] = await Promise.all([
      this.kpi.fetchKpi(slug, 'today'),
      this.kpi.fetchKpi(slug, 'week'),
      this.kpi.fetchKpi(slug, 'month'),
    ]);
    return { platform: slug, today, week, month };
  }

  private async getKpiTrend(slug: string, hours: number) {
    const window = Math.min(Math.max(hours, 1), 720);
    const since = new Date(Date.now() - window * 3600_000);

    const snapshots = await this.prisma.platformKpiSnapshot.findMany({
      where: { platformSlug: slug, period: 'today', capturedAt: { gte: since } },
      orderBy: { capturedAt: 'asc' },
      select: {
        capturedAt: true,
        gmv: true,
        revenue: true,
        activeUsers: true,
      },
    });

    if (snapshots.length === 0) {
      return {
        platform: slug,
        window_hours: window,
        points: [],
        note: 'Belum ada snapshot historis untuk rentang ini. Watcher merekam tiap jam, jadi data tren baru terkumpul setelah beberapa jam berjalan.',
      };
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    return {
      platform: slug,
      window_hours: window,
      sample_count: snapshots.length,
      first: this.trendPoint(first),
      latest: this.trendPoint(last),
      change: {
        gmv: this.delta(first.gmv, last.gmv),
        revenue: this.delta(first.revenue, last.revenue),
        active_users: this.delta(first.activeUsers, last.activeUsers),
      },
      points: snapshots.map((s) => this.trendPoint(s)),
    };
  }

  private async getPlatformHealth(slug?: string) {
    const platforms = await this.prisma.platform.findMany({
      where: slug ? { slug } : undefined,
      orderBy: { sortOrder: 'asc' },
      include: {
        connections: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            environment: true,
            baseUrl: true,
            connectionStatus: true,
            lastCheckedAt: true,
            lastError: true,
          },
        },
        healthLogs: {
          orderBy: { checkedAt: 'desc' },
          take: 5,
          select: { checkedAt: true, status: true, responseTimeMs: true, errorDetail: true },
        },
        syncJobs: {
          orderBy: { startedAt: 'desc' },
          take: 3,
          select: { jobType: true, status: true, startedAt: true },
        },
      },
    });

    // Ambil sumber kredensial sebenarnya (tabel koneksi ATAU env var), lalu
    // buktikan hidup-matinya dengan satu panggilan KPI nyata. Status koneksi
    // di database saja tidak cukup — Matcha & NotaBe dicolok lewat env.
    const probes = await Promise.all(
      platforms.map(async (p) => ({
        slug: p.slug,
        config: await this.kpi.describeConfig(p.slug),
        kpiReachable: (await this.kpi.fetchKpi(p.slug, 'today')) !== null,
      })),
    );
    const probeBySlug = Object.fromEntries(probes.map((pr) => [pr.slug, pr]));

    return {
      platforms: platforms.map((p) => ({
        platform: p.slug,
        name: p.name,
        readiness: p.readinessStatus,
        // Sumber kebenaran: apakah KPI benar-benar bisa ditarik BARUSAN.
        kpi_reachable: probeBySlug[p.slug]?.kpiReachable ?? false,
        credentials: probeBySlug[p.slug]?.config ?? { source: 'none' },
        connection: p.connections[0]
          ? {
              environment: p.connections[0].environment,
              base_url: p.connections[0].baseUrl,
              status: p.connections[0].connectionStatus,
              last_checked: p.connections[0].lastCheckedAt?.toISOString() ?? null,
              last_error: p.connections[0].lastError,
            }
          : {
              status: 'no_connection_row',
              note: 'Tidak ada baris di platform_connections. Ini NORMAL kalau credentials.source = "env" — lihat kpi_reachable untuk status sebenarnya.',
            },
        recent_health: p.healthLogs.map((h) => ({
          at: h.checkedAt.toISOString(),
          status: h.status,
          response_ms: h.responseTimeMs,
          error: h.errorDetail,
        })),
        recent_jobs: p.syncJobs.map((j) => ({
          type: j.jobType,
          status: j.status,
          started_at: j.startedAt.toISOString(),
        })),
      })),
    };
  }

  private async getAlerts(args: Record<string, unknown>) {
    const alerts = await this.prisma.automationAlert.findMany({
      where: {
        ...(args.status ? { status: this.str(args.status) } : {}),
        ...(args.severity ? { severity: this.str(args.severity) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(this.int(args.limit, 20), 100),
      include: { platform: { select: { slug: true } } },
    });

    return {
      count: alerts.length,
      alerts: alerts.map((a) => ({
        id: a.id,
        platform: a.platform?.slug ?? null,
        type: a.alertType,
        severity: a.severity,
        status: a.status,
        title: a.title,
        message: a.message,
        created_at: a.createdAt.toISOString(),
      })),
    };
  }

  private async getFinanceSummary() {
    const [snapshots, liveKpi] = await Promise.all([
      this.prisma.financialSnapshot.findMany({ orderBy: { periodStart: 'desc' }, take: 6 }),
      this.kpi.fetchAllKpi('month'),
    ]);

    const liveRevenue: Record<string, unknown> = {};
    for (const [slug, payload] of Object.entries(liveKpi)) {
      const overview = (payload as { overview?: Record<string, unknown> })?.overview;
      if (overview) {
        liveRevenue[slug] = {
          gmv: overview.gmv ?? null,
          revenue: overview.revenue ?? null,
        };
      }
    }

    return {
      manual_snapshots: snapshots.map((s) => ({
        period: `${s.periodStart.toISOString().slice(0, 10)} ~ ${s.periodEnd.toISOString().slice(0, 10)}`,
        revenue: s.revenueTotal,
        expense: s.expenseTotal,
        profit:
          s.revenueTotal && s.expenseTotal
            ? Number(s.revenueTotal) - Number(s.expenseTotal)
            : null,
        notes: s.notes,
      })),
      live_month_to_date: liveRevenue,
      note: 'manual_snapshots diinput founder. live_month_to_date diambil realtime dari backend tiap platform (periode: month).',
    };
  }

  private async getOperationsSummary() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

    const [content, conversations, accounts, scheduledToday] = await Promise.all([
      this.prisma.contentItem.groupBy({ by: ['status'], _count: true }),
      this.prisma.helpdeskConversation.groupBy({ by: ['status'], _count: true }),
      this.prisma.socialAccount.findMany({
        where: { isActive: true },
        select: { channelType: true, platform: { select: { slug: true } } },
      }),
      this.prisma.contentItem.findMany({
        where: { scheduledAt: { gte: startOfDay, lt: endOfDay } },
        select: { id: true, title: true, status: true, scheduledAt: true, platform: { select: { slug: true } } },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    return {
      content_by_status: Object.fromEntries(content.map((c) => [c.status, c._count])),
      helpdesk_by_status: Object.fromEntries(conversations.map((c) => [c.status, c._count])),
      active_social_accounts: accounts.map((a) => ({
        platform: a.platform.slug,
        channel: a.channelType,
      })),
      scheduled_today: scheduledToday.map((c) => ({
        id: c.id,
        platform: c.platform.slug,
        title: c.title,
        status: c.status,
        scheduled_at: c.scheduledAt?.toISOString() ?? null,
      })),
    };
  }

  // ── Implementasi tool: WRITE ──────────────────────────────────

  private async createAlert(args: Record<string, unknown>) {
    const platformId = args.platform ? await this.platformId(this.str(args.platform)) : null;

    const alert = await this.prisma.automationAlert.create({
      data: {
        platformId,
        alertType: 'agent_finding',
        severity: this.str(args.severity ?? 'info'),
        title: this.str(args.title).slice(0, 200),
        message: this.str(args.message),
        metadata: { source: 'agent' },
        status: 'pending',
      },
    });

    return { created: true, alert_id: alert.id, severity: alert.severity, title: alert.title };
  }

  private async recordFinanceSnapshot(args: Record<string, unknown>) {
    const snap = await this.prisma.financialSnapshot.create({
      data: {
        periodStart: new Date(this.str(args.period_start)),
        periodEnd: new Date(this.str(args.period_end)),
        revenueTotal: args.revenue_total != null ? Number(args.revenue_total) : null,
        expenseTotal: args.expense_total != null ? Number(args.expense_total) : null,
        notes: args.notes ? this.str(args.notes) : null,
        source: 'agent',
      },
    });

    return {
      created: true,
      snapshot_id: snap.id,
      period: `${snap.periodStart.toISOString().slice(0, 10)} ~ ${snap.periodEnd.toISOString().slice(0, 10)}`,
    };
  }

  private async draftContent(args: Record<string, unknown>) {
    const platformId = await this.platformId(this.str(args.platform));
    if (!platformId) throw new Error(`Platform '${this.str(args.platform)}' tidak ditemukan.`);

    const item = await this.prisma.contentItem.create({
      data: {
        platformId,
        title: args.title ? this.str(args.title).slice(0, 200) : null,
        caption: this.str(args.caption),
        mediaType: 'image',
        mediaUrls: [],
        status: 'draft',
        createdBy: 'agent',
      },
    });

    return {
      created: true,
      content_id: item.id,
      status: item.status,
      note: 'Masih draft. Perlu ditinjau kapten di Content Studio sebelum dijadwalkan.',
    };
  }

  // ── Implementasi tool: SENSITIVE ──────────────────────────────

  private async scheduleContent(args: Record<string, unknown>) {
    const scheduledAt = new Date(this.str(args.scheduled_at));
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error(`scheduled_at '${this.str(args.scheduled_at)}' bukan tanggal ISO yang valid.`);
    }

    const item = await this.prisma.contentItem.update({
      where: { id: this.str(args.content_id) },
      data: { status: 'scheduled', scheduledAt },
    });

    return {
      scheduled: true,
      content_id: item.id,
      scheduled_at: item.scheduledAt?.toISOString() ?? null,
    };
  }

  private async escalateConversation(args: Record<string, unknown>) {
    const conversationId = this.str(args.conversation_id);

    const escalation = await this.prisma.helpdeskEscalation.create({
      data: { conversationId, reason: this.str(args.reason).slice(0, 50) },
    });
    await this.prisma.helpdeskConversation.update({
      where: { id: conversationId },
      data: { status: 'escalated' },
    });

    return { escalated: true, escalation_id: escalation.id, conversation_id: conversationId };
  }

  private async setPlatformReadiness(args: Record<string, unknown>) {
    const platform = await this.prisma.platform.update({
      where: { slug: this.str(args.platform) },
      data: { readinessStatus: this.str(args.status) },
    });
    return { updated: true, platform: platform.slug, readiness: platform.readinessStatus };
  }

  // ── helpers ───────────────────────────────────────────────────

  private async platformId(slug: string): Promise<string | null> {
    const p = await this.prisma.platform.findUnique({ where: { slug }, select: { id: true } });
    return p?.id ?? null;
  }

  private trendPoint(s: {
    capturedAt: Date;
    gmv: unknown;
    revenue: unknown;
    activeUsers: number | null;
  }) {
    return {
      at: s.capturedAt.toISOString(),
      gmv: s.gmv != null ? Number(s.gmv) : null,
      revenue: s.revenue != null ? Number(s.revenue) : null,
      active_users: s.activeUsers,
    };
  }

  private delta(from: unknown, to: unknown) {
    if (from == null || to == null) return null;
    const a = Number(from);
    const b = Number(to);
    return {
      from: a,
      to: b,
      absolute: b - a,
      percent: a === 0 ? null : Number((((b - a) / a) * 100).toFixed(2)),
    };
  }

  private str(v: unknown): string {
    return typeof v === 'string' ? v : String(v ?? '');
  }

  private int(v: unknown, fallback: number): number {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }

  private period(v: unknown): Period {
    const p = this.str(v);
    return (PERIODS.includes(p) ? p : 'today') as Period;
  }

  /**
   * Prisma Json field menolak `undefined` dan `null` telanjang — normalkan
   * lewat serialisasi, lalu bungkus kalau hasilnya bukan object.
   */
  private asJson(data: unknown): object {
    const normalized: unknown = JSON.parse(JSON.stringify(data ?? null));
    return normalized !== null && typeof normalized === 'object'
      ? (normalized as object)
      : { value: normalized };
  }
}
