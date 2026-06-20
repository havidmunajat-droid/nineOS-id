import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { GatewayAuthGuard } from '../../common/guards/gateway-auth.guard';
import { PlatformsService } from './platforms.service';
import { PlatformKpiService } from './platform-kpi.service';
import { UpsertConnectionDto } from './dto/upsert-connection.dto';

@ApiTags('Platforms')
@ApiBearerAuth()
@UseGuards(GatewayAuthGuard)
@Controller('platforms')
export class PlatformsController {
  constructor(private readonly svc: PlatformsService, private readonly kpi: PlatformKpiService) {}

  @Get()
  @ApiOperation({ summary: 'List 4 platform + status koneksi ringkas' })
  listPlatforms() {
    return this.svc.findAll();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Detail satu platform' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  getPlatform(@Param('slug') slug: string) {
    return this.svc.findBySlug(slug);
  }

  @Put(':slug/connection')
  @ApiOperation({ summary: 'Buat/update kredensial koneksi' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  upsertConnection(@Param('slug') slug: string, @Body() dto: UpsertConnectionDto) {
    return this.svc.upsertConnection(slug, dto);
  }

  @Post(':slug/connection/test')
  @ApiOperation({ summary: 'Test konektivitas ke backend platform' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  testConnection(@Param('slug') slug: string) {
    return this.svc.testConnection(slug);
  }

  @Get(':slug/health')
  @ApiOperation({ summary: 'Health log terbaru' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getHealth(@Param('slug') slug: string, @Query('limit') limit?: string) {
    return this.svc.getHealthLogs(slug, limit ? parseInt(limit, 10) : 20);
  }

  @Get(':slug/endpoints')
  @ApiOperation({ summary: 'List kapabilitas/endpoint terdaftar' })
  @ApiParam({ name: 'slug', example: 'matcha' })
  getEndpoints(@Param('slug') slug: string) {
    return this.svc.getEndpoints(slug);
  }

  @Get(':slug/kpi')
  @ApiOperation({ summary: 'Fetch KPI live dari backend platform (via /nineos/kpi)' })
  @ApiParam({ name: 'slug', example: 'krama' })
  @ApiQuery({ name: 'period', required: false, enum: ['today', 'week', 'month'] })
  getPlatformKpi(@Param('slug') slug: string, @Query('period') period?: 'today' | 'week' | 'month') {
    return this.kpi.fetchKpi(slug, period ?? 'today');
  }

  @Get('kpi/all')
  @ApiOperation({ summary: 'Fetch KPI dari semua platform yang sudah connected' })
  @ApiQuery({ name: 'period', required: false, enum: ['today', 'week', 'month'] })
  getAllKpi(@Query('period') period?: 'today' | 'week' | 'month') {
    return this.kpi.fetchAllKpi(period ?? 'today');
  }
}
