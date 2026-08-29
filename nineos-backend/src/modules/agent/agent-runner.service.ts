import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AIService, AIChatMessage } from '../../common/ai/ai.service';
import { AgentToolsService } from './agent-tools.service';
import { AgentExecutionContext, AgentRunResult } from '../../common/agent/agent.types';

const TZ = 'Asia/Jakarta';

export interface RunAgentInput {
  systemPrompt: string;
  history: AIChatMessage[];
  userMessage: string;
  /** Role C-Level penentu tool apa yang boleh dipakai. Kosong = semua tool read. */
  roleCode?: string;
  preferredModel?: string;
  context: AgentExecutionContext;
  maxIterations?: number;
}

@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIService,
    private readonly tools: AgentToolsService,
  ) {}

  async run(input: RunAgentInput): Promise<AgentRunResult> {
    const tools = input.roleCode
      ? this.tools.toolsForRole(input.roleCode)
      : this.tools.allTools().filter((t) => t.risk === 'read');

    return this.ai.runAgent({
      systemPrompt: `${input.systemPrompt}\n\n${this.clockBlock()}`,
      history: input.history,
      userMessage: input.userMessage,
      tools,
      preferredModel: input.preferredModel,
      maxIterations: input.maxIterations,
      dispatch: (call) => this.tools.dispatch(call, input.context),
    });
  }

  /**
   * Model tidak tahu hari ini tanggal berapa. Tanpa ini, permintaan seperti
   * "jadwalkan besok jam 19:00" diterjemahkan ke tanggal ngawur dari masa
   * pelatihannya. Selalu suntikkan jam dinding WIB ke setiap agent run.
   */
  private clockBlock(): string {
    const now = new Date();
    const label = new Intl.DateTimeFormat('id-ID', {
      timeZone: TZ,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);

    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    );
    const todayIso = `${parts.year}-${parts.month}-${parts.day}`;
    const tomorrow = new Date(`${todayIso}T00:00:00+07:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().slice(0, 10);

    return `## Waktu sekarang
Sekarang ${label} WIB (UTC+7).
- Hari ini = ${todayIso}
- Besok = ${tomorrowIso}
Setiap kali kamu mengisi parameter tanggal/waktu, HITUNG dari acuan di atas — jangan pernah menebak tahun atau tanggal dari ingatanmu. Format ISO 8601 dengan offset +07:00, contoh: ${tomorrowIso}T19:00:00+07:00`;
  }

  // ── Antrian persetujuan aksi sensitif ────────────────────────

  async listActions(status?: string, limit = 50) {
    const actions = await this.prisma.agentAction.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
    return { count: actions.length, data: actions.map((a) => this.format(a)) };
  }

  async approveAction(id: string, decidedBy = 'founder') {
    const action = await this.prisma.agentAction.findUnique({ where: { id } });
    if (!action) throw new NotFoundException(`Aksi '${id}' tidak ditemukan`);
    if (action.status !== 'pending_approval') {
      throw new BadRequestException(`Aksi ini sudah berstatus '${action.status}', tidak bisa disetujui lagi`);
    }

    const startedAt = Date.now();
    try {
      const result = await this.tools.execute(
        action.toolName,
        action.args as Record<string, unknown>,
      );
      const updated = await this.prisma.agentAction.update({
        where: { id },
        data: {
          status: 'executed',
          result: this.asJson(result),
          durationMs: Date.now() - startedAt,
          decidedAt: new Date(),
          decidedBy,
        },
      });
      return this.format(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Approve aksi '${action.toolName}' gagal: ${message}`);
      const updated = await this.prisma.agentAction.update({
        where: { id },
        data: {
          status: 'failed',
          error: message,
          durationMs: Date.now() - startedAt,
          decidedAt: new Date(),
          decidedBy,
        },
      });
      return this.format(updated);
    }
  }

  async rejectAction(id: string, decidedBy = 'founder') {
    const action = await this.prisma.agentAction.findUnique({ where: { id } });
    if (!action) throw new NotFoundException(`Aksi '${id}' tidak ditemukan`);
    if (action.status !== 'pending_approval') {
      throw new BadRequestException(`Aksi ini sudah berstatus '${action.status}', tidak bisa ditolak`);
    }

    const updated = await this.prisma.agentAction.update({
      where: { id },
      data: { status: 'rejected', decidedAt: new Date(), decidedBy },
    });
    return this.format(updated);
  }

  private format(a: {
    id: string;
    sessionId: string | null;
    executiveRole: string | null;
    toolName: string;
    riskLevel: string;
    status: string;
    args: unknown;
    result: unknown;
    error: string | null;
    durationMs: number | null;
    decidedAt: Date | null;
    decidedBy: string | null;
    createdAt: Date;
  }) {
    return {
      id: a.id,
      session_id: a.sessionId,
      executive_role: a.executiveRole,
      tool: a.toolName,
      risk: a.riskLevel,
      status: a.status,
      args: a.args,
      result: a.result,
      error: a.error,
      duration_ms: a.durationMs,
      decided_at: a.decidedAt?.toISOString() ?? null,
      decided_by: a.decidedBy,
      created_at: a.createdAt.toISOString(),
    };
  }

  private asJson(data: unknown): object {
    const normalized: unknown = JSON.parse(JSON.stringify(data ?? null));
    return normalized !== null && typeof normalized === 'object'
      ? (normalized as object)
      : { value: normalized };
  }
}
