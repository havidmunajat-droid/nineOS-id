import {
  Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags,
} from '@nestjs/swagger';
import { GatewayAuthGuard } from '../../common/guards/gateway-auth.guard';
import { AutomationService } from './automation.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import {
  CreatePipelineDto, UpdatePipelineDto, UpdatePipelineRunDto,
  CreateReportScheduleDto, UpdateReportScheduleDto, CreateAlertDto,
} from './dto/automation.dto';

@ApiBearerAuth()
@UseGuards(GatewayAuthGuard)
@Controller('automation')
export class AutomationController {
  constructor(private readonly svc: AutomationService) {}

  // ── Sync Jobs ─────────────────────────────────────────────────

  @ApiTags('Automation Jobs')
  @Post('jobs')
  @ApiOperation({ summary: 'n8n mencatat mulainya sebuah sync job' })
  createJob(@Body() dto: CreateJobDto) {
    return this.svc.createJob(dto);
  }

  @ApiTags('Automation Jobs')
  @Patch('jobs/:id')
  @ApiOperation({ summary: 'n8n update hasil job (success/failed)' })
  @ApiParam({ name: 'id', description: 'UUID job' })
  updateJob(@Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.svc.updateJob(id, dto);
  }

  // ── Pipelines ─────────────────────────────────────────────────

  @ApiTags('Automation Pipelines')
  @Get('pipelines')
  @ApiOperation({ summary: 'List semua pipeline (registry status n8n)' })
  @ApiQuery({ name: 'platform', required: false })
  listPipelines(@Query('platform') platform?: string) {
    return this.svc.listPipelines(platform);
  }

  @ApiTags('Automation Pipelines')
  @Post('pipelines')
  @ApiOperation({ summary: 'Daftarkan pipeline baru ke registry' })
  createPipeline(@Body() dto: CreatePipelineDto) {
    return this.svc.createPipeline(dto);
  }

  @ApiTags('Automation Pipelines')
  @Get('pipelines/:id')
  @ApiOperation({ summary: 'Detail satu pipeline' })
  @ApiParam({ name: 'id', description: 'UUID pipeline' })
  getPipeline(@Param('id') id: string) {
    return this.svc.getPipeline(id);
  }

  @ApiTags('Automation Pipelines')
  @Patch('pipelines/:id')
  @ApiOperation({ summary: 'Update konfigurasi pipeline' })
  @ApiParam({ name: 'id', description: 'UUID pipeline' })
  updatePipeline(@Param('id') id: string, @Body() dto: UpdatePipelineDto) {
    return this.svc.updatePipeline(id, dto);
  }

  @ApiTags('Automation Pipelines')
  @Patch('pipelines/:id/run')
  @ApiOperation({ summary: 'n8n update status last run pipeline' })
  @ApiParam({ name: 'id', description: 'UUID pipeline' })
  updatePipelineRun(@Param('id') id: string, @Body() dto: UpdatePipelineRunDto) {
    return this.svc.updatePipelineRun(id, dto);
  }

  // ── Report Schedules ──────────────────────────────────────────

  @ApiTags('Automation Reports')
  @Get('reports/schedules')
  @ApiOperation({ summary: 'List semua jadwal report' })
  @ApiQuery({ name: 'platform', required: false })
  listReportSchedules(@Query('platform') platform?: string) {
    return this.svc.listReportSchedules(platform);
  }

  @ApiTags('Automation Reports')
  @Post('reports/schedules')
  @ApiOperation({ summary: 'Buat jadwal report baru' })
  createReportSchedule(@Body() dto: CreateReportScheduleDto) {
    return this.svc.createReportSchedule(dto);
  }

  @ApiTags('Automation Reports')
  @Patch('reports/schedules/:id')
  @ApiOperation({ summary: 'Update jadwal report (cron / recipients / toggle)' })
  @ApiParam({ name: 'id', description: 'UUID report schedule' })
  updateReportSchedule(@Param('id') id: string, @Body() dto: UpdateReportScheduleDto) {
    return this.svc.updateReportSchedule(id, dto);
  }

  @ApiTags('Automation Reports')
  @Get('reports/due')
  @ApiOperation({ summary: 'n8n poll: ambil report schedules yang jatuh tempo' })
  @ApiQuery({ name: 'before', required: false, description: 'ISO datetime (default: now)' })
  getDueReportSchedules(@Query('before') before?: string) {
    return this.svc.getDueReportSchedules(before);
  }

  @ApiTags('Automation Reports')
  @Patch('reports/schedules/:id/sent')
  @ApiOperation({ summary: 'n8n tandai report sudah dikirim, set nextRunAt berikutnya' })
  @ApiParam({ name: 'id', description: 'UUID report schedule' })
  @ApiQuery({ name: 'next_run_at', required: false })
  markReportSent(@Param('id') id: string, @Query('next_run_at') nextRunAt?: string) {
    return this.svc.markReportSent(id, nextRunAt);
  }

  // ── Alerts ────────────────────────────────────────────────────

  @ApiTags('Automation Alerts')
  @Post('alerts')
  @ApiOperation({ summary: 'Modul lain kirim alert ke Automation Engine' })
  createAlert(@Body() dto: CreateAlertDto) {
    return this.svc.createAlert(dto);
  }

  @ApiTags('Automation Alerts')
  @Get('alerts')
  @ApiOperation({ summary: 'n8n poll: ambil alert pending (atau semua)' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'sent'] })
  @ApiQuery({ name: 'platform', required: false })
  listAlerts(@Query('status') status?: string, @Query('platform') platform?: string) {
    return this.svc.listAlerts(status, platform);
  }

  @ApiTags('Automation Alerts')
  @Patch('alerts/:id/sent')
  @ApiOperation({ summary: 'n8n tandai alert sudah dikirim (Telegram/WA)' })
  @ApiParam({ name: 'id', description: 'UUID alert' })
  markAlertSent(@Param('id') id: string) {
    return this.svc.markAlertSent(id);
  }

  // ── Report Logs ───────────────────────────────────────────────

  @ApiTags('Automation Reports')
  @Get('reports/logs')
  @ApiOperation({ summary: 'List log eksekusi report' })
  @ApiQuery({ name: 'platform', required: false })
  @ApiQuery({ name: 'report_type', required: false })
  listReportLogs(
    @Query('platform') platform?: string,
    @Query('report_type') reportType?: string,
  ) {
    return this.svc.listReportLogs(platform, reportType);
  }
}
