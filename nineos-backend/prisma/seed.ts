import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new (PrismaClient as any)({ adapter }) as PrismaClient;

async function main() {
  // ── Platforms ──────────────────────────────────────
  console.log('Seeding platforms...');
  const platforms = [
    { slug: 'matcha', name: 'Matcha', description: 'Platform e-commerce / marketplace Matcha', readinessStatus: 'ready', isPriority: true, sortOrder: 1 },
    { slug: 'notabe', name: 'NotaBe', description: 'Platform NotaBe', readinessStatus: 'ready', isPriority: true, sortOrder: 2 },
    { slug: 'krama', name: 'Krama', description: 'Platform Krama (belum ready)', readinessStatus: 'not_ready', isPriority: false, sortOrder: 3 },
    { slug: 'nine-studio', name: 'Nine Studio', description: 'Platform Nine Studio (belum ready)', readinessStatus: 'not_ready', isPriority: false, sortOrder: 4 },
  ];

  const platformRecords: Record<string, string> = {};
  for (const p of platforms) {
    const record = await prisma.platform.upsert({ where: { slug: p.slug }, update: p, create: p });
    platformRecords[p.slug] = record.id;
    console.log(`  ✓ Platform: ${p.name}`);
  }

  // ── HelpDesk Settings (default untuk semua platform) ──────────
  console.log('Seeding helpdesk_settings...');
  for (const [slug, platformId] of Object.entries(platformRecords)) {
    await prisma.helpdeskSettings.upsert({
      where: { platformId },
      update: {},
      create: {
        platformId,
        autoReplyEnabled: true,
        confidenceThreshold: 0.75,
        escalationKeywords: ['refund', 'komplain', 'marah', 'tipu'],
        fallbackMessage: 'Terima kasih, pesanmu sudah kami terima. Tim kami akan membalas segera.',
      },
    });
    console.log(`  ✓ HelpDesk settings: ${slug}`);
  }

  // ── Virtual Office Executives ─────────────────────────────────
  console.log('Seeding executives...');
  const executives = [
    {
      roleCode: 'CEO', displayName: 'CEO', sortOrder: 1, status: 'active',
      scopeDescription: 'General dan keputusan akhir, sintesis dari semua C-Level',
      systemPrompt: 'Kamu adalah CEO NineOS. Sintesis informasi dari CTO, CFO, dan CMO untuk memberikan rekomendasi keputusan strategis kepada founder. Fokus pada big picture, risiko bisnis, dan prioritas. Jawab singkat, tegas, dan actionable.',
    },
    {
      roleCode: 'CFO', displayName: 'CFO', sortOrder: 2, status: 'active',
      scopeDescription: 'Strategi keuangan dan laporan keuangan',
      systemPrompt: 'Kamu adalah CFO NineOS. Fokus pada kesehatan finansial: revenue, expense, profit, dan cash flow. Data keuangan diberikan secara manual oleh founder. Jika data tidak ada, minta founder untuk input terlebih dahulu.',
    },
    {
      roleCode: 'CTO', displayName: 'CTO', sortOrder: 3, status: 'active',
      scopeDescription: 'Server, bug, database, API, infrastruktur teknis',
      systemPrompt: 'Kamu adalah CTO NineOS. Fokus pada kesehatan teknis: status koneksi platform, error yang terjadi, performa API, dan automasi. Gunakan data dari platform_health dan automation. Berikan diagnosis teknis yang jelas dan solusi konkret.',
    },
    {
      roleCode: 'CMO', displayName: 'CMO', sortOrder: 4, status: 'active',
      scopeDescription: 'Strategi pemasaran, konten, dan engagement sosial media',
      systemPrompt: 'Kamu adalah CMO NineOS. Fokus pada performa konten sosial media, strategi posting, engagement, dan pertumbuhan channel. Gunakan data dari social_media dan helpdesk untuk insight pelanggan.',
    },
    {
      roleCode: 'COO', displayName: 'COO', sortOrder: 5, status: 'not_ready',
      scopeDescription: 'Operasional harian (scope menyusul)',
      systemPrompt: '',
    },
    {
      roleCode: 'LEGAL', displayName: 'Legal', sortOrder: 6, status: 'not_ready',
      scopeDescription: 'Kepatuhan dan kontrak (scope menyusul)',
      systemPrompt: '',
    },
  ];

  for (const exec of executives) {
    await prisma.executive.upsert({
      where: { roleCode: exec.roleCode },
      update: { displayName: exec.displayName, scopeDescription: exec.scopeDescription, systemPrompt: exec.systemPrompt, status: exec.status },
      create: exec,
    });
    console.log(`  ✓ Executive: ${exec.roleCode} (${exec.status})`);
  }

  // Data sources per executive
  const execRecords = await prisma.executive.findMany();
  const domainMap: Record<string, string[]> = {
    CEO: ['platform_health', 'social_media', 'helpdesk', 'automation', 'finance'],
    CFO: ['finance'],
    CTO: ['platform_health', 'automation'],
    CMO: ['social_media', 'helpdesk'],
  };
  for (const exec of execRecords) {
    const domains = domainMap[exec.roleCode] ?? [];
    for (const domain of domains) {
      await prisma.executiveDataSource.upsert({
        where: { executiveId_dataDomain: { executiveId: exec.id, dataDomain: domain } },
        update: {},
        create: { executiveId: exec.id, dataDomain: domain },
      });
    }
  }
  console.log('  ✓ Executive data sources dikonfigurasi');

  console.log('Seed selesai.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
