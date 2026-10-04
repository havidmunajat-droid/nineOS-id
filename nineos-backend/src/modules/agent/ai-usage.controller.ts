import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GatewayAuthGuard } from '../../common/guards/gateway-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

type Sum = { runs: number; failed_runs: number; requests: number; input: number; output: number; thinking: number; cached: number };
const empty = (): Sum => ({ runs: 0, failed_runs: 0, requests: 0, input: 0, output: 0, thinking: 0, cached: 0 });

/**
 * Ringkasan pemakaian token AI NineOS — bahan perbandingan biaya provider.
 *
 * Sengaja hanya mengembalikan TOKEN, bukan rupiah: harga tiap provider
 * berubah-ubah dan harus diambil dari halaman harga resminya. Halaman Biaya AI
 * di dashboard yang mengalikan token ini dengan tarif yang diisi kapten.
 */
@ApiTags('Agent AI Usage')
@ApiBearerAuth()
@UseGuards(GatewayAuthGuard)
@Controller('agent/ai-usage')
export class AiUsageController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Pemakaian token AI per model, per fitur, per hari' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  async summary(@Query('days') daysRaw?: string) {
    const days = Math.min(Math.max(parseInt(daysRaw ?? '30', 10) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86_400_000);

    const rows = await this.prisma.aiUsage.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
    const first = await this.prisma.aiUsage.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } });

    const total = empty();
    const byModel = new Map<string, Sum & { provider: string; model: string }>();
    const byFeature = new Map<string, Sum & { feature: string }>();
    const byDay = new Map<string, { date: string; input: number; output: number; runs: number }>();
    const dayKey = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

    const add = (s: Sum, r: (typeof rows)[number]) => {
      s.runs += 1;
      if (!r.succeeded) s.failed_runs += 1;
      s.requests += r.requests;
      s.input += r.inputTokens;
      s.output += r.outputTokens;
      s.thinking += r.thinkingTokens;
      s.cached += r.cachedTokens;
    };

    for (const r of rows) {
      add(total, r);

      const mk = `${r.provider}:${r.model}`;
      if (!byModel.has(mk)) byModel.set(mk, { provider: r.provider, model: r.model, ...empty() });
      add(byModel.get(mk)!, r);

      if (!byFeature.has(r.feature)) byFeature.set(r.feature, { feature: r.feature, ...empty() });
      add(byFeature.get(r.feature)!, r);

      const dk = dayKey(r.createdAt);
      const d = byDay.get(dk) ?? { date: dk, input: 0, output: 0, runs: 0 };
      d.input += r.inputTokens;
      d.output += r.outputTokens;
      d.runs += 1;
      byDay.set(dk, d);
    }

    // Proyeksi 30 hari dari rentang yang BENAR-BENAR terekam. Pencatatan baru
    // dimulai 4 Okt 2026, jadi membagi dengan `days` penuh akan meremehkan.
    const observedFrom = first && first.createdAt > since ? first.createdAt : since;
    const observedDays = Math.max((Date.now() - observedFrom.getTime()) / 86_400_000, 1 / 24);
    const scale = 30 / observedDays;

    return {
      days,
      recording_since: first?.createdAt.toISOString() ?? null,
      observed_days: +observedDays.toFixed(2),
      total,
      projection_30d: {
        input: Math.round(total.input * scale),
        output: Math.round(total.output * scale),
        runs: Math.round(total.runs * scale),
        reliable: observedDays >= 7,
      },
      by_model: [...byModel.values()].sort((a, b) => b.input + b.output - (a.input + a.output)),
      by_feature: [...byFeature.values()].sort((a, b) => b.input + b.output - (a.input + a.output)),
      daily: [...byDay.values()],
    };
  }
}
