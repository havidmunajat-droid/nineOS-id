import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GatewayAuthGuard } from '../../common/guards/gateway-auth.guard';
import { PlatformWatcherService } from './platform-watcher.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Agent Watcher')
@ApiBearerAuth()
@UseGuards(GatewayAuthGuard)
@Controller('agent/watcher')
export class WatcherController {
  constructor(
    private readonly watcher: PlatformWatcherService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('run')
  @ApiOperation({
    summary: 'Paksa jalankan siklus watcher sekarang (rekam snapshot + deteksi anomali)',
  })
  run() {
    return this.watcher.captureAndDetect();
  }

  @Post('briefing')
  @ApiOperation({ summary: 'Paksa CEO agent menyusun briefing sekarang' })
  briefing() {
    return this.watcher.generateBriefing();
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'Riwayat snapshot KPI yang direkam watcher' })
  @ApiQuery({ name: 'platform', required: false, example: 'notabe' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  async snapshots(@Query('platform') platform?: string, @Query('limit') limit?: string) {
    const take = Math.min(limit ? parseInt(limit, 10) : 50, 500);
    const rows = await this.prisma.platformKpiSnapshot.findMany({
      where: platform ? { platformSlug: platform } : undefined,
      orderBy: { capturedAt: 'desc' },
      take,
      select: {
        id: true,
        platformSlug: true,
        period: true,
        gmv: true,
        revenue: true,
        activeUsers: true,
        capturedAt: true,
      },
    });

    return {
      count: rows.length,
      data: rows.map((r) => ({
        id: r.id,
        platform: r.platformSlug,
        period: r.period,
        gmv: r.gmv != null ? Number(r.gmv) : null,
        revenue: r.revenue != null ? Number(r.revenue) : null,
        active_users: r.activeUsers,
        captured_at: r.capturedAt.toISOString(),
      })),
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Status watcher: aktif/mati, jumlah snapshot, alert pending' })
  async status() {
    const [snapshotCount, latest, pendingAlerts, pendingActions] = await Promise.all([
      this.prisma.platformKpiSnapshot.count(),
      this.prisma.platformKpiSnapshot.findFirst({
        orderBy: { capturedAt: 'desc' },
        select: { capturedAt: true, platformSlug: true },
      }),
      this.prisma.automationAlert.count({ where: { status: 'pending' } }),
      this.prisma.agentAction.count({ where: { status: 'pending_approval' } }),
    ]);

    return {
      enabled: process.env.AGENT_WATCHER !== 'off',
      autonomy: process.env.AGENT_AUTONOMY === 'full' ? 'full' : 'guarded',
      schedule: { snapshot: 'tiap jam', briefing: '07:00 WIB' },
      snapshot_count: snapshotCount,
      last_snapshot: latest
        ? { platform: latest.platformSlug, at: latest.capturedAt.toISOString() }
        : null,
      pending_alerts: pendingAlerts,
      pending_approvals: pendingActions,
    };
  }
}
