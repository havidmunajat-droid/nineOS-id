import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { UpsertConnectionDto } from './dto/upsert-connection.dto';

@Injectable()
export class PlatformsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async findAll() {
    const platforms = await this.prisma.platform.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        connections: {
          select: {
            environment: true,
            connectionStatus: true,
            lastCheckedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return platforms.map((p) => this.formatPlatform(p));
  }

  async findBySlug(slug: string) {
    const platform = await this.prisma.platform.findUnique({
      where: { slug },
      include: {
        connections: {
          select: {
            environment: true,
            connectionStatus: true,
            lastCheckedAt: true,
            lastError: true,
          },
        },
        endpoints: true,
      },
    });

    if (!platform) throw new NotFoundException(`Platform '${slug}' tidak ditemukan`);
    return this.formatPlatform(platform);
  }

  async upsertConnection(slug: string, dto: UpsertConnectionDto) {
    const platform = await this.requirePlatform(slug);

    const data: Record<string, unknown> = {
      baseUrl: dto.base_url,
      authType: dto.auth_type,
      oauthClientId: dto.oauth_client_id ?? null,
      connectionStatus: 'pending',
    };

    const creds = dto.credentials;
    if (creds.api_key) data.apiKeyEncrypted = this.encryption.encrypt(creds.api_key);
    if (creds.oauth_client_secret)
      data.oauthClientSecretEncrypted = this.encryption.encrypt(creds.oauth_client_secret);
    if (creds.oauth_access_token)
      data.oauthAccessTokenEncrypted = this.encryption.encrypt(creds.oauth_access_token);
    if (creds.oauth_refresh_token)
      data.oauthRefreshTokenEncrypted = this.encryption.encrypt(creds.oauth_refresh_token);
    if (creds.webhook_secret)
      data.webhookSecretEncrypted = this.encryption.encrypt(creds.webhook_secret);

    const createData = {
      platformId: platform.id,
      environment: dto.environment,
      baseUrl: dto.base_url,
      authType: dto.auth_type,
      oauthClientId: dto.oauth_client_id ?? null,
      connectionStatus: 'pending' as const,
      apiKeyEncrypted: data.apiKeyEncrypted as string | undefined,
      oauthClientSecretEncrypted: data.oauthClientSecretEncrypted as string | undefined,
      oauthAccessTokenEncrypted: data.oauthAccessTokenEncrypted as string | undefined,
      oauthRefreshTokenEncrypted: data.oauthRefreshTokenEncrypted as string | undefined,
      webhookSecretEncrypted: data.webhookSecretEncrypted as string | undefined,
    };

    await this.prisma.platformConnection.upsert({
      where: {
        platformId_environment: {
          platformId: platform.id,
          environment: dto.environment,
        },
      },
      update: data,
      create: createData,
    });

    return {
      platform: slug,
      environment: dto.environment,
      connection_status: 'pending',
      updated_at: new Date().toISOString(),
    };
  }

  async testConnection(slug: string) {
    const platform = await this.requirePlatform(slug);

    const connection = await this.prisma.platformConnection.findFirst({
      where: { platformId: platform.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!connection) {
      throw new NotFoundException(`Belum ada koneksi terdaftar untuk platform '${slug}'`);
    }

    // Tahap 1: stub — test koneksi nyata diimplementasi di Tahap 3
    const start = Date.now();
    let status: 'ok' | 'error' = 'ok';
    let errorDetail: string | null = null;

    try {
      const { default: fetch } = await import('node-fetch');
      const res = await fetch(connection.baseUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        status = 'error';
        errorDetail = `HTTP ${res.status}`;
      }
    } catch (err: unknown) {
      status = 'error';
      errorDetail = err instanceof Error ? err.message : String(err);
    }

    const responseTimeMs = Date.now() - start;
    const checkedAt = new Date();

    await Promise.all([
      this.prisma.platformConnection.update({
        where: { id: connection.id },
        data: {
          connectionStatus: status === 'ok' ? 'connected' : 'error',
          lastCheckedAt: checkedAt,
          lastError: errorDetail,
        },
      }),
      this.prisma.platformHealthLog.create({
        data: {
          platformId: platform.id,
          status: status === 'ok' ? 'ok' : 'error',
          responseTimeMs,
          errorDetail,
          checkedAt,
        },
      }),
    ]);

    return {
      platform: slug,
      status,
      response_time_ms: responseTimeMs,
      checked_at: checkedAt.toISOString(),
      ...(errorDetail ? { error: errorDetail } : {}),
    };
  }

  async getHealthLogs(slug: string, limit = 20) {
    const platform = await this.requirePlatform(slug);

    const logs = await this.prisma.platformHealthLog.findMany({
      where: { platformId: platform.id },
      orderBy: { checkedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        checkedAt: true,
        status: true,
        responseTimeMs: true,
        errorDetail: true,
      },
    });

    return { platform: slug, logs };
  }

  async getEndpoints(slug: string) {
    const platform = await this.requirePlatform(slug);

    const endpoints = await this.prisma.platformEndpoint.findMany({
      where: { platformId: platform.id, isActive: true },
      select: {
        id: true,
        capability: true,
        method: true,
        path: true,
        description: true,
        isActive: true,
      },
    });

    return { platform: slug, endpoints };
  }

  // ── private helpers ──────────────────────────────────────

  private async requirePlatform(slug: string) {
    const platform = await this.prisma.platform.findUnique({ where: { slug } });
    if (!platform) throw new NotFoundException(`Platform '${slug}' tidak ditemukan`);
    return platform;
  }

  private formatPlatform(p: Record<string, unknown> & {
    connections?: Array<{
      environment: string;
      connectionStatus: string;
      lastCheckedAt: Date | null;
      lastError?: string | null;
    }>;
  }) {
    const latestConn = (p.connections as typeof p.connections | undefined)?.[0] ?? null;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description ?? null,
      logo_url: p.logoUrl ?? null,
      readiness_status: p.readinessStatus,
      is_priority: p.isPriority,
      sort_order: p.sortOrder,
      theme: {
        primary: p.themePrimaryColor,
        secondary: p.themeSecondaryColor,
      },
      connection: latestConn
        ? {
            environment: latestConn.environment,
            status: latestConn.connectionStatus,
            last_checked_at: latestConn.lastCheckedAt?.toISOString() ?? null,
          }
        : null,
      created_at: (p.createdAt as Date).toISOString(),
    };
  }
}
