import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GatewayAuthGuard } from '../../common/guards/gateway-auth.guard';
import { SocialService } from './social.service';
import {
  ConnectAccountDto, CreateContentDto, GenerateCaptionDto,
  PublishNowDto, PublishResultDto, ScheduleContentDto, UpdateContentDto,
} from './dto/social.dto';

@ApiTags('Social Media')
@ApiBearerAuth()
@UseGuards(GatewayAuthGuard)
@Controller()
export class SocialController {
  constructor(private readonly svc: SocialService) {}

  // ── Accounts ──────────────────────────────────────────────────

  @Get('platforms/:slug/social/accounts')
  @ApiOperation({ summary: 'List akun sosmed terhubung' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  listAccounts(@Param('slug') slug: string) {
    return this.svc.listAccounts(slug);
  }

  @Put('platforms/:slug/social/accounts/:channel')
  @ApiOperation({ summary: 'Connect/update akun sosmed (OAuth token)' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  @ApiParam({ name: 'channel', example: 'instagram' })
  connectAccount(@Param('slug') slug: string, @Param('channel') channel: string, @Body() dto: ConnectAccountDto) {
    return this.svc.connectAccount(slug, channel, dto);
  }

  @Delete('platforms/:slug/social/accounts/:channel')
  @ApiOperation({ summary: 'Putuskan akun sosmed' })
  disconnectAccount(@Param('slug') slug: string, @Param('channel') channel: string) {
    return this.svc.disconnectAccount(slug, channel);
  }

  // ── Content ───────────────────────────────────────────────────

  @Get('platforms/:slug/content')
  @ApiOperation({ summary: 'List content' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  @ApiQuery({ name: 'status', required: false, example: 'draft' })
  listContent(@Param('slug') slug: string, @Query('status') status?: string) {
    return this.svc.listContent(slug, status);
  }

  @Post('platforms/:slug/content')
  @ApiOperation({ summary: 'Buat content manual' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  createContent(@Param('slug') slug: string, @Body() dto: CreateContentDto) {
    return this.svc.createContent(slug, dto);
  }

  @Post('platforms/:slug/content/generate')
  @ApiOperation({ summary: 'Generate draft caption + media_prompt via AI dari brief singkat' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  generateCaption(@Param('slug') slug: string, @Body() dto: GenerateCaptionDto) {
    return this.svc.generateCaption(slug, dto);
  }

  @Post('platforms/:slug/content/:id/generate-media')
  @ApiOperation({ summary: 'Generate gambar/video untuk content (Veo/Imagen, ADR-002)' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  generateMedia(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: { prompt?: string },
  ) {
    return this.svc.generateMedia(slug, id, body?.prompt);
  }

  @Post('platforms/:slug/content/:id/publish-now')
  @ApiOperation({ summary: 'Posting REALTIME ke channel terpilih (tanpa jadwal)' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  publishNow(@Param('slug') slug: string, @Param('id') id: string, @Body() dto: PublishNowDto) {
    return this.svc.publishNow(slug, id, dto.channels);
  }

  @Put('platforms/:slug/content/:id')
  @ApiOperation({ summary: 'Update content' })
  updateContent(@Param('slug') slug: string, @Param('id') id: string, @Body() dto: UpdateContentDto) {
    return this.svc.updateContent(slug, id, dto);
  }

  @Delete('platforms/:slug/content/:id')
  @ApiOperation({ summary: 'Hapus content' })
  deleteContent(@Param('slug') slug: string, @Param('id') id: string) {
    return this.svc.deleteContent(slug, id);
  }

  @Post('platforms/:slug/content/:id/schedule')
  @ApiOperation({ summary: 'Jadwalkan content ke 1+ channel' })
  scheduleContent(@Param('slug') slug: string, @Param('id') id: string, @Body() dto: ScheduleContentDto) {
    return this.svc.scheduleContent(slug, id, dto);
  }

  // ── Schedules (dipanggil n8n) ─────────────────────────────────

  @Get('social/schedules/due')
  @ApiOperation({ summary: 'n8n: ambil jadwal yang siap diposting' })
  @ApiQuery({ name: 'before', example: '2026-06-22T09:05:00+07:00' })
  getDueSchedules(@Query('before') before: string) {
    return this.svc.getDueSchedules(before ?? new Date().toISOString());
  }

  @Patch('social/schedules/:id/result')
  @ApiOperation({ summary: 'n8n: catat hasil publish' })
  updateScheduleResult(@Param('id') id: string, @Body() dto: PublishResultDto) {
    return this.svc.updateScheduleResult(id, dto);
  }
}
