// Bersihkan sisa dua bug yang diperbaiki 31 Agustus 2026:
//
// 1. Alert anomali palsu akibat NineOS mengira setiap platform berganti hari
//    di tengah malam WIB. NotaBe ternyata mereset 'today' pada UTC 00:00.
// 2. Sesi "Briefing Pagi" yang tertinggal berstatus 'active' tanpa balasan,
//    karena agent gagal (kuota provider habis) dan sesinya tidak pernah ditutup.
//
// Aman dijalankan berulang kali.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // ── 1. Alert palsu ──────────────────────────────────────────
  const suspects = await prisma.automationAlert.findMany({
    where: {
      status: 'pending',
      alertType: { in: ['cumulative_drop_gmv', 'cumulative_drop_revenue', 'daily_shortfall_gmv', 'daily_shortfall_revenue'] },
    },
    select: { id: true, title: true, metadata: true },
  });

  // Hanya yang benar-benar bergejala reset: nilai sekarang nol, atau turun 100%.
  const falsePositives = suspects.filter((a) => {
    const m = (a.metadata ?? {}) as Record<string, unknown>;
    const now = m.now ?? m.today;
    const pct = Number(m.drop_percent ?? 0);
    return now === 0 || pct >= 99.99;
  });

  if (falsePositives.length) {
    await prisma.automationAlert.updateMany({
      where: { id: { in: falsePositives.map((a) => a.id) } },
      data: { status: 'resolved' },
    });
  }
  console.log(`  Alert palsu ditutup : ${falsePositives.length} dari ${suspects.length} kandidat`);
  falsePositives.forEach((a) => console.log(`    - ${a.title}`));

  // ── 2. Sesi briefing menggantung ────────────────────────────
  const stranded = await prisma.executiveSession.findMany({
    where: { status: 'active', title: { startsWith: 'Briefing Pagi' } },
    select: { id: true, title: true, _count: { select: { messages: true } } },
  });

  // Hanya yang isinya cuma instruksi founder, tanpa balasan executive.
  const toClose = stranded.filter((s) => s._count.messages <= 1);
  for (const s of toClose) {
    await prisma.executiveSession.update({
      where: { id: s.id },
      data: {
        status: 'completed',
        endedAt: new Date(),
        summary: 'Briefing tidak tersusun — kuota AI provider habis saat cron berjalan. Watcher tetap merekam KPI tiap jam, tidak ada data yang hilang.',
      },
    });
    console.log(`  Sesi ditutup : ${s.title}`);
  }
  console.log(`  Sesi menggantung ditutup: ${toClose.length} dari ${stranded.length}`);
}

main()
  .catch((e) => { console.error('ERR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
