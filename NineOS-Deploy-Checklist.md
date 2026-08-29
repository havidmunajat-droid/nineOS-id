# NineOS — Checklist Deploy Live (Matcha + NotaBe)

> Dibuat: 29 Agustus 2026 · Backend → Railway Hobby · Frontend → Vercel
> Nilai rahasia ada di `DEPLOY-SECRETS.local.txt` (sudah di-gitignore, jangan dibuka di chat)

---

## Peta arsitektur saat live

```
Browser kapten
      │  HTTPS
      ▼
Vercel — Next.js frontend
      │  ← gateway token ADA DI SINI, tidak pernah sampai ke browser
      │  proxy: app/api/[...path]/route.ts
      ▼
Railway — NestJS backend
      ├── Neon PostgreSQL (26 tabel)
      ├── Gemini Flash 2.5 (agentic tool-calling)
      ├── matchascore.com/api        ← KPI live
      └── Supabase Edge Function     ← KPI live NotaBe
```

Backend **tidak bisa** ditaruh di Vercel: watcher butuh cron tiap jam (Vercel Hobby
hanya 1×/hari) dan satu giliran agentic bisa lewat batas waktu function.

---

## Langkah 1 — Railway (backend)

1. New Project → Deploy from GitHub repo → `havidmunajat-droid/nineOS-id`
2. **Root Directory: `nineos-backend`**
3. Start command sudah diatur `railway.json`: `npx prisma migrate deploy && npm run start:prod`
   (migrasi `wave6_agentic_ai_layer` otomatis ikut jalan)
4. Isi Variables:

| Variable | Nilai |
|---|---|
| `DATABASE_URL` | connection string Neon (sama dengan lokal) |
| `GATEWAY_TOKEN` | ⚠️ dari `DEPLOY-SECRETS.local.txt` — BUKAN yang lama |
| `ENCRYPTION_KEY` | ⚠️ dari `DEPLOY-SECRETS.local.txt` — BUKAN yang lama |
| `AI_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | key BARU (regenerate dulu, key lama pernah terekspos) |
| `NODE_ENV` | `production` |
| `AGENT_AUTONOMY` | `guarded` |
| `AGENT_WATCHER` | `on` |
| `MATCHA_API_URL` | `https://matchascore.com/api` |
| `MATCHA_NINEOS_KEY` | dari `.env` lokal |
| `NOTABE_API_URL` | URL Supabase Edge Function |
| `NOTABE_NINEOS_KEY` | dari `.env` lokal |
| `PUBLIC_BASE_URL` | URL Railway setelah dapat (untuk media-gen) |

> Krama & nineClip sengaja **tidak** diisi. Readiness-nya sudah diturunkan ke
> `not_ready`, jadi watcher tidak akan membuat alert palsu untuk keduanya.

5. Catat URL Railway, mis. `https://nineos-backend-production.up.railway.app`

**Verifikasi:**
```bash
curl -H "Authorization: Bearer <GATEWAY_TOKEN_BARU>" https://<url-railway>/api/v1/agent/watcher/status
```
Harus balik JSON `{"enabled":true,"autonomy":"guarded",...}`.

---

## Langkah 2 — Vercel (frontend)

1. Import repo yang sama
2. **Settings → Build & Deployment → Root Directory = `nineos-frontend`**
   (ini penyebab build gagal waktu percobaan 30 Juni)
3. Isi Environment Variables:

| Variable | Nilai |
|---|---|
| `NINEOS_API_URL` | `https://<url-railway>/api/v1` |
| `NINEOS_GATEWAY_TOKEN` | sama persis dengan `GATEWAY_TOKEN` di Railway |
| `NINEOS_SESSION_SECRET` | dari `DEPLOY-SECRETS.local.txt` |
| `NINEOS_PASSWORD` | dari `DEPLOY-SECRETS.local.txt` — password untuk masuk dashboard |

> ⚠️ **Keempatnya tanpa awalan `NEXT_PUBLIC_`.** Var berawalan itu ikut
> ter-bundle ke browser dan bisa dibaca siapa pun lewat devtools. Inilah
> celah yang ditutup oleh BFF `app/api/[...path]/route.ts`.

> Kalau `NINEOS_SESSION_SECRET` lupa diisi, `proxy.ts` menolak SEMUA request
> dengan HTTP 500. Ini disengaja — salah konfigurasi harus berujung
> dashboard tertutup, bukan dashboard terbuka.

4. Deploy. URL `*.vercel.app` sudah cukup untuk live — domain bisa nyusul kapan saja.

---

## Langkah 3 — Setelah live, cek ini

- [ ] Buka URL Vercel dalam jendela penyamaran → harus dialihkan ke `/login`
- [ ] Coba password salah → muncul "Password salah"
- [ ] Masuk dengan password benar → dashboard terbuka
- [ ] Buka `/virtual-office` → tanya CFO *"berapa omzet NotaBe hari ini?"* → harus jawab dengan angka nyata
- [ ] Devtools → Network → panggilan menuju `/api/...` di domain Vercel, **bukan** ke URL Railway
- [ ] Devtools → Sources → cari `GATEWAY_TOKEN` → harus nihil
- [ ] `POST /api/agent/watcher/run` → snapshot bertambah
- [ ] Tunggu sampai 07:00 WIB besok → sesi "Briefing Pagi" muncul sendiri di Virtual Office

---

## Keamanan — sudah ditutup

| Lapis | Berkas | Fungsi |
|---|---|---|
| Gerbang login | `proxy.ts` | Semua halaman dan `/api/...` wajib punya cookie sesi yang sah |
| Sesi | `lib/session.ts` | Cookie httpOnly bertanda tangan HMAC-SHA256, berlaku 7 hari |
| Token backend | `app/api/[...path]/route.ts` | Gateway token ditambahkan di server, tidak pernah sampai ke browser |

Diuji: API tanpa login → 401 · halaman tanpa login → dialihkan ke `/login` ·
password salah → 401 · cookie dipalsukan → 401 · 20 script halaman dipindai,
tidak ada satu pun yang memuat token.

Ganti password kapan saja lewat env `NINEOS_PASSWORD` di Vercel. Mengganti
`NINEOS_SESSION_SECRET` akan me-logout semua sesi yang sedang berjalan.

---

## Yang masih terbuka setelah deploy

### 🔴 Kuota Gemini free tier — 20 request PER HARI
Diukur langsung ke API pada 29 Agustus 2026:

```
quotaId : GenerateRequestsPerDayPerProjectPerModel-FreeTier
value   : 20
```

Satu giliran agentic makan 2–4 request; briefing pagi otomatis saja 4.
Jadi kuota harian habis setelah ±5 pertanyaan.

**Yang TIDAK terpengaruh** (semuanya deterministik, tanpa AI):
dashboard KPI Matcha & NotaBe, watcher snapshot tiap jam, deteksi anomali,
dan alert otomatis. Jadi deploy tetap berguna sejak hari pertama.

**Yang terpengaruh:** chat Virtual Office dan briefing pagi.

Solusi, pilih salah satu:
1. Isi `ANTHROPIC_API_KEY` di Railway lalu ubah `AI_PROVIDER=anthropic` —
   nol perubahan kode, nol redeploy frontend
2. Aktifkan billing Gemini di https://ai.dev/projects

### 🟡 Satu baris lama tidak bisa didekripsi
Setelah `ENCRYPTION_KEY` dirotasi, baris `platform_connections` milik Matcha
(status `pending`) tidak bisa didekripsi lagi. Aman — KPI Matcha berjalan
lewat env var `MATCHA_API_URL`/`MATCHA_NINEOS_KEY`, bukan lewat baris itu.

### 🟡 Database dipakai bersama lokal & produksi
`DATABASE_URL` Neon yang sama dipakai dev dan produksi, jadi percobaan di
lokal ikut masuk ke data produksi. Kalau nanti mengganggu, buat branch
database terpisah di Neon (gratis).
