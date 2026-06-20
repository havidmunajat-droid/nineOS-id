import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import {
  CreatePipelineDto, UpdatePipelineDto, UpdatePipelineRunDto,
  CreateReportScheduleDto, UpdateReportScheduleDto, CreateAlertDto,
} from './dto/automation.dto';

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Sync Jobs (Modul 1 — tetap ada) ──────────────────────────

  async createJob(dto: CreateJobDto) {
    let platformId: string | null = null;
    if (dto.platform) {
      const platform = await this.prisma.platform.findUnique({ where: { slug: dto.platform } });
      if (platform) platformId = platform.id;
    }
    const job = await this.prisma.automationSyncJob.create({
      data: {
        platformId,
        jobType: dto.job_type,
        triggeredBy: dto.triggered_by,
        payload: dto.payload as object ?? null,
        status: 'running',
      },
    });
    return this.formatJob(job);
  }

  async updateJob(id: string, dto: UpdateJobDto) {
    const existing = await this.prisma.automationSyncJob.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Job '${id}' tidak ditemukan`);
    const job = await this.prisma.automationSyncJob.update({
      where: { id },
      data: {
        status: dto.status,
        result: dto.result as object ?? null,
        finishedAt: dto.finished_at ? new Date(dto.finished_at) : new Date(),
      },
    });
    return this.formatJob(job);
  }

  // ── Pipelines ─────────────────────────────────────────────────

  async listPipelines(platformSlug?: string) {
    const platformId = platformSlug ? await this.resolvePlatformId(platformSlug) : undefined;
    const pipelines = await this.prisma.automationPipeline.findMany({
      where: platformId ? { platformId } : {},
      orderBy: { createdAt: 'desc' },
    });
    return { data: pipelines.map((p) => this.formatPipeline(p)) };
  }

  async createPipeline(dto: CreatePipelineDto) {
    const platformId = dto.platform_slug ? await this.resolvePlatformId(dto.platform_slug) : null;
    const pipeline = await this.prisma.automationPipeline.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        pipelineType: dto.pipeline_type,
        n8nWorkflowId: dto.n8n_workflow_id ?? null,
        platformId,
        config: dto.config !== undefined ? dto.config as Prisma.InputJsonValue : Prisma.JsonNull,
        status: 'active',
      },
    });
    return this.formatPipeline(pipeline);
  }

  async getPipeline(id: string) {
    const pipeline = await this.prisma.automationPipeline.findUnique({ where: { id } });
    if (!pipeline) throw new NotFoundException(`Pipeline '${id}' tidak ditemukan`);
    return this.formatPipeline(pipeline);
  }

  async updatePipeline(id: string, dto: UpdatePipelineDto) {
    await this.requirePipeline(id);
    const pipeline = await this.prisma.automationPipeline.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.n8n_workflow_id !== undefined && { n8nWorkflowId: dto.n8n_workflow_id }),
        ...(dto.status && { status: dto.status }),
        ...(dto.config !== undefined && { config: dto.config as Prisma.InputJsonValue }),
      },
    });
    return this.formatPipeline(pipeline);
  }

  async updatePipelineRun(id: string, dto: UpdatePipelineRunDto) {
    await this.requirePipeline(id);
    const pipeline = await this.prisma.automationPipeline.update({
      where: { id },
      data: { lastRunAt: new Date(), lastRunStatus: dto.status },
    });
    return {
      pipeline_id: id,
      last_run_at: pipeline.lastRunAt?.toISOString(),
      last_run_status: pipeline.lastRunStatus,
    };
  }

  // ── Report Schedules ──────────────────────────────────────────

  async listReportSchedules(platformSlug?: string) {
    const platformId = platformSlug ? await this.resolvePlatformId(platformSlug) : undefined;
    const schedules = await this.prisma.reportSchedule.findMany({
      where: platformId ? { platformId } : {},
      orderBy: { createdAt: 'desc' },
    });
    return { data: schedules.map((s) => this.formatSchedule(s)) };
  }

  async createReportSchedule(dto: CreateReportScheduleDto) {
    const platformId = dto.platform_slug ? await this.resolvePlatformId(dto.platform_slug) : null;
    const schedule = await this.prisma.reportSchedule.create({
      data: {
        platformId,
        reportType: dto.report_type,
        cronExpr: dto.cron_expr,
        recipients: dto.recipients,
        outputFormat: dto.output_format ?? 'json',
        isActive: true,
      },
    });
    return this.formatSchedule(schedule);
  }

  async updateReportSchedule(id: string, dto: UpdateReportScheduleDto) {
    await this.requireReportSchedule(id);
    const schedule = await this.prisma.reportSchedule.update({
      where: { id },
      data: {
        ...(dto.cron_expr && { cronExpr: dto.cron_expr }),
        ...(dto.recipients !== undefined && { recipients: dto.recipients }),
        ...(dto.is_active !== undefined && { isActive: dto.is_active }),
        ...(dto.output_format && { outputFormat: dto.output_format }),
      },
    });
    return this.formatSchedule(schedule);
  }

  async getDueReportSchedules(before?: string) {
    const beforeDate = before ? new Date(before) : new Date();
    const schedules = await this.prisma.reportSchedule.findMany({
      where: { isActive: true, nextRunAt: { lte: beforeDate } },
      orderBy: { nextRunAt: 'asc' },
      take: 50,
    });
    return { data: schedules.map((s) => this.formatSchedule(s)) };
  }

  async markReportSent(id: string, nextRunAt?: string) {
    await this.requireReportSchedule(id);
    const schedule = await this.prisma.reportSchedule.update({
      where: { id },
      data: {
        lastSentAt: new Date(),
        ...(nextRunAt && { nextRunAt: new Date(nextRunAt) }),
      },
    });
    return this.formatSchedule(schedule);
  }

  // ── Alerts ────────────────────────────────────────────────────

  async createAlert(dto: CreateAlertDto) {
    const platformId = dto.platform_slug ? await this.resolvePlatformId(dto.platform_slug) : null;
    const alert = await this.prisma.automationAlert.create({
      data: {
        platformId,
        alertType: dto.alert_type,
        severity: dto.severity ?? 'info',
        title: dto.title,
        message: dto.message,
        metadata: dto.metadata !== undefined ? dto.metadata as Prisma.InputJsonValue : Prisma.JsonNull,
        status: 'pending',
      },
    });
    return this.formatAlert(alert);
  }

  async listAlerts(status?: string, platformSlug?: string) {
    const platformId = platformSlug ? await this.resolvePlatformId(platformSlug) : undefined;
    const alerts = await this.prisma.automationAlert.findMany({
      where: {
        ...(status && { status }),
        ...(platformId && { platformId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { data: alerts.map((a) => this.formatAlert(a)) };
  }

  async markAlertSent(id: string) {
    const alert = await this.prisma.automationAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException(`Alert '${id}' tidak ditemukan`);
    const updated = await this.prisma.automationAlert.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date() },
    });
    return this.formatAlert(updated);
  }

  // ── Report Logs ───────────────────────────────────────────────

  async listReportLogs(platformSlug?: string, reportType?: string) {
    const platformId = platformSlug ? await this.resolvePlatformId(platformSlug) : undefined;
    const logs = await this.prisma.reportLog.findMany({
      where: {
        ...(platformId && { platformId }),
        ...(reportType && { reportType }),
      },
      orderBy: { generatedAt: 'desc' },
      take: 100,
    });
    return {
      data: logs.map((l) => ({
        id: l.id,
        source_type: l.sourceType,
        source_id: l.sourceId,
        report_type: l.reportType,
        status: l.status,
        error_detail: l.errorDetail,
        generated_at: l.generatedAt.toISOString(),
      })),
    };
  }

  // ── private helpers ───────────────────────────────────────────

  private async resolvePlatformId(slug: string): Promise<string> {
    const p = await this.prisma.platform.findUnique({ where: { slug } });
    if (!p) throw new NotFoundException(`Platform '${slug}' tidak ditemukan`);
    return p.id;
  }

  private async requirePipeline(id: string) {
    const p = await this.prisma.automationPipeline.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`Pipeline '${id}' tidak ditemukan`);
    return p;
  }

  private async requireReportSchedule(id: string) {
    const s = await this.prisma.reportSchedule.findUnique({ where: { id } });
    if (!s) throw new NotFoundException(`Report schedule '${id}' tidak ditemukan`);
    return s;
  }

  private formatJob(job: Record<string, unknown>) {
    return {
      id: job.id,
      job_type: job.jobType,
      platform_id: job.platformId ?? null,
      triggered_by: job.triggeredBy,
      status: job.status,
      payload: job.payload ?? null,
      result: job.result ?? null,
      started_at: (job.startedAt as Date).toISOString(),
      finished_at: job.finishedAt ? (job.finishedAt as Date).toISOString() : null,
    };
  }

  private formatPipeline(p: {
    id: string; name: string; description: string | null; pipelineType: string;
    n8nWorkflowId: string | null; platformId: string | null; status: string;
    config: unknown; lastRunAt: Date | null; lastRunStatus: string | null;
    createdAt: Date; updatedAt: Date;
  }) {
    return {
      id: p.id, name: p.name, description: p.description,
      pipeline_type: p.pipelineType, n8n_workflow_id: p.n8nWorkflowId,
      platform_id: p.platformId, status: p.status, config: p.config,
      last_run_at: p.lastRunAt?.toISOString() ?? null,
      last_run_status: p.lastRunStatus,
      created_at: p.createdAt.toISOString(),
    };
  }

  private formatSchedule(s: {
    id: string; platformId: string | null; reportType: string; cronExpr: string;
    recipients: string[]; outputFormat: string; isActive: boolean;
    lastSentAt: Date | null; nextRunAt: Date | null; createdAt: Date;
  }) {
    return {
      id: s.id, platform_id: s.platformId, report_type: s.reportType,
      cron_expr: s.cronExpr, recipients: s.recipients,
      output_format: s.outputFormat, is_active: s.isActive,
      last_sent_at: s.lastSentAt?.toISOString() ?? null,
      next_run_at: s.nextRunAt?.toISOString() ?? null,
      created_at: s.createdAt.toISOString(),
    };
  }

  private formatAlert(a: {
    id: string; platformId: string | null; alertType: string; severity: string;
    title: string; message: string; metadata: unknown; status: string;
    sentAt: Date | null; createdAt: Date;
  }) {
    return {
      id: a.id, platform_id: a.platformId, alert_type: a.alertType,
      severity: a.severity, title: a.title, message: a.message,
      metadata: a.metadata, status: a.status,
      sent_at: a.sentAt?.toISOString() ?? null,
      created_at: a.createdAt.toISOString(),
    };
  }
}
