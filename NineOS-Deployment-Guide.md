# NineOS — Deployment Guide & Checklist Produksi

> Dokumen ini menjelaskan apa yang dibutuhkan untuk setiap modul bisa berjalan penuh,
> pilihan infrastruktur untuk produksi, dan checklist sebelum go-live.

---

## 1. Status Saat Ini (per 20 Juni 2026)

| Layer | Status | Keterangan |
|---|---|---|
| Backend NestJS | ✅ Berjalan | Port 3000, local dev |
| Database | ✅ Berjalan | Neon PostgreSQL (cloud), 19 tabel |
| Modul 1 — Platform Config | ✅ API siap | Menunggu URL & credentials backend Matcha/NotaBe |
| Modul 2 — HelpDesk | ✅ API siap | Menunggu WhatsApp Business API token |
| Modul 3 — Social Media | ✅ API siap | Menunggu Instagram Graph API token |
| Modul 4 — Automation | ✅ API siap | Menunggu n8n instance |
| Modul 5 — Virtual Office | 🔄 In progress | Butuh Anthropic API key |

---

## 2. "Tinggal Colok" — Data yang Dibutuhkan per Modul

### Modul 1 — Konfigurasi Platform (Matcha & NotaBe)

Untuk setiap platform yang siap, founder perlu provide:

```
Platform: Matcha
- Base URL backend       : https://api.matcha.id  (atau URL staging)
- Auth type              : api_key / oauth2 (pilih salah satu)
- API Key                : sk_live_xxxxxxxxxxxx
- Webhook Secret         : (untuk validasi event dari Matcha ke NineOS)
- Environment            : staging / production
```

**Cara colok:** `POST /api/v1/platforms/matcha/connections`
```json
{
  "environment": "staging",
  "base_url": "https://api.matcha.id",
  "auth_type": "api_key",
  "api_key": "sk_live_xxxxxxxxxxxx",
  "webhook_secret": "whsec_xxxxxxxxxxxx"
}
```
Kredensial langsung dienkripsi AES-256-GCM, tidak pernah dikembalikan di response.

---

### Modul 2 — HelpDesk (WhatsApp)

Yang dibutuhkan dari Meta/WhatsApp Business:

| Item | Dapat dari mana |
|---|---|
| WhatsApp Business Phone Number ID | Meta Business Manager → WhatsApp |
| WhatsApp Access Token | Meta Developer Portal → System User Token |
| Webhook Verify Token | Kamu buat sendiri (string acak) |
| Meta App Webhook URL | `https://[domain-nineos]/api/v1/webhooks/matcha/whatsapp` |

**Cara colok:** `POST /api/v1/helpdesk/matcha/channels`
```json
{
  "channel_type": "whatsapp",
  "channel_identifier": "+628xxxxxxxxxx",
  "access_token": "EAAxxxx...",
  "webhook_verify_token": "nineos_verify_123"
}
```

---

### Modul 3 — Social Media (Instagram)

Yang dibutuhkan dari Meta:

| Item | Dapat dari mana |
|---|---|
| Instagram Business Account ID | Meta Business Manager |
| Instagram Access Token (long-lived) | Meta Graph API OAuth flow |
| Token expires_at | Cek via `/me?fields=token_expiration_time` |

**Cara colok:** `POST /api/v1/social/matcha/accounts/instagram`
```json
{
  "account_handle": "@matchaid",
  "account_id_external": "17841400000000000",
  "oauth_token": "EAAxxxx...",
  "token_expires_at": "2026-12-31T00:00:00Z"
}
```

---

### Modul 4 — Automation Engine (n8n)

Yang dibutuhkan:
- n8n instance (bisa cloud atau self-hosted — lihat Section 4)
- n8n dikonfigurasi dengan `NINEOS_GATEWAY_TOKEN` sebagai header
- n8n workflows dikonfigurasi untuk hit endpoint NineOS

Tidak ada "colok" data — ini setup satu kali, bukan per-session.

---

### Modul 5 — Virtual Office (AI)

Yang dibutuhkan:
- **Anthropic API Key** — dapat dari: https://console.anthropic.com/settings/keys
- Tambahkan ke `.env`: `ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx`

Tidak butuh data nyata dari Modul 1-4 untuk testing — Virtual Office bisa langsung ditest setelah API key di-set karena AI akan menjawab berdasarkan context dari DB (yang sudah ada seed data).

---

## 3. Infrastruktur — Rekomendasi untuk Produksi

### Pilihan A — Minimal (untuk mulai, biaya rendah)

```
Frontend Dashboard  →  Vercel (gratis s/d medium traffic)
Backend NestJS      →  Railway ($5/bulan) atau Render (gratis tier ada)
Database            →  Neon (sudah ada, gratis tier cukup untuk awal)
n8n                 →  n8n.cloud ($20/bulan) atau Railway instance kedua
```

**Railway** adalah pilihan terbaik untuk NestJS karena:
- Support Node.js long-running process (tidak seperti Vercel yang serverless)
- Auto-deploy dari GitHub
- $5/bulan untuk starter

> ⚠️ **Vercel TIDAK cocok untuk NestJS backend** — Vercel hanya untuk Next.js / serverless functions.
> Vercel cocok hanya untuk frontend dashboard NineOS.

### Pilihan B — Lebih Stabil (jangka panjang)

```
Frontend Dashboard  →  Vercel
Backend NestJS      →  Fly.io (lebih kontrol, murah)
Database            →  Neon Pro ($19/bulan, connection pooling lebih baik)
n8n                 →  Self-hosted di Fly.io atau VPS
```

### Pilihan C — GitHub + Railway (paling mudah untuk mulai)

1. Push kode ke GitHub repo `nineOS-id`
2. Connect Railway ke repo tersebut
3. Set environment variables di Railway dashboard
4. Railway auto-deploy setiap push ke `main`

---

## 4. Environment Variables — Checklist Lengkap

```env
# === WAJIB ADA ===
DATABASE_URL="postgresql://...@neon.tech/neondb?sslmode=require"
GATEWAY_TOKEN="ganti-dengan-string-panjang-acak-produksi"
ENCRYPTION_KEY="64-karakter-hex-acak-untuk-AES-256"
PORT=3000
NODE_ENV=production

# === Modul 5 Virtual Office ===
ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxx"

# === Opsional (untuk integrasi n8n) ===
N8N_WEBHOOK_URL="https://app.n8n.cloud/webhook/xxxxx"

# === Opsional (untuk notif langsung tanpa n8n) ===
TELEGRAM_BOT_TOKEN="xxxxx:xxxxxxxx"
TELEGRAM_CHAT_ID="-100xxxxxxxxx"
```

---

## 5. Checklist Sebelum Go-Live

### Keamanan
- [ ] Ganti `GATEWAY_TOKEN` dari `dev_gateway_token_*` ke token acak panjang (min 64 karakter)
- [ ] Ganti `ENCRYPTION_KEY` ke key baru yang di-generate fresh
- [ ] Pastikan `.env` tidak pernah di-commit ke GitHub (sudah ada di `.gitignore`)
- [ ] Aktifkan HTTPS (Railway/Fly.io auto-handle ini)
- [ ] Set `NODE_ENV=production`

### Database
- [ ] Jalankan `npx prisma migrate deploy` (bukan `migrate dev`) di production
- [ ] Backup database sebelum setiap migration produksi
- [ ] Review Neon plan — free tier limit 0.5 GB, upgrade kalau perlu

### API
- [ ] Test semua endpoint via Swagger (`/api/docs`) sebelum frontend connect
- [ ] Rate limiting (belum diimplementasi — tambahkan sebelum expose ke publik)
- [ ] CORS policy — set `origin` spesifik, bukan `*`

---

## 6. GitHub Repository Setup

Jika ingin push ke GitHub:

```bash
# Di folder nineos-backend:
git init
git add .
git commit -m "feat: NineOS backend Wave 1-3 (Modul 1-4)"
git remote add origin https://github.com/[username]/nineos-backend.git
git push -u origin main
```

**Pastikan `.gitignore` sudah ada** (sudah ada dari NestJS scaffold):
- `.env` — JANGAN pernah di-commit
- `node_modules/`
- `dist/`

---

## 7. Ringkasan Biaya Estimasi (Pilihan A)

| Service | Plan | Biaya/bulan |
|---|---|---|
| Neon (DB) | Free | $0 |
| Railway (Backend) | Starter | ~$5 |
| Vercel (Frontend, nanti) | Hobby | $0 |
| n8n.cloud | Starter | $20 |
| Anthropic API (Modul 5) | Pay per use | ~$5–20 (tergantung usage) |
| **Total estimasi** | | **~$25–45/bulan** |

---

*Dokumen ini diperbarui setiap wave selesai. Terakhir diperbarui: 20 Juni 2026 (Wave 3 selesai).*
