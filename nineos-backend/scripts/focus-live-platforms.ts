// Fokuskan NineOS ke platform yang benar-benar live: Matcha + NotaBe.
//
// Krama & nineClip masih di lingkungan lokal. Selama readinessStatus-nya
// 'ready', PlatformWatcherService menganggap keduanya seharusnya bisa
// dihubungi dan membuat alert critical tiap 6 jam — selamanya. Turunkan
// ke 'not_ready' supaya dashboard produksi bersih.
//
// Saat Krama/nineClip sudah dideploy, jalankan lagi dengan LIVE_SLUGS
// yang memuat slug-nya, atau ubah lewat AI: "set readiness krama ke ready".
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const LIVE_SLUGS = (process.env.LIVE_SLUGS ?? 'matcha,notabe')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const platforms = await prisma.platform.findMany({ orderBy: { sortOrder: 'asc' } });

  for (const p of platforms) {
    const target = LIVE_SLUGS.includes(p.slug) ? 'ready' : 'not_ready';
    if (p.readinessStatus === target) {
      console.log(`  = ${p.slug.padEnd(12)} tetap ${target}`);
      continue;
    }
    await prisma.platform.update({
      where: { id: p.id },
      data: { readinessStatus: target },
    });
    console.log(`  ✓ ${p.slug.padEnd(12)} ${p.readinessStatus} → ${target}`);
  }

  // Tutup alert 'platform_unreachable' yang terlanjur dibuat untuk platform
  // yang sekarang memang tidak diharapkan hidup.
  const closed = await prisma.automationAlert.updateMany({
    where: { alertType: 'platform_unreachable', status: 'pending' },
    data: { status: 'resolved' },
  });
  console.log(`  ✓ ${closed.count} alert platform_unreachable ditutup`);
}

main()
  .catch((e) => { console.error('ERR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
