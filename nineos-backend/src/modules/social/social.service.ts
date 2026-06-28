import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { AIService } from '../../common/ai/ai.service';
import { MediaGenerationService } from '../../common/media/media-generation.service';
import {
  ConnectAccountDto, CreateContentDto, GenerateCaptionDto,
  PublishResultDto, ScheduleContentDto, UpdateContentDto,
} from './dto/social.dto';

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly ai: AIService,
    private readonly media: MediaGenerationService,
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

  /**
   * Generate draft konten via AI (ADR-001: AI dipanggil langsung dari NineOS).
   * Menghasilkan DUA hal:
   *  - caption (teks) untuk sosmed
   *  - media_prompt (prompt visual) untuk dipakai generate gambar/video
   */
  async generateCaption(slug: string, dto: GenerateCaptionDto) {
    const platform = await this.requirePlatform(slug);

    const system = [
      'Kamu copywriter sosmed profesional untuk brand Indonesia.',
      'Dari brief user, hasilkan JSON valid TANPA teks lain dengan bentuk:',
      '{ "caption": string, "hashtags": string[], "media_prompt": string }',
      '- caption: menarik, sesuai tone brief, ada CTA, pakai emoji secukupnya.',
      `- media_prompt: deskripsi visual detail dalam Bahasa Inggris untuk generator ${dto.media_type} (gambar/video), siap dipakai AI image/video.`,
      '- hashtags: 3-6 hashtag relevan tanpa tanda #.',
    ].join('\n');

    let caption = '';
    let mediaPrompt = dto.prompt;
    let hashtags: string[] = [];
    try {
      const raw = await this.ai.chat(system, [], dto.prompt);
      const parsed = this.parseJson(raw);
      caption = (parsed.caption as string) ?? raw;
      mediaPrompt = (parsed.media_prompt as string) ?? dto.prompt;
      hashtags = Array.isArray(parsed.hashtags) ? (parsed.hashtags as string[]) : [];
    } catch {
      // AI tidak tersedia / gagal parse → simpan brief mentah sebagai caption
      caption = dto.prompt;
    }

    const fullCaption = hashtags.length
      ? `${caption}\n\n${hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}`
      : caption;

    const item = await this.prisma.contentItem.create({
      data: {
        platformId: platform.id,
        caption: fullCaption,
        mediaType: dto.media_type,
        aiPromptUsed: mediaPrompt,
        status: 'draft',
        mediaUrls: [],
      },
    });

    return {
      content_id: item.id,
      caption: fullCaption,
      media_prompt: mediaPrompt,
      hashtags,
      provider: this.ai.activeProvider,
      status: 'draft',
    };
  }

  /**
   * Generate media (gambar/video) untuk sebuah content item.
   * Pakai media_prompt yang tersimpan (aiPromptUsed) atau override dari body.
   */
  async generateMedia(slug: string, contentId: string, overridePrompt?: string) {
    const platform = await this.requirePlatform(slug);
    const content = await this.prisma.contentItem.findUnique({ where: { id: contentId } });
    if (!content || content.platformId !== platform.id)
      throw new NotFoundException(`Content '${contentId}' tidak ditemukan`);

    const prompt = overridePrompt ?? content.aiPromptUsed ?? content.caption;

    const result =
      content.mediaType === 'video'
        ? await this.media.generateVideo(prompt)
        : await this.media.generateImage(prompt);

    if (result.status === 'failed')
      throw new BadRequestException(`Generate media gagal: ${result.error ?? 'unknown'}`);

    // Video bisa async (processing) → simpan status 'generating', UI polling.
    if (result.status === 'processing') {
      await this.prisma.contentItem.update({
        where: { id: contentId },
        data: { status: 'generating' },
      });
      return { content_id: contentId, status: 'generating', job_id: result.jobId, provider: result.provider };
    }

    const item = await this.prisma.contentItem.update({
      where: { id: contentId },
      data: { mediaUrls: result.mediaUrl ? [result.mediaUrl] : [], status: 'ready' },
    });

    return {
      content_id: contentId,
      status: 'ready',
      media_urls: item.mediaUrls,
      provider: result.provider,
    };
  }

  /**
   * Posting REALTIME ke channel terpilih (tanpa jadwal) — ADR-001.
   * Membuat schedule scheduledAt=now lalu menandai langsung; titik colok
   * posting channel nyata (Meta/WA API) ada di sini.
   */
  async publishNow(slug: string, contentId: string, channels: string[]) {
    const platform = await this.requirePlatform(slug);
    const content = await this.prisma.contentItem.findUnique({ where: { id: contentId } });
    if (!content || content.platformId !== platform.id)
      throw new NotFoundException(`Content '${contentId}' tidak ditemukan`);
    if (!content.mediaUrls.length)
      throw new BadRequestException('Media belum digenerate. Generate media dulu sebelum posting.');

    const results: Array<{ channel: string; status: string; external_post_id?: string }> = [];
    for (const channel of channels) {
      const account = await this.prisma.socialAccount.findUnique({
        where: { platformId_channelType: { platformId: platform.id, channelType: channel } },
      });
      if (!account) throw new BadRequestException(`Akun ${channel} belum terhubung untuk ${slug}`);

      const sched = await this.prisma.contentSchedule.create({
        data: { contentId, socialAccountId: account.id, scheduledAt: new Date(), status: 'pending' },
      });

      // TODO(channel): di sini panggil API channel nyata (Meta Graph / WA) memakai
      // account.accessTokenEncrypted. Untuk sekarang tandai 'posted' (simulasi).
      const externalId = `sim_${sched.id.slice(0, 8)}`;
      await this.prisma.contentSchedule.update({
        where: { id: sched.id },
        data: { status: 'posted', postedAt: new Date(), externalPostId: externalId },
      });
      await this.prisma.contentPublishLog.create({
        data: { scheduleId: sched.id, status: 'posted', responsePayload: { realtime: true, channel } },
      });
      results.push({ channel, status: 'posted', external_post_id: externalId });
    }

    await this.prisma.contentItem.update({ where: { id: contentId }, data: { status: 'published' } });
    return { content_id: contentId, mode: 'realtime', results };
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

  /** Parse JSON dari output AI yang kadang dibungkus ```json ... ```. */
  private parseJson(raw: string): Record<string, unknown> {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found');
    return JSON.parse(cleaned.slice(start, end + 1));
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
