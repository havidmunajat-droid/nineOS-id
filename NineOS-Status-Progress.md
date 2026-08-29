# NineOS — Status Progress & Checklist "Tinggal Colok"

> Terakhir diupdate: 29 Agustus 2026

---

## Status Keseluruhan

| Layer | Status |
|-------|--------|
| Backend (NestJS + PostgreSQL) | ✅ Selesai — 24 tabel + scheduledAt migration, 54+ endpoint |
| Frontend (Next.js 15) | ✅ Selesai — 5 halaman, dark theme Figma |
| AI Virtual Office + Daily Meeting | ✅ Chat 1-on-1 + Meeting 22:00 dengan semua C-Level |
| **Agentic AI (Wave 6)** | ✅ AKTIF — executive menarik data live sendiri via tool, watcher proaktif tiap jam, briefing pagi 07:00 WIB |
| **KPI 4 Platform Live** | ✅ Matcha + NotaBe (production) + Krama + nineClip (lokal) |
| **Content Studio (AI Konten)** | ✅ Generate caption Gemini + Set Jadwal + section Jadwal Hari Ini |
| **Social Media Jadwal Manual** | ✅ Kapten set tanggal/jam, posting manual, tandai Posted |
| **Media-gen Google (Veo/Imagen)** | ✅ Kode siap — tinggal aktifkan billing Google |
| Deploy config | ✅ `railway.json` + `render.yaml` + `vercel.json` siap |
| Deploy aktual | ⏳ Tunggu kapten siapkan Railway ($5/bln) |
| Test visual | ✅ Via **localhost** (FE :3100, BE :3000) |

---

## ✅ Yang Selesai Sesi Ini (21 Juni 2026)

### Integrasi NineOS ↔ Krama
- `PlatformKpiService` — NineOS fetch KPI live dari Krama (`GET /nineos/kpi`)
- Endpoint baru: `GET /platforms/:slug/kpi` dan `GET /platforms/kpi/all`
- Frontend: section "Krama Platform — KPI Hari Ini" (5 kartu: order, revenue, driver online, merchant buka, produk)
- Auth via header `X-NineOS-Key`; key terenkripsi dengan fallback plaintext (dev/seed)
- Krama terdaftar di NineOS sebagai platform `ready` + `PlatformConnection`

### Deploy Prep
- `railway.json` ditambahkan (startCommand: `prisma migrate deploy && npm run start:prod`)
- Fix `start:prod` → `dist/src/main` (sebelumnya salah `dist/main`)
- `build` kini jalankan `prisma generate`; `dotenv` dipindah ke dependencies
- ⚠️ Railway sudah TIDAK punya free tier. Alternatif gratis: **Render** (rekomendasi), Fly.io, Koyeb

---

## Checklist Per Modul — Yang Tinggal "Colok"

### Modul 1 — Konfigurasi Backend
Backend schema & API sudah siap. Yang dibutuhkan:

- [x] URL API Matcha backend — ✅ dicolok 3 Juli 2026 (`https://matchascore.com/api`, via env `MATCHA_API_URL`)
- [x] API key / token Matcha — ✅ `MATCHA_NINEOS_KEY` di `.env` (KPI live: kandidat, lowongan, revenue)
- [x] URL API NotaBe backend — ✅ dicolok 3 Juli 2026 (Supabase Edge Function production, via `NOTABE_API_URL`)
- [x] API key / token NotaBe — ✅ `NOTABE_NINEOS_KEY` di `.env` (KPI live: user aktif, toko, pelanggan, keuangan)
- [x] URL API Krama — ✅ lokal `KRAMA_API_URL` (ganti URL produksi saat Krama deploy)
- [x] URL API nineClip — ✅ dicolok 3 Juli 2026 (lokal port **3002** via `NINECLIP_API_URL` — port 3001 bentrok Krama, `PORT=3002` sudah diset di `nineClip/api/.env`)
- [ ] URL API Nine Studio (skip — belum ready)
- [x] URL API NotaBe — ✅ dicolok 3 Juli 2026 (Supabase Edge Function, production)

**Cara colok:** masukkan ke `platform_connections` via endpoint `POST /api/v1/platforms/:slug/connections`

---

### Modul 2 — HelpDesk
Schema & AI auto-reply engine sudah siap. Yang dibutuhkan:

- [ ] **WhatsApp Business API token** (dari Meta Business Manager)
- [ ] **WhatsApp Phone Number ID**
- [ ] **WhatsApp Business Account ID**
- [ ] Webhook URL: `https://[domain]/api/v1/webhooks/whatsapp`

**Cara colok:** simpan token di `platform_connections` dengan `connection_type = 'whatsapp'` + daftarkan webhook di Meta

---

### Modul 3 — Social Media
Content management engine sudah siap. Yang dibutuhkan:

- [ ] **Instagram Graph API token** (dari Meta for Developers)
- [ ] **Instagram Business Account ID** (Matcha)
- [ ] Instagram token NotaBe (opsional, kalau ada akun terpisah)
- [ ] TikTok API credentials (Wave 4 — belum urgent)

**Cara colok:** simpan di `social_accounts` via `POST /api/v1/platforms/:slug/social-media/accounts`

---

### Modul 4 — Automation
Pipeline registry & alert engine sudah siap. Yang dibutuhkan:

- [ ] **n8n instance** (self-hosted atau n8n Cloud)
- [ ] n8n workflow IDs setelah workflow dibuat di n8n
- [ ] Email SMTP untuk report (opsional: Resend / SendGrid API key)

**Cara colok:** update `n8n_workflow_id` di `automation_pipelines` setelah import workflow ke n8n

---

### Modul 5 — Virtual Office
AI sudah berjalan dengan Gemini Flash 2.5. Yang dibutuhkan:

- [x] Gemini API key — ✅ key baru terpasang & ditest jalan (3 Juli 2026)
- [ ] Anthropic API key (opsional — fallback provider)

**Cara colok:** update `GEMINI_API_KEY` di `.env` backend

---

## Infrastruktur — Checklist Deploy

### Deploy Backend (Railway / Render / Fly.io)

> `railway.json` sudah disiapkan. Railway TIDAK lagi punya free tier (min $5/bln).
> Untuk gratis pakai **Render** (spin-down 15 mnt), Fly.io, atau Koyeb.

- [ ] Pilih platform (Railway berbayar / Render gratis)
- [ ] Root directory: `nineos-backend`
- [ ] DB tetap pakai Neon PostgreSQL (sudah ada)
- [ ] Set semua env vars di dashboard:

```
DATABASE_URL=postgresql://...
GATEWAY_TOKEN=...
ENCRYPTION_KEY=...  (32 bytes random hex)
GEMINI_API_KEY=...
AI_PROVIDER=gemini
NODE_ENV=production
KRAMA_API_URL=https://<url-krama>/api/v1
KRAMA_NINEOS_KEY=key_untuk_nineOS_baca_kpi
```

- [ ] Build command: `npm run build` (sudah include `prisma generate`)
- [ ] Start command: `npm run start:prod` (sudah benar: `dist/src/main`)
- [ ] Deploy frontend ke Vercel: `cd nineos-frontend && vercel --prod`
- [ ] Set `NEXT_PUBLIC_API_URL` di Vercel ke URL backend

---

## Arsitektur Sistem

```
Founder Browser
      │
      ▼
Vercel (Next.js Frontend)
      │  HTTPS
      ▼
Railway (NestJS Backend :3000)
      │
      ├── Neon PostgreSQL (24 tabel)
      ├── Gemini Flash 2.5 (Virtual Office AI)
      ├── Krama Backend :3001 (KPI live) ← ✅ tersambung
      ├── n8n (Automation pipelines) ← belum setup
      └── Meta API (WhatsApp + Instagram) ← token belum colok
```

---

## File Penting

| File | Keterangan |
|------|-----------|
| `nineos-backend/.env` | Env vars backend — JANGAN commit |
| `nineos-frontend/.env.local` | Env vars frontend — JANGAN commit |
| `nineos-backend/prisma/schema.prisma` | Schema 24 tabel |
| `nineos-backend/prisma/seed.ts` | Seed data awal (6 executives, 4 platforms) |
| `NineOS-Deployment-Guide.md` | Guide deployment lengkap dengan cost estimate |

---

## Next Steps (Urutan Prioritas) — BELUM DIKERJAKAN

### 🔴 Prioritas Tinggi
1. **Revoke & regenerate Gemini API key** — key lama terekspos di chat. Cara: aistudio.google.com/apikey → klik ikon hapus di key lama → buat key baru → isi `.env` (lokal) & env deploy
2. **Deploy backend → Railway** (kapten siapkan akun $5/bln). `render.yaml`/`railway.json` sudah siap. Catatan: Render/Koyeb/Fly semua minta kartu kredit di awal — Railway dipilih.
   Env vars yang harus diset di Railway: `DATABASE_URL`, `GATEWAY_TOKEN`, `ENCRYPTION_KEY`, `GEMINI_API_KEY`, `AI_PROVIDER=gemini`, `NODE_ENV=production`, `KRAMA_API_URL`, `KRAMA_NINEOS_KEY`, `PUBLIC_BASE_URL`
3. **Deploy frontend ke Vercel** → ⚠️ build gagal karena root salah. FIX: Vercel Settings → **Root Directory = `nineos-frontend`** → Redeploy. Lalu set `NEXT_PUBLIC_API_URL` = URL backend Railway + `/api/v1`
4. **Set `PUBLIC_BASE_URL`** di env → arahkan ke URL backend deploy (untuk media-gen storage)

### 🟡 Untuk Content Studio produksi
5. **Aktifkan billing Google** (ai.dev/projects) → uncomment `MEDIA_PROVIDER=google` di `.env`
6. **Storage cloud** (S3/Cloudinary) → replace `StorageService.saveBase64()` tanpa ubah pemanggil
7. **API channel nyata** → wire Meta Graph API / WA di `publishNow()` (sekarang masih simulasi `sim_*`)

### 🟢 Colok platform & token
8. **Colok WhatsApp token** (Meta Business Manager) → HelpDesk aktif
9. **Colok Instagram token** (Meta for Developers) → Social Media aktif
10. **Setup n8n** → Automation pipelines aktif
11. **Colok URL + token Matcha/NotaBe** → data real masuk (Krama sudah live)

---

## Sesi Berikutnya

Lanjutkan di sesi ini atau buat sesi baru. Claude akan membaca memory project ini secara otomatis. Cukup sebut apa yang mau dikerjakan (deploy, colok token X, dll).

---

## 🤖 Wave 6 — Agentic AI (29 Agustus 2026)

AI NineOS naik kelas: dari **chatbot berkonteks statis** menjadi **agent yang menarik datanya sendiri dan boleh bertindak**.

### Apa yang berubah secara mendasar

| Sebelum | Sesudah |
|---|---|
| `buildContext()` nge-dump blob data tetap sekali di awal | Executive memilih sendiri tool mana yang dipanggil, berkali-kali, sampai cukup |
| Matcha & NotaBe **tidak pernah** masuk ke otak AI | KPI live dua platform itu jadi tool kelas satu |
| AI cuma bisa bicara | AI bisa bikin alert, catat keuangan, draft konten — dan mengajukan aksi sensitif untuk disetujui |
| AI hanya jalan kalau ditanya | Watcher jalan tiap jam; briefing CEO otomatis tiap 07:00 WIB |

### Komponen baru

| File | Peran |
|---|---|
| `src/common/agent/agent.types.ts` | Kontrak tool — subset JSON Schema yang diterima Gemini DAN Anthropic |
| `src/common/ai/ai.service.ts` | `runAgent()` — loop tool-calling dua provider + retry hormat-kuota |
| `src/modules/agent/agent-tools.service.ts` | Registry 14 tool + dispatcher + gerbang approval |
| `src/modules/agent/agent-runner.service.ts` | Penjalan agent + antrian approve/reject + suntik jam WIB |
| `src/modules/watcher/platform-watcher.service.ts` | Cron snapshot KPI, deteksi anomali, briefing pagi |

### Tingkat risiko tool

- **read** (8 tool) — langsung jalan, tidak mengubah apa pun
- **write** (3 tool) — `create_alert`, `record_finance_snapshot`, `draft_content`. Langsung jalan, tercatat di `agent_actions`
- **sensitive** (3 tool) — `schedule_content`, `escalate_helpdesk_conversation`, `set_platform_readiness`. **Ditahan** jadi `pending_approval` sampai kapten menyetujui

Ubah lewat `AGENT_AUTONOMY` di `.env`: `guarded` (default) atau `full`.

### Tabel database baru

- `platform_kpi_snapshots` — memori historis KPI (bahan deteksi tren & anomali)
- `agent_actions` — audit trail tiap tool yang dipanggil + antrian approval

Migrasi: `20260829050606_wave6_agentic_ai_layer`

### Endpoint baru

```
GET  /api/v1/agent/tools?role=CFO          list tool + tingkat risiko
POST /api/v1/agent/tools/:name/run         jalankan satu tool manual (debug)
GET  /api/v1/agent/actions?status=...      audit trail aksi agent
POST /api/v1/agent/actions/:id/approve     setujui aksi sensitif → langsung eksekusi
POST /api/v1/agent/actions/:id/reject      tolak aksi sensitif
POST /api/v1/agent/watcher/run             paksa siklus watcher sekarang
POST /api/v1/agent/watcher/briefing        paksa briefing CEO sekarang
GET  /api/v1/agent/watcher/snapshots       riwayat snapshot KPI
GET  /api/v1/agent/watcher/status          status watcher + jumlah pending
```

### Hasil uji end-to-end (29 Agustus 2026, data produksi asli)

- **CFO** ditanya banding Matcha vs NotaBe → memanggil `get_platform_kpi` 2× sendiri, membaca Rp140.800 omzet NotaBe yang seluruhnya masih piutang, dan menyimpulkan masalah cash flow. Tanpa angka karangan.
- **CMO** diminta draft + jadwalkan konten → `draft_content` jalan, `schedule_content` **ditahan** dengan `action_id`, dan AI terus terang bilang "belum berjalan". Setelah di-approve, konten benar-benar terjadwal 30 Agu 19:00 WIB.
- **Watcher** merekam 2 snapshot (Matcha + NotaBe) dan otomatis membuat 2 alert critical untuk Krama & nineClip yang backend lokalnya mati.
- **Briefing CEO** menarik 3 tool sendiri dan menyusun laporan 4 bagian dari angka nyata.

### Dua bug yang ketahuan saat uji dan sudah diperbaiki

1. **Agent tidak tahu hari ini tanggal berapa** — permintaan "jadwalkan besok" diterjemahkan ke `2024-05-16`. Diperbaiki: `AgentRunnerService.clockBlock()` menyuntikkan jam dinding WIB ke setiap agent run.
2. **`get_platform_health` bohong** — melaporkan NotaBe `not_configured` karena kredensialnya di env var, bukan tabel `platform_connections`. Akibatnya briefing CEO salah menyebut NotaBe bermasalah. Diperbaiki: tool sekarang membuktikan hidup-matinya dengan `kpi_reachable` (panggilan KPI nyata) dan melaporkan sumber kredensial apa adanya.

### ⚠️ Batasan yang perlu kapten tahu

**Gemini free tier dibatasi 5 request/menit.** Satu giliran agentic butuh beberapa request (1 awal + 1 per putaran tool), jadi pemakaian beruntun akan kena HTTP 429. Sudah ditangani dengan retry otomatis sesuai `retryDelay` provider (maks 3 percobaan), tapi jawabannya jadi lambat.

Dua jalan keluar:
1. Aktifkan billing Gemini di https://ai.dev/projects — kuota naik drastis
2. Isi `ANTHROPIC_API_KEY` di `.env` — loop Anthropic sudah dibangun lengkap, tinggal ganti `AI_PROVIDER=anthropic`
