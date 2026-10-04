import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformKpiService } from '../platforms/platform-kpi.service';
import { AgentRunnerService } from '../agent/agent-runner.service';
import { AgentRunResult } from '../../common/agent/agent.types';

const TZ = 'Asia/Jakarta';

/** Sebelum 4 Okt 2026 bernama 'Briefing Pagi' (07:00 WIB). */
const BRIEFING_TITLE = 'Laporan Malam';

/** Bentuk minimum payload KPI yang disepakati semua platform. */
interface KpiPayload {
  overview?: {
    gmv?: number;
    revenue?: number;
    active_users?: number;
    new_registrations?: number;
  };
  /**
   * Opsional. Daftar hal yang menurut platform itu sendiri perlu tindakan
   * manusia sekarang (mis. SOS terbuka di Krama). Platform yang paling tahu
   * apa yang genting di bisnisnya — NineOS cukup meneruskannya jadi alert.
   */
  attention?: Array<{
    code: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
  }>;
}

/** Awalan alertType untuk alert yang berasal dari blok `attention` platform. */
const ATTENTION_PREFIX = 'platform_attention:';

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
 * - Tiap malam 22:00 WIB: CEO agent menyusun laporan harian dan menyimpannya sebagai
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

  // 22:00 WIB dipilih kapten (4 Okt 2026). Bonusnya: = 15:00 UTC, jauh dari
  // 00:00 UTC (07:00 WIB) yang terbukti jam sibuk global Gemini, dan NotaBe
  // sudah melewati sebagian besar jam ramainya (20:00–23:00 WIB).
  @Cron('0 22 * * *', { name: 'nightly-briefing', timeZone: TZ })
  async nightlyTick() {
    if (process.env.AGENT_WATCHER === 'off') return;
    try {
      const session = await this.generateBriefing();
      this.logger.log(`Laporan malam tersimpan: session ${session.session_id}`);
    } catch (err) {
      this.logger.error(`Laporan malam gagal: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Snapshot + deteksi ────────────────────────────────────────

  async captureAndDetect() {
    const platforms = await this.prisma.platform.findMany({
      where: { readinessStatus: { not: 'archived' } },
      select: { id: true, slug: true, readinessStatus: true },
      orderBy: { sortOrder: 'asc' },
    });

    const anomalies: Anomaly[] = [];
    let captured = 0;
    let attentionCreated = 0;

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

      if (Array.isArray(payload.attention)) {
        attentionCreated += await this.syncPlatformAttention(platform.id, platform.slug, payload.attention);
      }
    }

    let alertsCreated = 0;
    for (const anomaly of anomalies) {
      if (await this.recordAlert(anomaly)) alertsCreated += 1;
    }

    return { captured, anomalies, alerts_created: alertsCreated + attentionCreated };
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

    // Tiap platform punya batas hari sendiri dan kita TIDAK tahu batasnya.
    // Terbukti di produksi: NotaBe mereset 'today' pada UTC 00:00 (07:00 WIB),
    // bukan tengah malam WIB. Menebak batas dari sisi kita selalu salah untuk
    // sebagian platform, jadi anggap perbandingan tidak sah kalau dua snapshot
    // melewati pergantian hari mana pun — WIB ATAU UTC.
    if (this.straddlesDayBoundary(previous.capturedAt, new Date())) return [];

    const found: Anomaly[] = [];
    for (const metric of ['gmv', 'revenue'] as const) {
      const before = previous[metric] != null ? Number(previous[metric]) : null;
      const now = overview[metric] != null ? Number(overview[metric]) : null;
      if (before == null || now == null || before <= 0) continue;
      if (now >= before) continue;

      // Jatuh ke TEPAT nol dari nilai positif adalah tanda tangan pergantian
      // periode, bukan kejadian bisnis. Refund massal sekalipun hampir mustahil
      // membawa kumulatif ke persis nol. Ini jaring pengaman kedua untuk
      // platform yang batas harinya tidak kita kenali.
      if (now === 0) continue;

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
    // Tepat setelah counter platform reset, angkanya belum sebanding dengan
    // capaian sehari penuh kemarin — "baru 0" pada jam pertama itu wajar,
    // bukan kabar buruk. Beri jeda sampai periode berjalan cukup lama.
    const hoursSinceReset = await this.hoursSinceLastReset(slug);
    if (hoursSinceReset !== null && hoursSinceReset < 8) return [];

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
  /**
   * Sinkronkan blok `attention` platform dengan tabel alert.
   *
   * - Kondisi baru → buat alert.
   * - Kondisi masih ada → JANGAN buat alert baru tiap jam; perbarui judul &
   *   pesan alert yang sudah ada (mis. umur order tertahan bertambah).
   * - Kondisi sudah hilang di sisi platform → alert-nya ditutup otomatis.
   *   Dengan begitu dashboard selalu mencerminkan keadaan sekarang, bukan
   *   tumpukan riwayat yang harus dibersihkan manual.
   */
  private async syncPlatformAttention(
    platformId: string,
    slug: string,
    items: NonNullable<KpiPayload['attention']>,
  ): Promise<number> {
    let created = 0;
    const activeTypes = new Set<string>();

    for (const item of items) {
      if (!item?.code || !item?.title) continue;
      const alertType = `${ATTENTION_PREFIX}${item.code}`.slice(0, 50);
      activeTypes.add(alertType);
      const severity = ['info', 'warning', 'critical'].includes(item.severity) ? item.severity : 'info';

      const existing = await this.prisma.automationAlert.findFirst({
        where: { platformId, alertType, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        await this.prisma.automationAlert.update({
          where: { id: existing.id },
          data: {
            severity,
            title: `${slug}: ${item.title}`.slice(0, 200),
            message: item.message,
            metadata: { source: 'platform_attention', code: item.code, last_seen: new Date().toISOString() },
          },
        });
        continue;
      }

      await this.prisma.automationAlert.create({
        data: {
          platformId,
          alertType,
          severity,
          title: `${slug}: ${item.title}`.slice(0, 200),
          message: item.message,
          metadata: { source: 'platform_attention', code: item.code, last_seen: new Date().toISOString() },
          status: 'pending',
        },
      });
      created += 1;
    }

    await this.prisma.automationAlert.updateMany({
      where: {
        platformId,
        status: 'pending',
        alertType: { startsWith: ATTENTION_PREFIX, notIn: [...activeTypes] },
      },
      data: { status: 'resolved' },
    });

    return created;
  }

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

  // ── Laporan malam (AI) ────────────────────────────────────────

  /**
   * Coba ulang briefing yang gagal pagi ini, di sesi yang SAMA (tidak membuat
   * sesi baru, jadi dashboard tidak dipenuhi duplikat). Gangguan provider AI
   * 00:00 UTC — jam sibuk global provider AI — jadi 30–90 menit kemudian
   * peluang berhasilnya jauh lebih besar.
   */
  @Cron('30 22,23 * * *', { name: 'nightly-briefing-retry', timeZone: TZ })
  async retryFailedBriefing() {
    if (process.env.AGENT_WATCHER === 'off') return;
    const title = `${BRIEFING_TITLE} — ${this.jakartaDateLabel(new Date())}`;
    const failed = await this.prisma.executiveSession.findFirst({
      where: { title, status: 'failed' },
      orderBy: { createdAt: 'desc' },
    });
    if (!failed) return;

    try {
      const result = await this.generateBriefing(failed.id);
      this.logger.log(
        `Ulang laporan malam: ${result.failed ? 'masih gagal' : 'berhasil'} (session ${result.session_id})`,
      );
    } catch (err) {
      this.logger.error(`Ulang laporan malam gagal: ${err instanceof Error ? err.message : err}`);
    }
  }

  async generateBriefing(retrySessionId?: string) {
    const ceo = await this.prisma.executive.findUnique({ where: { roleCode: 'CEO' } });
    if (!ceo) throw new Error("Executive 'CEO' belum di-seed.");

    if (retrySessionId) {
      // Buang pesan kegagalan sebelumnya; instruksi founder dipakai ulang.
      await this.prisma.executiveMessage.deleteMany({
        where: { sessionId: retrySessionId, senderType: 'executive' },
      });
      await this.prisma.executiveMessage.deleteMany({
        where: { sessionId: retrySessionId, senderType: 'founder' },
      });
    }

    const session = retrySessionId
      ? await this.prisma.executiveSession.update({
          where: { id: retrySessionId },
          data: { status: 'active', endedAt: null, summary: null },
        })
      : await this.prisma.executiveSession.create({
          data: {
            mode: 'meeting',
            title: `${BRIEFING_TITLE} — ${this.jakartaDateLabel(new Date())}`,
            participantExecutiveIds: [ceo.id],
            status: 'active',
            startedAt: new Date(),
          },
        });

    const instruction = [
      'Susun laporan malam untuk kapten — rangkuman hari ini.',
      'Wajib: tarik KPI live semua platform, cek alert yang masih pending, dan lihat status kesehatan platform.',
      'Struktur jawaban:',
      '1. Ringkasan satu paragraf — kondisi bisnis hari ini.',
      '2. Angka kunci per platform yang datanya tersedia (sebut platform yang datanya TIDAK tersedia beserta dugaan penyebabnya).',
      '3. Hal yang perlu perhatian — kaitkan dengan alert pending kalau ada.',
      '4. Maksimal 3 rekomendasi tindakan untuk besok, urut dari yang paling berdampak.',
      'Jangan membuat alert baru kecuali kamu menemukan sesuatu yang benar-benar mendesak dan belum ada di daftar alert.',
    ].join('\n');

    await this.prisma.executiveMessage.create({
      data: { sessionId: session.id, senderType: 'founder', messageText: instruction },
    });

    // Kalau agent gagal (paling sering: kuota provider habis), sesi TIDAK boleh
    // ditinggalkan menggantung berstatus 'active' dengan pesan founder tanpa
    // balasan — itu menumpuk jadi sampah di dashboard dan kapten tidak tahu
    // kenapa. Tulis sebab kegagalannya sebagai pesan, lalu tutup sesinya.
    let run: AgentRunResult;
    try {
      run = await this.runBriefingAgent(ceo, instruction, session.id);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const notice = `Laporan malam tidak bisa disusun.\n\nSebab: ${reason}\n\nNineOS akan mencoba ulang otomatis pukul 22:30 dan 23:30 WIB. Watcher tetap merekam KPI tiap jam, jadi tidak ada data yang hilang.`;

      await this.prisma.executiveMessage.create({
        data: {
          sessionId: session.id,
          senderType: 'executive',
          speakerExecutiveId: ceo.id,
          messageText: notice,
          contextData: { failed: true, reason } as object,
        },
      });
      await this.prisma.executiveSession.update({
        where: { id: session.id },
        // 'failed', bukan 'completed' — supaya retryFailedBriefing() bisa
        // menemukannya, dan dashboard bisa membedakan briefing kosong dari jadi.
        data: { status: 'failed', endedAt: new Date(), summary: notice.slice(0, 1000) },
      });

      this.logger.warn(`Laporan malam gagal disusun: ${reason}`);
      return {
        session_id: session.id,
        title: session.title,
        briefing: notice,
        tool_calls: [],
        provider: 'none',
        failed: true,
      };
    }

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
      failed: false,
    };
  }

  private runBriefingAgent(
    ceo: { id: string; systemPrompt: string; aiModel: string },
    instruction: string,
    sessionId: string,
  ): Promise<AgentRunResult> {
    return this.agent.run({
      systemPrompt: `${ceo.systemPrompt}

Kamu CEO NineOS. Ini laporan malam OTOMATIS — kapten belum tentu sedang membaca, jadi tulis lengkap dan mandiri. Bahasa Indonesia, berbasis angka nyata dari tool. Jangan pernah mengarang angka; kalau data tidak tersedia, katakan dan sebutkan dugaan penyebabnya. Format rupiah dengan pemisah ribuan.`,
      history: [],
      userMessage: instruction,
      roleCode: 'CEO',
      preferredModel: ceo.aiModel,
      context: { sessionId, executiveRole: 'CEO', origin: 'watcher' },
      maxIterations: 8,
    });
  }

  // ── helpers ───────────────────────────────────────────────────

  /**
   * Apakah dua waktu terpisah oleh pergantian hari, di zona mana pun yang
   * mungkin dipakai platform? Kita hanya tahu dua kandidat yang realistis:
   * WIB (batas milik kita) dan UTC (batas milik NotaBe, terbukti di produksi).
   * Selama batas sebenarnya tidak diketahui, lebih baik melewatkan anomali
   * asli sesekali daripada membanjiri kapten dengan alarm palsu tiap hari.
   */
  private straddlesDayBoundary(a: Date, b: Date): boolean {
    if (this.jakartaDateKey(a) !== this.jakartaDateKey(b)) return true;
    return a.toISOString().slice(0, 10) !== b.toISOString().slice(0, 10);
  }

  /**
   * Berapa jam sejak counter platform ini terakhir terlihat reset ke nol.
   * `null` kalau tidak ada reset yang terekam dalam 48 jam terakhir.
   */
  private async hoursSinceLastReset(slug: string): Promise<number | null> {
    const rows = await this.prisma.platformKpiSnapshot.findMany({
      where: {
        platformSlug: slug,
        period: 'today',
        capturedAt: { gte: new Date(Date.now() - 48 * 3600_000) },
      },
      orderBy: { capturedAt: 'desc' },
      select: { capturedAt: true, gmv: true },
      take: 60,
    });

    // Ditelusuri dari yang terbaru ke belakang: cari titik pertama di mana
    // nilainya nol sementara snapshot SEBELUMNYA positif.
    for (let i = 0; i < rows.length - 1; i += 1) {
      const current = rows[i].gmv != null ? Number(rows[i].gmv) : null;
      const older = rows[i + 1].gmv != null ? Number(rows[i + 1].gmv) : null;
      if (current === 0 && older != null && older > 0) {
        return (Date.now() - rows[i].capturedAt.getTime()) / 3600_000;
      }
    }
    return null;
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
