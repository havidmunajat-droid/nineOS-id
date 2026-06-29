# NineOS — Status Progress & Checklist "Tinggal Colok"

> Terakhir diupdate: 29 Juni 2026

---

## Status Keseluruhan

| Layer | Status |
|-------|--------|
| Backend (NestJS + PostgreSQL) | ✅ Selesai — 24 tabel, 54+ endpoint |
| Frontend (Next.js 15) | ✅ Selesai — 5 halaman, dark theme Figma |
| AI Virtual Office | ✅ Aktif — Gemini Flash 2.5 connected |
| **Integrasi Krama (KPI live)** | ✅ Selesai — NineOS baca KPI Krama real-time |
| **Content Studio (AI Konten)** | ✅ Selesai — caption Gemini + media-gen (mock/Google) + preview + posting |
| **Media-gen Google (Veo/Imagen)** | ✅ Kode siap — tinggal aktifkan billing Google |
| Deploy config (Railway) | ✅ `railway.json` siap — TAPI Railway tak lagi free (min $5/bln) |
| Deploy aktual | ⏳ Belum — pertimbangkan Render/Fly.io/Koyeb (gratis) |

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

- [ ] URL API Matcha backend (contoh: `https://api.matcha.id`)
- [ ] API key / token Matcha
- [ ] URL API NotaBe backend
- [ ] API key / token NotaBe
- [ ] URL API Krama (kalau sudah ready)
- [ ] URL API Nine Studio (kalau sudah ready)

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

- [x] Gemini API key — ✅ sudah ada (perlu regenerate yang baru)
- [ ] **Regenerate Gemini API key** — key lama terekspos di chat, revoke di Google AI Studio
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
1. **Revoke & regenerate Gemini API key** — key lama terekspos di chat (aistudio.google.com)
2. **Deploy backend** → pilih Render (gratis) atau Railway (berbayar), pakai `railway.json`
3. **Deploy frontend ke Vercel** → set `NEXT_PUBLIC_API_URL` ke URL backend
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
