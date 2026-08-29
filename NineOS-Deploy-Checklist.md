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

> ⚠️ **Tanpa awalan `NEXT_PUBLIC_`.** Var berawalan itu ikut ter-bundle ke
> browser dan bisa dibaca siapa pun lewat devtools. Inilah celah yang
> ditutup oleh proxy `app/api/[...path]/route.ts`.

4. Deploy. URL `*.vercel.app` sudah cukup untuk live — domain bisa nyusul kapan saja.

---

## Langkah 3 — Setelah live, cek ini

- [ ] Buka `/virtual-office` → tanya CFO *"berapa omzet NotaBe hari ini?"* → harus jawab dengan angka nyata
- [ ] Buka devtools → Network → pastikan panggilan menuju `/api/...` di domain Vercel, **bukan** ke URL Railway
- [ ] Devtools → Sources → cari `GATEWAY_TOKEN` → harus nihil
- [ ] `POST /api/agent/watcher/run` → snapshot bertambah
- [ ] Tunggu sampai 07:00 WIB besok → sesi "Briefing Pagi" muncul sendiri di Virtual Office

---

## Yang masih terbuka setelah deploy

### 🔴 Dashboard belum punya login
Proxy menutup pencurian token, tapi **tidak** menutup akses. Siapa pun yang
tahu URL `*.vercel.app` bisa membuka dashboard dan memanggil `/api/...`,
karena proxy menambahkan token untuk siapa saja yang meminta.

Untuk dashboard yang memuat KPI bisnis Matcha & NotaBe, ini perlu ditutup
sebelum URL-nya disebar. Opsi:
1. Gerbang password satu-pengguna (cookie httpOnly bertanda tangan) — sepenuhnya
   di bawah kendali kita, jalan di host mana pun
2. Vercel Deployment Protection — tergantung paket Vercel kapten

### 🟡 Kuota Gemini free tier
5 request/menit, sementara satu giliran agentic butuh beberapa request.
Sudah ada retry otomatis, tapi kalau dipakai beruntun akan muncul pesan
*"Kuota AI provider habis"*. Solusi: aktifkan billing Gemini, atau isi
`ANTHROPIC_API_KEY` lalu ubah `AI_PROVIDER=anthropic` (nol perubahan kode).

### 🟡 Satu baris lama tidak bisa didekripsi
Setelah `ENCRYPTION_KEY` dirotasi, baris `platform_connections` milik Matcha
(status `pending`) tidak bisa didekripsi lagi. Aman — KPI Matcha berjalan
lewat env var `MATCHA_API_URL`/`MATCHA_NINEOS_KEY`, bukan lewat baris itu.

### 🟡 Database dipakai bersama lokal & produksi
`DATABASE_URL` Neon yang sama dipakai dev dan produksi, jadi percobaan di
lokal ikut masuk ke data produksi. Kalau nanti mengganggu, buat branch
database terpisah di Neon (gratis).
