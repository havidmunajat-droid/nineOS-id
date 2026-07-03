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
    // Coba semua platform terdaftar — fetchKpi balikin null kalau belum ada
    // koneksi connected maupun env var, jadi tidak perlu daftar hardcode.
    const platforms = await this.prisma.platform.findMany({
      select: { slug: true },
      orderBy: { sortOrder: 'asc' },
    });

    const results: Record<string, unknown> = {};
    await Promise.all(
      platforms.map(async ({ slug }) => {
        const kpi = await this.fetchKpi(slug, period);
        if (kpi) results[slug] = kpi;
      }),
    );

    return results;
  }

  // Konvensi env per platform: {SLUG}_API_URL + {SLUG}_NINEOS_KEY
  // (slug di-uppercase, '-' jadi '_' — mis. nine-studio → NINE_STUDIO_API_URL)
  private envName(slug: string, suffix: string): string {
    return `${slug.toUpperCase().replace(/-/g, '_')}_${suffix}`;
  }

  private getEnvUrl(slug: string): string | null {
    return process.env[this.envName(slug, 'API_URL')] ?? null;
  }

  private getEnvKey(slug: string): string | null {
    return process.env[this.envName(slug, 'NINEOS_KEY')] ?? null;
  }
}
