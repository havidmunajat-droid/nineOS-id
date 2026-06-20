import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import {
  ConnectAccountDto, CreateContentDto, GenerateCaptionDto,
  PublishResultDto, ScheduleContentDto, UpdateContentDto,
} from './dto/social.dto';

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  // ── Social Accounts ───────────────────────────────────────────

  async listAccounts(slug: string) {
    const platform = await this.requirePlatform(slug);
    const accounts = await this.prisma.socialAccount.findMany({
      where: { platformId: platform.id },
      select: {
        id: true, channelType: true, accountHandle: true,
        accountIdExternal: true, isActive: true, connectedAt: true,
        tokenExpiresAt: true, createdAt: true,
      },
    });
    return { platform: slug, data: accounts.map((a) => ({
      id: a.id, channel: a.channelType, handle: a.accountHandle,
      external_id: a.accountIdExternal, is_active: a.isActive,
      connected_at: a.connectedAt?.toISOString() ?? null,
      token_expires_at: a.tokenExpiresAt?.toISOString() ?? null,
    })) };
  }

  async connectAccount(slug: string, channel: string, dto: ConnectAccountDto) {
    const platform = await this.requirePlatform(slug);
    await this.prisma.socialAccount.upsert({
      where: { platformId_channelType: { platformId: platform.id, channelType: channel } },
      update: {
        accountHandle: dto.account_handle,
        accountIdExternal: dto.account_id_external ?? null,
        accessTokenEncrypted: this.encryption.encrypt(dto.oauth_token),
        refreshTokenEncrypted: dto.refresh_token ? this.encryption.encrypt(dto.refresh_token) : null,
        tokenExpiresAt: dto.token_expires_at ? new Date(dto.token_expires_at) : null,
        isActive: true,
        connectedAt: new Date(),
      },
      create: {
        platformId: platform.id,
        channelType: channel,
        accountHandle: dto.account_handle,
        accountIdExternal: dto.account_id_external ?? null,
        accessTokenEncrypted: this.encryption.encrypt(dto.oauth_token),
        refreshTokenEncrypted: dto.refresh_token ? this.encryption.encrypt(dto.refresh_token) : null,
        tokenExpiresAt: dto.token_expires_at ? new Date(dto.token_expires_at) : null,
        isActive: true,
        connectedAt: new Date(),
      },
    });
    return { platform: slug, channel, status: 'connected', connected_at: new Date().toISOString() };
  }

  async disconnectAccount(slug: string, channel: string) {
    const platform = await this.requirePlatform(slug);
    await this.prisma.socialAccount.updateMany({
      where: { platformId: platform.id, channelType: channel },
      data: { isActive: false },
    });
    return { platform: slug, channel, status: 'disconnected' };
  }

  // ── Content Items ─────────────────────────────────────────────

  async listContent(slug: string, status?: string) {
    const platform = await this.requirePlatform(slug);
    const items = await this.prisma.contentItem.findMany({
      where: { platformId: platform.id, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { platform: slug, data: items.map(this.formatContent) };
  }

  async createContent(slug: string, dto: CreateContentDto) {
    const platform = await this.requirePlatform(slug);
    const item = await this.prisma.contentItem.create({
      data: {
        platformId: platform.id,
        title: dto.title ?? null,
        caption: dto.caption,
        mediaType: dto.media_type,
        mediaUrls: dto.media_urls ?? [],
        createdBy: dto.created_by ?? null,
        status: 'draft',
      },
    });
    return this.formatContent(item);
  }

  async updateContent(slug: string, id: string, dto: UpdateContentDto) {
    await this.requirePlatform(slug);
    const item = await this.prisma.contentItem.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.caption && { caption: dto.caption }),
        ...(dto.media_type && { mediaType: dto.media_type }),
        ...(dto.media_urls !== undefined && { mediaUrls: dto.media_urls }),
      },
    });
    return this.formatContent(item);
  }

  async deleteContent(slug: string, id: string) {
    await this.requirePlatform(slug);
    await this.prisma.contentItem.delete({ where: { id } });
    return { deleted: true, id };
  }

  async generateCaption(slug: string, dto: GenerateCaptionDto) {
    await this.requirePlatform(slug);
    // Tahap 5: integrasi AI nyata. Sekarang kembalikan draft placeholder.
    const caption = `[AI draft] ${dto.prompt.slice(0, 80)}... (integrasi AI aktif di Tahap 5)`;
    const item = await this.prisma.contentItem.create({
      data: {
        platformId: (await this.prisma.platform.findUnique({ where: { slug } }))!.id,
        caption,
        mediaType: dto.media_type,
        aiPromptUsed: dto.prompt,
        status: 'draft',
        mediaUrls: [],
      },
    });
    return { content_id: item.id, caption, status: 'draft' };
  }

  // ── Schedules ─────────────────────────────────────────────────

  async scheduleContent(slug: string, contentId: string, dto: ScheduleContentDto) {
    const platform = await this.requirePlatform(slug);
    const content = await this.prisma.contentItem.findUnique({ where: { id: contentId } });
    if (!content || content.platformId !== platform.id) throw new NotFoundException(`Content '${contentId}' tidak ditemukan`);

    const schedules: Array<{ schedule_id: string; channel: string; status: string }> = [];
    for (const channel of dto.channels) {
      const account = await this.prisma.socialAccount.findUnique({
        where: { platformId_channelType: { platformId: platform.id, channelType: channel } },
      });
      if (!account) throw new BadRequestException(`Akun ${channel} belum terhubung untuk ${slug}`);

      const sched = await this.prisma.contentSchedule.create({
        data: {
          contentId,
          socialAccountId: account.id,
          scheduledAt: new Date(dto.scheduled_at),
          status: 'pending',
        },
      });
      schedules.push({ schedule_id: sched.id, channel, status: 'pending' });
    }

    if (dto.media_urls?.length) {
      await this.prisma.contentItem.update({ where: { id: contentId }, data: { mediaUrls: dto.media_urls, status: 'scheduled' } });
    } else {
      await this.prisma.contentItem.update({ where: { id: contentId }, data: { status: 'scheduled' } });
    }

    return { content_id: contentId, schedules };
  }

  async getDueSchedules(before: string) {
    const beforeDate = new Date(before);
    const schedules = await this.prisma.contentSchedule.findMany({
      where: { status: 'pending', scheduledAt: { lte: beforeDate } },
      include: {
        content: { select: { caption: true, mediaUrls: true, platform: { select: { slug: true } } } },
        socialAccount: { select: { channelType: true } },
      },
      take: 50,
    });

    return {
      data: schedules.map((s) => ({
        schedule_id: s.id,
        content_id: s.contentId,
        platform: s.content.platform.slug,
        channel: s.socialAccount.channelType,
        caption: s.content.caption,
        media_urls: s.content.mediaUrls,
        scheduled_at: s.scheduledAt.toISOString(),
      })),
    };
  }

  async updateScheduleResult(scheduleId: string, dto: PublishResultDto) {
    const schedule = await this.prisma.contentSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException(`Schedule '${scheduleId}' tidak ditemukan`);

    await this.prisma.contentSchedule.update({
      where: { id: scheduleId },
      data: {
        status: dto.status,
        externalPostId: dto.external_post_id ?? null,
        postedAt: dto.posted_at ? new Date(dto.posted_at) : dto.status === 'posted' ? new Date() : null,
        errorMessage: dto.error_message ?? null,
      },
    });

    await this.prisma.contentPublishLog.create({
      data: {
        scheduleId,
        status: dto.status,
        responsePayload: dto as object,
      },
    });

    // Update status content_item: cek apakah semua schedule untuk content ini selesai
    const allSchedules = await this.prisma.contentSchedule.findMany({ where: { contentId: schedule.contentId } });
    const anyFailed = allSchedules.some((s) => s.status === 'failed');
    const allDone = allSchedules.every((s) => s.status !== 'pending');
    if (allDone) {
      const finalStatus = anyFailed
        ? allSchedules.some((s) => s.status === 'posted') ? 'partial' : 'failed'
        : 'published';
      await this.prisma.contentItem.update({ where: { id: schedule.contentId }, data: { status: finalStatus } });
    }

    return { schedule_id: scheduleId, status: dto.status };
  }

  // ── private helpers ───────────────────────────────────────────

  private async requirePlatform(slug: string) {
    const p = await this.prisma.platform.findUnique({ where: { slug } });
    if (!p) throw new NotFoundException(`Platform '${slug}' tidak ditemukan`);
    return p;
  }

  private formatContent(item: {
    id: string; title: string | null; caption: string; mediaType: string;
    mediaUrls: string[]; status: string; createdBy: string | null;
    aiPromptUsed: string | null; createdAt: Date; updatedAt: Date;
  }) {
    return {
      id: item.id, title: item.title, caption: item.caption,
      media_type: item.mediaType, media_urls: item.mediaUrls,
      status: item.status, created_by: item.createdBy,
      ai_prompt_used: item.aiPromptUsed,
      created_at: item.createdAt.toISOString(),
    };
  }
}
