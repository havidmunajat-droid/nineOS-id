// Rangkai satu blok KEY=VALUE siap tempel ke Railway "Raw Editor" dan Vercel.
//
// Nilai diambil dari dua sumber yang sudah ada di komputer kapten:
//   - nineos-backend/.env          → DATABASE_URL, key Matcha/NotaBe, Gemini
//   - DEPLOY-SECRETS.local.txt     → GATEWAY_TOKEN & ENCRYPTION_KEY produksi baru
//
// Hasil ditulis ke DEPLOY-VARS.local.txt (gitignored). Sengaja ditulis ke
// berkas, TIDAK dicetak ke layar — supaya rahasia tidak masuk transkrip chat.
//
// Jalankan: npx tsx scripts/build-deploy-vars.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const ENV_PATH = join(ROOT, 'nineos-backend', '.env');
const SECRETS_PATH = join(ROOT, 'DEPLOY-SECRETS.local.txt');
const OUT_PATH = join(ROOT, 'DEPLOY-VARS.local.txt');

/** Baca berkas bergaya dotenv jadi peta. Tanda kutip dilepas, komentar dilewati. */
function parse(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const map: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

const env = parse(ENV_PATH);
const secrets = parse(SECRETS_PATH);

const missing: string[] = [];
function need(key: string, from: Record<string, string>, sourceLabel: string): string {
  const value = from[key];
  if (!value) {
    missing.push(`${key} (dicari di ${sourceLabel})`);
    return `<KOSONG — isi manual, tidak ketemu di ${sourceLabel}>`;
  }
  return value;
}

const railway = [
  '# ═══════════════════════════════════════════════════════════',
  '# RAILWAY — service nineos-backend',
  '# Variables → Raw Editor → tempel SELURUH blok di bawah → Save',
  '# ═══════════════════════════════════════════════════════════',
  '',
  `DATABASE_URL=${need('DATABASE_URL', env, '.env')}`,
  `GATEWAY_TOKEN=${need('GATEWAY_TOKEN', secrets, 'DEPLOY-SECRETS.local.txt')}`,
  `ENCRYPTION_KEY=${need('ENCRYPTION_KEY', secrets, 'DEPLOY-SECRETS.local.txt')}`,
  '# NODE_ENV SENGAJA TIDAK DISET di Railway. Backend tidak memakainya sama',
  '# sekali, tapi npm memakainya untuk MELEWATI devDependencies — sehingga',
  '# @nestjs/cli (binary nest) tidak terpasang dan build mati exit 127.',
  '',
  `AI_PROVIDER=gemini`,
  `GEMINI_API_KEY=${need('GEMINI_API_KEY', env, '.env')}`,
  '',
  'AGENT_AUTONOMY=guarded',
  'AGENT_WATCHER=on',
  '',
  `MATCHA_API_URL=${need('MATCHA_API_URL', env, '.env')}`,
  `MATCHA_NINEOS_KEY=${need('MATCHA_NINEOS_KEY', env, '.env')}`,
  `NOTABE_API_URL=${need('NOTABE_API_URL', env, '.env')}`,
  `NOTABE_NINEOS_KEY=${need('NOTABE_NINEOS_KEY', env, '.env')}`,
  '',
  '# PUBLIC_BASE_URL diisi SETELAH deploy pertama berhasil dan URL Railway',
  '# sudah muncul. Dipakai media-gen untuk menyusun URL file publik.',
  '# PUBLIC_BASE_URL=https://<url-railway>',
  '',
  '# Krama & nineClip sengaja TIDAK diisi — masih lokal. Readiness keduanya',
  '# sudah diturunkan ke not_ready, jadi watcher tidak membuat alert palsu.',
  '',
];

const vercel = [
  '# ═══════════════════════════════════════════════════════════',
  '# VERCEL — project nineos-frontend',
  '# Settings → Environment Variables',
  '# Root Directory WAJIB diisi: nineos-frontend',
  '# ═══════════════════════════════════════════════════════════',
  '#',
  '# JANGAN beri awalan NEXT_PUBLIC_ pada satu pun dari ini.',
  '# Var berawalan itu ikut ter-bundle ke browser dan bisa dibaca siapa pun.',
  '',
  '# Isi setelah URL Railway sudah ada:',
  '# NINEOS_API_URL=https://<url-railway>/api/v1',
  '',
  `NINEOS_GATEWAY_TOKEN=${need('GATEWAY_TOKEN', secrets, 'DEPLOY-SECRETS.local.txt')}`,
  `NINEOS_SESSION_SECRET=${need('NINEOS_SESSION_SECRET', secrets, 'DEPLOY-SECRETS.local.txt')}`,
  `NINEOS_PASSWORD=${need('NINEOS_PASSWORD', secrets, 'DEPLOY-SECRETS.local.txt')}`,
  '',
];

const header = [
  '# ╔═════════════════════════════════════════════════════════╗',
  '# ║  NineOS — Variable siap tempel                          ║',
  '# ║  Berkas ini BERISI RAHASIA dan sudah masuk .gitignore.  ║',
  '# ║  Jangan commit, jangan tempel ke chat, jangan kirim     ║',
  '# ║  lewat WhatsApp. Boleh dihapus setelah selesai deploy.  ║',
  '# ╚═════════════════════════════════════════════════════════╝',
  '',
];

writeFileSync(OUT_PATH, [...header, ...railway, ...vercel].join('\n'), 'utf8');

console.log(`Ditulis ke: ${OUT_PATH}`);
console.log(`  Railway : ${railway.filter((l) => /^[A-Z]/.test(l)).length} variable`);
console.log(`  Vercel  : ${vercel.filter((l) => /^[A-Z]/.test(l)).length} variable siap + 1 menyusul (NINEOS_API_URL)`);
if (missing.length) {
  console.log('\n  ⚠ Perlu diisi manual:');
  for (const m of missing) console.log(`     - ${m}`);
} else {
  console.log('\n  Semua nilai ketemu otomatis.');
}
