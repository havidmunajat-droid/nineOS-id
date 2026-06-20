import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GatewayAuthGuard } from '../../common/guards/gateway-auth.guard';
import { HelpdeskService } from './helpdesk.service';
import { CreateKbDto, EscalateDto, InboundMessageDto, OutboundMessageDto, UpdateKbDto, UpdateSettingsDto } from './dto/helpdesk.dto';

@ApiTags('HelpDesk')
@ApiBearerAuth()
@UseGuards(GatewayAuthGuard)
@Controller()
export class HelpdeskController {
  constructor(private readonly svc: HelpdeskService) {}

  // ── Settings ──────────────────────────────────────────────────

  @Get('platforms/:slug/helpdesk/settings')
  @ApiOperation({ summary: 'Ambil pengaturan auto-reply platform' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  getSettings(@Param('slug') slug: string) {
    return this.svc.getSettings(slug);
  }

  @Put('platforms/:slug/helpdesk/settings')
  @ApiOperation({ summary: 'Update threshold, keyword eskalasi, dll' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  updateSettings(@Param('slug') slug: string, @Body() dto: UpdateSettingsDto) {
    return this.svc.updateSettings(slug, dto);
  }

  // ── Knowledge Base ────────────────────────────────────────────

  @Get('platforms/:slug/helpdesk/knowledge-base')
  @ApiOperation({ summary: 'List FAQ knowledge base' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  listKb(@Param('slug') slug: string) {
    return this.svc.listKb(slug);
  }

  @Get('platforms/:slug/helpdesk/knowledge-base/search')
  @ApiOperation({ summary: 'Cari FAQ relevan (dipanggil n8n sebagai konteks AI)' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  @ApiQuery({ name: 'q', example: 'pesanan kapan sampai' })
  searchKb(@Param('slug') slug: string, @Query('q') q: string) {
    return this.svc.searchKb(slug, q ?? '');
  }

  @Post('platforms/:slug/helpdesk/knowledge-base')
  @ApiOperation({ summary: 'Tambah FAQ baru' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  createKb(@Param('slug') slug: string, @Body() dto: CreateKbDto) {
    return this.svc.createKb(slug, dto);
  }

  @Put('platforms/:slug/helpdesk/knowledge-base/:id')
  @ApiOperation({ summary: 'Update FAQ' })
  updateKb(@Param('slug') slug: string, @Param('id') id: string, @Body() dto: UpdateKbDto) {
    return this.svc.updateKb(slug, id, dto);
  }

  @Delete('platforms/:slug/helpdesk/knowledge-base/:id')
  @ApiOperation({ summary: 'Hapus FAQ (soft delete)' })
  deleteKb(@Param('slug') slug: string, @Param('id') id: string) {
    return this.svc.deleteKb(slug, id);
  }

  // ── Conversations ─────────────────────────────────────────────

  @Get('platforms/:slug/helpdesk/conversations')
  @ApiOperation({ summary: 'List percakapan' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  @ApiQuery({ name: 'status', required: false, example: 'open' })
  listConversations(@Param('slug') slug: string, @Query('status') status?: string) {
    return this.svc.listConversations(slug, status);
  }

  @Get('platforms/:slug/helpdesk/conversations/:id')
  @ApiOperation({ summary: 'Detail percakapan + histori pesan' })
  getConversation(@Param('slug') slug: string, @Param('id') id: string) {
    return this.svc.getConversation(slug, id);
  }

  // ── Messages (dipanggil n8n) ──────────────────────────────────

  @Post('helpdesk/messages/inbound')
  @ApiOperation({ summary: 'n8n: pesan masuk dari pelanggan (normalisasi semua channel)' })
  inbound(@Body() dto: InboundMessageDto) {
    return this.svc.inboundMessage(dto);
  }

  @Post('helpdesk/messages/outbound')
  @ApiOperation({ summary: 'n8n: catat balasan AI atau agent' })
  outbound(@Body() dto: OutboundMessageDto) {
    return this.svc.outboundMessage(dto);
  }

  @Patch('helpdesk/conversations/:id/escalate')
  @ApiOperation({ summary: 'Tandai percakapan dieskalasi' })
  escalate(@Param('id') id: string, @Body() dto: EscalateDto) {
    return this.svc.escalateConversation(id, dto);
  }

  @Patch('helpdesk/conversations/:id/close')
  @ApiOperation({ summary: 'Tutup percakapan' })
  close(@Param('id') id: string) {
    return this.svc.closeConversation(id);
  }
}
