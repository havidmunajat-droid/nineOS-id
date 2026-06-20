# NineOS — Status Progress & Checklist "Tinggal Colok"

> Terakhir diupdate: 20 Juni 2026

---

## Status Keseluruhan

| Layer | Status |
|-------|--------|
| Backend (NestJS + PostgreSQL) | ✅ Selesai — 24 tabel, 54+ endpoint |
| Frontend (Next.js 15) | ✅ Selesai — 5 halaman, dark theme Figma |
| AI Virtual Office | ✅ Aktif — Gemini Flash 2.5 connected |
| Deploy ke Railway | ⏳ Menunggu upgrade plan |

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

### Railway (Recommended untuk MVP)

- [ ] Upgrade Railway plan (perlu untuk always-on)
- [ ] Add PostgreSQL service di Railway (atau tetap pakai Neon)
- [ ] Set semua env vars di Railway dashboard:

```
DATABASE_URL=postgresql://...
GATEWAY_TOKEN=...
ENCRYPTION_KEY=...  (32 bytes random hex)
GEMINI_API_KEY=...
AI_PROVIDER=gemini
NODE_ENV=production
```

- [ ] Set build command: `npm run build`
- [ ] Set start command: `node dist/src/main.js`
- [ ] Deploy frontend ke Vercel: `cd nineos-frontend && vercel --prod`
- [ ] Set `NEXT_PUBLIC_API_URL` di Vercel ke URL Railway

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

## Next Steps (Urutan Prioritas)

1. **Revoke & regenerate Gemini API key** — key lama terekspos di chat
2. **Upgrade Railway** → deploy backend
3. **Deploy frontend ke Vercel** → set env ke Railway URL
4. **Test end-to-end** Virtual Office dari browser
5. **Colok WhatsApp token** → HelpDesk aktif
6. **Colok Instagram token** → Social Media aktif
7. **Setup n8n** → Automation pipelines aktif
8. **Colok URL + token Matcha/NotaBe** → data real masuk

---

## Sesi Berikutnya

Lanjutkan di sesi ini atau buat sesi baru. Claude akan membaca memory project ini secara otomatis. Cukup sebut apa yang mau dikerjakan (deploy, colok token X, dll).
