// Susunan platform NineOS per 4 Oktober 2026: NotaBe + Krama live, Matcha diarsipkan.
//
// 1. Matcha  → readinessStatus 'archived'. Supabase-nya di-pause pemilik.
//              Data (snapshot, konten, akun sosial) TIDAK dihapus — cukup
//              set balik ke 'ready' kalau suatu hari dihidupkan lagi.
// 2. Krama   → baris platform_connections dibetulkan ke URL produksi.
//              Baris lama menunjuk http://localhost:3001 dengan status
//              'connected', dan PlatformKpiService MENGUTAMAKAN baris itu di
//              atas env var — jadi env saja tidak akan pernah cukup.
//              Key disimpan terenkripsi dengan ENCRYPTION_KEY PRODUKSI
//              (dibaca dari DEPLOY-SECRETS.local.txt), bukan teks polos.
// 3. Bersih-bersih sisa sebulan watcher lama yang tidak pernah ter-deploy:
//    alert Matcha, alarm palsu pergantian hari NotaBe, briefing menggantung.
//
// Aman dijalankan berulang kali.
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { EncryptionService } from '../src/common/crypto/encryption.service';

const KRAMA_PROD_URL = 'https://krama-platform-production.up.railway.app/api/v1';

function readProdEncryptionKey(): string {
  const path = join(__dirname, '..', '..', 'DEPLOY-SECRETS.local.txt');
  const line = readFileSync(path, 'utf8').split(/\r?\n/).find((l) => l.startsWith('ENCRYPTION_KEY='));
  if (!line) throw new Error('ENCRYPTION_KEY produksi tidak ditemukan di DEPLOY-SECRETS.local.txt');
  return line.slice('ENCRYPTION_KEY='.length).trim();
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // ── 1. Arsipkan Matcha ───────────────────────────────────────
  const matcha = await prisma.platform.update({
    where: { slug: 'matcha' },
    data: { readinessStatus: 'archived' },
  });
  console.log(`  ✓ matcha  → ${matcha.readinessStatus}`);

  // ── 2. Sambungkan Krama produksi ─────────────────────────────
  const kramaKey = process.env.KRAMA_NINEOS_KEY;
  if (!kramaKey) throw new Error('KRAMA_NINEOS_KEY kosong di nineos-backend/.env');

  // Buktikan dulu key ini diterima Krama produksi, SEBELUM menulis apa pun.
  const probe = await fetch(`${KRAMA_PROD_URL}/nineos/kpi?period=today`, {
    headers: { 'X-NineOS-Key': kramaKey },
    signal: AbortSignal.timeout(15000),
  });
  if (!probe.ok) throw new Error(`Krama produksi menolak key: HTTP ${probe.status} — tidak ada yang diubah`);
  console.log('  ✓ krama produksi menerima key (HTTP 200)');

  process.env.ENCRYPTION_KEY = readProdEncryptionKey();
  const crypto = new EncryptionService();
  const encrypted = crypto.encrypt(kramaKey);
  if (crypto.decrypt(encrypted) !== kramaKey) throw new Error('Uji enkripsi bolak-balik gagal');

  const krama = await prisma.platform.findUniqueOrThrow({ where: { slug: 'krama' } });
  const existing = await prisma.platformConnection.findFirst({ where: { platformId: krama.id } });
  const connectionData = {
    environment: 'production',
    baseUrl: KRAMA_PROD_URL,
    authType: 'api_key',
    apiKeyEncrypted: encrypted,
    connectionStatus: 'connected',
    lastCheckedAt: new Date(),
    lastError: null,
  };
  if (existing) {
    await prisma.platformConnection.update({ where: { id: existing.id }, data: connectionData });
  } else {
    await prisma.platformConnection.create({ data: { platformId: krama.id, ...connectionData } });
  }
  await prisma.platform.update({ where: { id: krama.id }, data: { readinessStatus: 'ready' } });
  console.log(`  ✓ krama   → ready, koneksi ${KRAMA_PROD_URL} (key terenkripsi)`);

  // ── 3. Bersih-bersih ─────────────────────────────────────────
  const matchaAlerts = await prisma.automationAlert.updateMany({
    where: { platformId: matcha.id, status: 'pending' },
    data: { status: 'resolved' },
  });
  console.log(`  ✓ ${matchaAlerts.count} alert Matcha ditutup`);

  // Semua alert drop/shortfall NotaBe yang pending lahir dari watcher lama,
  // yang mengira NotaBe berganti hari di tengah malam WIB padahal UTC 00:00.
  const notabe = await prisma.platform.findUniqueOrThrow({ where: { slug: 'notabe' } });
  const notabeFalse = await prisma.automationAlert.updateMany({
    where: {
      platformId: notabe.id,
      status: 'pending',
      alertType: { in: ['cumulative_drop_gmv', 'cumulative_drop_revenue', 'daily_shortfall_gmv', 'daily_shortfall_revenue'] },
    },
    data: { status: 'resolved' },
  });
  console.log(`  ✓ ${notabeFalse.count} alarm palsu NotaBe ditutup`);

  const stranded = await prisma.executiveSession.updateMany({
    where: { status: 'active', title: { startsWith: 'Briefing Pagi' } },
    data: {
      status: 'failed',
      endedAt: new Date(),
      summary:
        'Briefing tidak tersusun — Gemini membalas 503 "high demand" pukul 07:00 WIB dan versi lama NineOS tidak mencoba ulang kesalahan 503. Sudah diperbaiki 4 Okt 2026.',
    },
  });
  console.log(`  ✓ ${stranded.count} sesi briefing menggantung ditandai 'failed'`);
}

main()
  .catch((e) => {
    console.error('ERR:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
