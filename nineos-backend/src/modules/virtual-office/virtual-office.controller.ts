import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags,
} from '@nestjs/swagger';
import { GatewayAuthGuard } from '../../common/guards/gateway-auth.guard';
import { VirtualOfficeService } from './virtual-office.service';
import {
  CreateSessionDto, SendMessageDto, EndSessionDto, AddFinancialSnapshotDto,
} from './dto/virtual-office.dto';

@ApiTags('Virtual Office')
@ApiBearerAuth()
@UseGuards(GatewayAuthGuard)
@Controller('virtual-office')
export class VirtualOfficeController {
  constructor(private readonly svc: VirtualOfficeService) {}

  // ── Executives ────────────────────────────────────────────────

  @Get('executives')
  @ApiOperation({ summary: 'List 6 role C-Level + status aktif/belum' })
  listExecutives() {
    return this.svc.listExecutives();
  }

  @Get('executives/:role_code')
  @ApiOperation({ summary: 'Detail satu role executive' })
  @ApiParam({ name: 'role_code', example: 'CTO' })
  getExecutive(@Param('role_code') roleCode: string) {
    return this.svc.getExecutive(roleCode);
  }

  // ── Sessions ──────────────────────────────────────────────────

  @Post('sessions')
  @ApiOperation({ summary: 'Mulai sesi chat (1 role) atau meeting (banyak role)' })
  createSession(@Body() dto: CreateSessionDto) {
    return this.svc.createSession(dto);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List sesi (filter opsional)' })
  @ApiQuery({ name: 'mode', required: false, enum: ['chat', 'meeting'] })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'completed', 'archived'] })
  listSessions(@Query('mode') mode?: string, @Query('status') status?: string) {
    return this.svc.listSessions(mode, status);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Detail sesi + seluruh histori pesan' })
  @ApiParam({ name: 'id', description: 'UUID session' })
  getSession(@Param('id') id: string) {
    return this.svc.getSession(id);
  }

  // ── Messages ──────────────────────────────────────────────────

  @Post('sessions/:id/messages')
  @ApiOperation({ summary: 'Founder kirim pesan → AI executive langsung membalas' })
  @ApiParam({ name: 'id', description: 'UUID session' })
  sendMessage(@Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.svc.sendMessage(id, dto);
  }

  @Patch('sessions/:id/end')
  @ApiOperation({ summary: 'Tutup sesi, simpan summary opsional' })
  @ApiParam({ name: 'id', description: 'UUID session' })
  endSession(@Param('id') id: string, @Body() dto: EndSessionDto) {
    return this.svc.endSession(id, dto);
  }

  // ── Data Context (debugging / n8n) ────────────────────────────

  @Get('data-context/:domain')
  @ApiOperation({ summary: 'Lihat data context yang digunakan AI untuk menjawab' })
  @ApiParam({ name: 'domain', enum: ['platform_health', 'social_media', 'helpdesk', 'finance', 'all'] })
  getDataContext(@Param('domain') domain: string) {
    return this.svc.getDataContext(domain);
  }

  // ── AI Provider Info ──────────────────────────────────────────

  @Get('ai/status')
  @ApiOperation({ summary: 'Cek AI provider aktif (gemini / anthropic / none)' })
  getAIStatus() {
    return {
      provider: this.svc.getAIProvider(),
      hint: 'Set AI_PROVIDER=gemini atau AI_PROVIDER=anthropic di .env. Pastikan API key yang sesuai juga ada.',
    };
  }

  // ── Financial Snapshots (untuk CFO) ──────────────────────────

  @Get('finance/snapshots')
  @ApiOperation({ summary: 'List data keuangan manual (untuk CFO)' })
  listFinancialSnapshots() {
    return this.svc.listFinancialSnapshots();
  }

  @Post('finance/snapshots')
  @ApiOperation({ summary: 'Input data keuangan manual (revenue / expense per periode)' })
  addFinancialSnapshot(@Body() dto: AddFinancialSnapshotDto) {
    return this.svc.addFinancialSnapshot(dto);
  }
}
