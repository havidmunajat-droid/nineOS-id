import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformKpiService } from '../platforms/platform-kpi.service';
import { AgentRunnerService } from '../agent/agent-runner.service';

const TZ = 'Asia/Jakarta';

/** Bentuk minimum payload KPI yang disepakati semua platform. */
interface KpiPayload {
  overview?: {
    gmv?: number;
    revenue?: number;
    active_users?: number;
    new_registrations?: number;
  };
}

export interface Anomaly {
  platformSlug: string;
  severity: 'warning' | 'critical';
  alertType: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
}

/**
 * Agent proaktif NineOS.
 *
 * - Tiap jam: rekam snapshot KPI semua platform, lalu jalankan deteksi anomali.
 *   Deteksi sengaja DETERMINISTIK (bukan AI) supaya murah, konsisten, dan tidak
 *   pernah berhalusinasi soal angka. AI dipakai untuk menafsirkan, bukan mendeteksi.
 * - Tiap pagi 07:00 WIB: CEO agent menyusun briefing dan menyimpannya sebagai
 *   sesi Virtual Office, jadi kapten tinggal membuka dashboard.
 */
@Injectable()
export class PlatformWatcherService {
  private readonly logger = new Logger(PlatformWatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kpi: PlatformKpiService,
    private readonly agent: AgentRunnerService,
  ) {}

  // ── Cron ──────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR, { name: 'kpi-snapshot', timeZone: TZ })
  async hourlyTick() {
    if (process.env.AGENT_WATCHER === 'off') return;
    try {
      const result = await this.captureAndDetect();
      this.logger.log(
        `Watcher: ${result.captured} snapshot, ${result.anomalies.length} anomali, ${result.alerts_created} alert baru`,
      );
    } catch (err) {
      this.logger.error(`Watcher gagal: ${err instanceof Error ? err.message : err}`);
    }
  }

  @Cron('0 7 * * *', { name: 'morning-briefing', timeZone: TZ })
  async morningTick() {
    if (process.env.AGENT_WATCHER === 'off') return;
    try {
      const session = await this.generateBriefing();
      this.logger.log(`Briefing pagi tersimpan: session ${session.session_id}`);
    } catch (err) {
      this.logger.error(`Briefing pagi gagal: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Snapshot + deteksi ────────────────────────────────────────

  async captureAndDetect() {
    const platforms = await this.prisma.platform.findMany({
      select: { id: true, slug: true, readinessStatus: true },
      orderBy: { sortOrder: 'asc' },
    });

    const anomalies: Anomaly[] = [];
    let captured = 0;

    for (const platform of platforms) {
      const payload = (await this.kpi.fetchKpi(platform.slug, 'today')) as KpiPayload | null;

      if (!payload) {
        // Platform yang memang belum siap bukan anomali — jangan bising.
        if (platform.readinessStatus === 'ready') {
          anomalies.push({
            platformSlug: platform.slug,
            severity: 'critical',
            alertType: 'platform_unreachable',
            title: `${platform.slug}: KPI tidak bisa diambil`,
            message: `Platform '${platform.slug}' berstatus ready tapi endpoint /nineos/kpi tidak menjawab. Kemungkinan backend mati, URL berubah, atau X-NineOS-Key ditolak.`,
            metadata: { checked_at: new Date().toISOString() },
          });
        }
        continue;
      }

      const overview = payload.overview ?? {};
      const previous = await this.prisma.platformKpiSnapshot.findFirst({
        where: { platformSlug: platform.slug, period: 'today' },
        orderBy: { capturedAt: 'desc' },
      });

      await this.prisma.platformKpiSnapshot.create({
        data: {
          platformId: platform.id,
          platformSlug: platform.slug,
          period: 'today',
          gmv: overview.gmv != null ? overview.gmv : null,
          revenue: overview.revenue != null ? overview.revenue : null,
          activeUsers: overview.active_users != null ? Math.trunc(overview.active_users) : null,
          payload: payload as object,
        },
      });
      captured += 1;

      anomalies.push(...this.detectAgainstPrevious(platform.slug, overview, previous));
      anomalies.push(...(await this.detectAgainstYesterday(platform.slug, overview)));
    }

    let alertsCreated = 0;
    for (const anomaly of anomalies) {
      if (await this.recordAlert(anomaly)) alertsCreated += 1;
    }

    return { captured, anomalies, alerts_created: alertsCreated };
  }

  /**
   * Metrik periode 'today' bersifat kumulatif — sepanjang hari nilainya hanya
   * boleh naik. Kalau turun, ada yang tidak beres (refund massal, order
   * dibatalkan borongan, atau data platform ter-reset).
   */
  private detectAgainstPrevious(
    slug: string,
    overview: NonNullable<KpiPayload['overview']>,
    previous: { capturedAt: Date; gmv: unknown; revenue: unknown } | null,
  ): Anomaly[] {
    if (!previous) return [];
    // Snapshot dari hari kemarin tidak sebanding — 'today' sudah reset.
    if (!this.isSameJakartaDay(previous.capturedAt, new Date())) return [];

    const found: Anomaly[] = [];
    for (const metric of ['gmv', 'revenue'] as const) {
      const before = previous[metric] != null ? Number(previous[metric]) : null;
      const now = overview[metric] != null ? Number(overview[metric]) : null;
      if (before == null || now == null || before <= 0) continue;
      if (now >= before) continue;

      const dropPct = Number((((before - now) / before) * 100).toFixed(2));
      if (dropPct < 10) continue; // abaikan koreksi kecil

      found.push({
        platformSlug: slug,
        severity: dropPct >= 30 ? 'critical' : 'warning',
        alertType: `cumulative_drop_${metric}`,
        title: `${slug}: ${metric} hari ini TURUN ${dropPct}%`,
        message: `Nilai ${metric} kumulatif hari ini turun dari ${before.toLocaleString('id-ID')} menjadi ${now.toLocaleString('id-ID')} (-${dropPct}%). Metrik kumulatif seharusnya tidak pernah turun dalam hari yang sama — cek kemungkinan refund, pembatalan massal, atau masalah data di backend ${slug}.`,
        metadata: { metric, before, now, drop_percent: dropPct },
      });
    }
    return found;
  }

  /**
   * Bandingkan capaian jam ini dengan capaian PADA JAM YANG SAMA kemarin.
   * Ini pembanding yang adil — tidak menghukum platform hanya karena hari
   * masih pagi.
   */
  private async detectAgainstYesterday(
    slug: string,
    overview: NonNullable<KpiPayload['overview']>,
  ): Promise<Anomaly[]> {
    const now = new Date();
    const yesterdaySameHour = new Date(now.getTime() - 86_400_000);

    const reference = await this.prisma.platformKpiSnapshot.findFirst({
      where: {
        platformSlug: slug,
        period: 'today',
        capturedAt: {
          gte: new Date(yesterdaySameHour.getTime() - 90 * 60_000),
          lte: new Date(yesterdaySameHour.getTime() + 90 * 60_000),
        },
      },
      orderBy: { capturedAt: 'desc' },
    });
    if (!reference) return [];

    const found: Anomaly[] = [];
    for (const metric of ['gmv', 'revenue'] as const) {
      const before = reference[metric] != null ? Number(reference[metric]) : null;
      const current = overview[metric] != null ? Number(overview[metric]) : null;
      if (before == null || current == null) continue;
      // Baseline terlalu kecil → persentase jadi menyesatkan.
      if (before < 50_000) continue;
      if (current >= before * 0.5) continue;

      const dropPct = Number((((before - current) / before) * 100).toFixed(2));
      found.push({
        platformSlug: slug,
        severity: 'warning',
        alertType: `daily_shortfall_${metric}`,
        title: `${slug}: ${metric} jauh di bawah kemarin (-${dropPct}%)`,
        message: `Pada jam yang sama kemarin, ${metric} ${slug} sudah ${before.toLocaleString('id-ID')}. Hari ini baru ${current.toLocaleString('id-ID')} (-${dropPct}%). Perlu dicek apakah ini pola normal (mis. akhir pekan) atau ada masalah nyata.`,
        metadata: {
          metric,
          yesterday_same_hour: before,
          today: current,
          drop_percent: dropPct,
          reference_at: reference.capturedAt.toISOString(),
        },
      });
    }
    return found;
  }

  /**
   * Simpan alert, tapi jangan spam: satu jenis anomali per platform maksimal
   * satu alert pending dalam 6 jam.
   */
  private async recordAlert(anomaly: Anomaly): Promise<boolean> {
    const platform = await this.prisma.platform.findUnique({
      where: { slug: anomaly.platformSlug },
      select: { id: true },
    });

    const duplicate = await this.prisma.automationAlert.findFirst({
      where: {
        platformId: platform?.id ?? null,
        alertType: anomaly.alertType,
        status: 'pending',
        createdAt: { gte: new Date(Date.now() - 6 * 3600_000) },
      },
    });
    if (duplicate) return false;

    await this.prisma.automationAlert.create({
      data: {
        platformId: platform?.id ?? null,
        alertType: anomaly.alertType,
        severity: anomaly.severity,
        title: anomaly.title.slice(0, 200),
        message: anomaly.message,
        metadata: { ...anomaly.metadata, source: 'watcher' },
        status: 'pending',
      },
    });
    return true;
  }

  // ── Briefing pagi (AI) ────────────────────────────────────────

  async generateBriefing() {
    const ceo = await this.prisma.executive.findUnique({ where: { roleCode: 'CEO' } });
    if (!ceo) throw new Error("Executive 'CEO' belum di-seed.");

    const session = await this.prisma.executiveSession.create({
      data: {
        mode: 'meeting',
        title: `Briefing Pagi — ${this.jakartaDateLabel(new Date())}`,
        participantExecutiveIds: [ceo.id],
        status: 'active',
        startedAt: new Date(),
      },
    });

    const instruction = [
      'Susun briefing pagi untuk kapten.',
      'Wajib: tarik KPI live semua platform, cek alert yang masih pending, dan lihat status kesehatan platform.',
      'Struktur jawaban:',
      '1. Ringkasan satu paragraf — kondisi bisnis pagi ini.',
      '2. Angka kunci per platform yang datanya tersedia (sebut platform yang datanya TIDAK tersedia beserta dugaan penyebabnya).',
      '3. Hal yang perlu perhatian — kaitkan dengan alert pending kalau ada.',
      '4. Maksimal 3 rekomendasi tindakan hari ini, urut dari yang paling berdampak.',
      'Jangan membuat alert baru kecuali kamu menemukan sesuatu yang benar-benar mendesak dan belum ada di daftar alert.',
    ].join('\n');

    await this.prisma.executiveMessage.create({
      data: { sessionId: session.id, senderType: 'founder', messageText: instruction },
    });

    const run = await this.agent.run({
      systemPrompt: `${ceo.systemPrompt}

Kamu CEO NineOS. Ini briefing pagi OTOMATIS — kapten belum tentu sedang membaca, jadi tulis lengkap dan mandiri. Bahasa Indonesia, berbasis angka nyata dari tool. Jangan pernah mengarang angka; kalau data tidak tersedia, katakan dan sebutkan dugaan penyebabnya. Format rupiah dengan pemisah ribuan.`,
      history: [],
      userMessage: instruction,
      roleCode: 'CEO',
      preferredModel: ceo.aiModel,
      context: { sessionId: session.id, executiveRole: 'CEO', origin: 'watcher' },
      maxIterations: 8,
    });

    await this.prisma.executiveMessage.create({
      data: {
        sessionId: session.id,
        senderType: 'executive',
        speakerExecutiveId: ceo.id,
        messageText: run.text,
        contextData: {
          provider: run.provider,
          iterations: run.iterations,
          tool_calls: run.tool_calls,
        } as object,
      },
    });

    await this.prisma.executiveSession.update({
      where: { id: session.id },
      data: { status: 'completed', endedAt: new Date(), summary: run.text.slice(0, 1000) },
    });

    return {
      session_id: session.id,
      title: session.title,
      briefing: run.text,
      tool_calls: run.tool_calls,
      provider: run.provider,
    };
  }

  // ── helpers ───────────────────────────────────────────────────

  private isSameJakartaDay(a: Date, b: Date): boolean {
    return this.jakartaDateKey(a) === this.jakartaDateKey(b);
  }

  private jakartaDateKey(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  private jakartaDateLabel(d: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: TZ,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  }
}
