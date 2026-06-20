import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

// Fetch KPI dari platform eksternal via REST API mereka
@Injectable()
export class PlatformKpiService {
  private readonly logger = new Logger(PlatformKpiService.name);

  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
  ) {}

  async fetchKpi(slug: string, period: 'today' | 'week' | 'month' = 'today') {
    const platform = await this.prisma.platform.findUnique({ where: { slug } });
    if (!platform) return null;

    const connection = await this.prisma.platformConnection.findFirst({
      where: { platformId: platform.id, connectionStatus: 'connected' },
      orderBy: { createdAt: 'desc' },
    });

    // Kalau tidak ada koneksi, coba env var langsung (untuk Krama local dev)
    const baseUrl = connection?.baseUrl ?? this.getEnvUrl(slug);
    let apiKey: string | null = null;
    if (connection?.apiKeyEncrypted) {
      try {
        apiKey = this.encryption.decrypt(connection.apiKeyEncrypted);
      } catch {
        // stored as plaintext (dev/seed), use as-is
        apiKey = connection.apiKeyEncrypted;
      }
    } else {
      apiKey = this.getEnvKey(slug);
    }

    if (!baseUrl || !apiKey) return null;

    try {
      const { default: fetch } = await import('node-fetch');
      const res = await fetch(`${baseUrl}/nineos/kpi?period=${period}`, {
        headers: { 'X-NineOS-Key': apiKey },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        this.logger.warn(`KPI fetch ${slug} failed: HTTP ${res.status}`);
        return null;
      }

      return await res.json();
    } catch (err) {
      this.logger.warn(`KPI fetch ${slug} error: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  async fetchAllKpi(period: 'today' | 'week' | 'month' = 'today') {
    // Hanya platform yang punya nineos endpoint (sudah connected atau punya env key)
    const SUPPORTED = ['krama']; // tambah matcha, notabe, dll saat mereka implement /nineos/kpi

    const results: Record<string, unknown> = {};
    await Promise.all(
      SUPPORTED.map(async (slug) => {
        const kpi = await this.fetchKpi(slug, period);
        if (kpi) results[slug] = kpi;
      }),
    );

    return results;
  }

  private getEnvUrl(slug: string): string | null {
    const map: Record<string, string | undefined> = {
      krama: process.env.KRAMA_API_URL,
      matcha: process.env.MATCHA_API_URL,
      notabe: process.env.NOTABE_API_URL,
    };
    return map[slug] ?? null;
  }

  private getEnvKey(slug: string): string | null {
    const map: Record<string, string | undefined> = {
      krama: process.env.KRAMA_NINEOS_KEY,
      matcha: process.env.MATCHA_NINEOS_KEY,
      notabe: process.env.NOTABE_NINEOS_KEY,
    };
    return map[slug] ?? null;
  }
}
