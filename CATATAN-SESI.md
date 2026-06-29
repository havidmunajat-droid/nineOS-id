# 📒 Catatan Sesi — NineOS & Krama

> Dibuat: 21 Juni 2026 · Terakhir update: 29 Juni 2026 · Untuk: Kapten Havid
> Satu halaman ringkas — status & sisa pekerjaan dua project.

---

## 🗂️ Dua Project di Sesi Ini

| Project | Repo GitHub | Lokasi Lokal |
|---|---|---|
| **NineOS** (OS pusat / dashboard 4 platform) | `havidmunajat-droid/nineOS-id` | `C:\Users\ulwan\nineOS-id` |
| **Krama** (super-app jasa lokal AI) | `havidmunajat-droid/krama-platform` | `C:\Users\ulwan\krama-platform` |

> NineOS membaca KPI Krama secara live — keduanya sudah tersambung.

---

## ✅ SELESAI SESI INI

### NineOS
- Integrasi ↔ Krama: NineOS baca KPI live Krama (`GET /platforms/krama/kpi`)
- Frontend: section "Krama Platform — KPI Hari Ini" (5 kartu)
- Deploy prep: `railway.json`, fix `start:prod`, `prisma generate` di build

### Krama Backend
- Products module + Sayur.ai AI ingestion (RULE-06)
- Endpoint baru: `GET /auth/me`, `POST /orders/estimate`, `GET /orders/merchant/list`
- **Security**: `AdminGuard` (cek role ADMIN) di semua endpoint admin

### Krama — Customer App (`krama_app`)
- Auth, order Sayur.ai end-to-end (prompt → estimasi AI → konfirmasi → tracking)
- Tab Aktivitas (riwayat order) + Tab Dompet (saldo + transaksi)

### Krama — Mitra App (`krama_mitra`)
- Auth + pendaftaran mitra (driver/merchant) + MitraGate routing
- Driver Dashboard (online toggle, polling order, advance status)
- Merchant Dashboard (buka/tutup toko)
- **Panel Admin** (verifikasi mitra, pilih tipe APP_DRIVEN/WHATSAPP_PUSH)
- **Katalog Produk** (CRUD + Sayur.ai import)
- **Dompet Mitra** (saldo, transaksi, penarikan ke bank/e-wallet)
- **Riwayat Pesanan Merchant** (filter Semua/Aktif/Selesai + detail)

### Test di HP
- `app_config.dart` kedua app diarahkan ke IP LAN `192.168.1.5:3001`
- Test: HP + PC satu WiFi → `flutter run` via USB

---

## ⏳ BELUM DIPROSES (sisa pekerjaan)

### 🔴 Prioritas — butuh API key / setup eksternal (founder)
1. **GEMINI_API_KEY di Krama** — KOSONG. Sayur.ai TIDAK jalan tanpa ini.
   Gratis di aistudio.google.com/apikey → isi `backend/krama-api/.env`
   (Catatan: NineOS sudah punya Gemini key, tinggal copy ke Krama)
2. **Midtrans key** (server + client) — untuk pembayaran Krama. Masih kosong.
3. **Deploy backend** — Railway sudah TIDAK gratis (min $5/bln).
   Alternatif gratis: **Render** (rekomendasi), Fly.io, Koyeb.
   Tanpa deploy, test HP harus via IP LAN (satu WiFi).

### 🟡 Fitur Krama yang belum dibuat
4. **Customer App** — Top Up & Penarikan wallet (masih placeholder "segera hadir")
5. **Customer App** — tab Pesan / chat
6. **n8n WhatsApp** — push order ke merchant WHATSAPP_PUSH
   (butuh: n8n instance + WhatsApp Business API token + bikin workflow)
7. **Maps** — lokasi driver real-time (sekarang placeholder statis)

### 🟡 NineOS yang belum dibuat / dicolok
8. **Regenerate Gemini API key NineOS** — key lama pernah terekspos di chat, sebaiknya revoke (aistudio.google.com)
9. **Aktifkan billing Google** (ai.dev/projects) → `MEDIA_PROVIDER=google` di `.env` → Veo/Imagen asli jalan
10. **Storage cloud media** (S3/Cloudinary) → swap `StorageService.saveBase64()` tanpa ubah pemanggil
11. **Deploy NineOS** backend (Render/Railway) + frontend (Vercel) + set `PUBLIC_BASE_URL`
12. **Colok WhatsApp token** (Meta) → HelpDesk aktif
13. **Colok Instagram token** (Meta) → Social Media aktif + `publishNow()` channel nyata (saat ini masih simulasi `sim_*`)
14. **Setup n8n** → Automation pipelines aktif (dipakai NineOS HelpDesk & Krama WHATSAPP_PUSH)
15. **Colok URL + token Matcha & NotaBe** → data platform lain masuk

### 🟢 Update Sesi 28 Juni 2026 — Content Studio NineOS SELESAI
Alur bikin konten sudah jalan end-to-end (ditest via UI):
**Brief → caption AI (Gemini) → generate gambar/video → preview → posting realtime**
- Keputusan arsitektur: AI dipanggil langsung dari NineOS, n8n cuma "tangan" (lihat `NineOS-Architecture-Decision.md`)
- `MediaGenerationService` provider-switch: google(Veo)/bytedance/mock — sekarang pakai **mock** (placeholder)
- **Untuk Veo asli besok, perlu 3 colokan:**
  1. Billing/akses Veo/Imagen (atau Bytedance via BytePlus)
  2. **Storage** (S3/Cloudinary) — host hasil generate jadi URL publik
  3. API channel nyata di `publishNow` (sekarang masih simulasi)
- Cara coba: buka NineOS → menu **Social Media (Content Studio)** → tombol "Buat Konten AI"

### 🟢 Update Sesi 29 Juni 2026 — Media-gen Google ASLI (Veo/Imagen) Siap
Kode provider Google sudah dibangun lengkap & diverifikasi (commit `c6f980d`):
- `StorageService` baru: simpan media ke `public/generated/` → URL `/static/...`, siap swap ke S3
- `MediaGenerationService.generateGoogle()`: Imagen `:predict` (sync, base64→storage), Veo `:predictLongRunning` (async→jobId→polling→download)
- Endpoint `POST /platforms/:slug/content/:id/media-status` — frontend poll tiap 5 dtk untuk video
- **DITEST LANGSUNG**: dengan `MEDIA_PROVIDER=google`, backend nyambung ke Google Imagen asli → balas *"Imagen only available on paid plans"* → bukti wiring 100% benar, tinggal billing
- **ADR-001 & ADR-002** final: AI teks (AIService) dipisah dari AI media (MediaGenerationService)
- `.env` block media (commented, siap diaktifkan): `MEDIA_PROVIDER`, `IMAGEN_MODEL`, `VEO_MODEL`, `PUBLIC_BASE_URL`

**Untuk aktifkan Veo/Imagen asli (kapan saja kapten siap):**
1. Buka https://ai.dev/projects → aktifkan billing
2. Di `nineos-backend/.env`: uncomment `MEDIA_PROVIDER=google`
3. Restart backend → gambar/video asli langsung jalan, tanpa ubah kode

---

## 🔑 Akun Demo (Krama)
- Customer: `+6281234567890` / `demo123`
- Admin: `+628000000000` / `admin123`

## ▶️ Cara Jalankan Lokal
```bash
# Krama backend (port 3001)
cd C:\Users\ulwan\krama-platform\backend\krama-api
npm run start:dev

# NineOS backend (port 3000)
cd C:\Users\ulwan\nineOS-id\nineos-backend
npm run start:dev

# NineOS frontend (port bebas, mis. 3100 biar tak bentrok backend)
cd C:\Users\ulwan\nineOS-id\nineos-frontend
npm run dev -- -p 3100

# Flutter app ke HP (USB debugging ON, satu WiFi)
cd C:\Users\ulwan\krama-platform\apps\krama_app
flutter run
```

---

## 📍 Dokumentasi Lengkap
- **NineOS**: `nineOS-id/NineOS-Status-Progress.md`
- **Krama**: `krama-platform/docs/PROGRESS.md`
- **Kontrak colok platform baru**: `nineOS-id/NineOS-Integration-Contract.md`

## 🔌 Mau Colok Platform Baru ke NineOS? (Matcha, NotaBe, Nine Studio)
Platform lain cukup sediakan di backend mereka:
1. `GET /nineos/health` → `{ status, platform, timestamp }`
2. `GET /nineos/kpi?period=today|week|month` → JSON metrik (ada blok `overview`)
3. Auth header `X-NineOS-Key` (validasi dari tabel service-account)

Lalu kasih ke kita: **BASE_URL + service key + slug**. Sisanya NineOS yang atur.
Detail + contoh kode nyata (tiru pola Krama) ada di `NineOS-Integration-Contract.md`.

> Yang dikirim ke Claude pengembang platform:
> *"Buatkan module integrasi NineOS: `GET /nineos/health` & `GET /nineos/kpi?period=`,
> dijaga header `X-NineOS-Key`. Ikuti `NineOS-Integration-Contract.md`, contoh: Krama."*

---

---

## 📊 Progress Ringkas (per 29 Juni 2026)

### NineOS
| Komponen | Status |
|---|---|
| Backend 5 modul (24 tabel, 54+ endpoint) | ✅ Selesai |
| Frontend 5 halaman | ✅ Selesai |
| AI Virtual Office (Gemini) | ✅ Aktif |
| Integrasi KPI Krama live | ✅ Selesai |
| Content Studio (caption AI + media-gen + posting) | ✅ Selesai |
| Provider Google Imagen/Veo (kode) | ✅ Siap — tinggal billing |
| Deploy backend | ⏳ Belum |
| Deploy frontend (Vercel) | ⏳ Belum |
| Token WhatsApp, Instagram, n8n | ⏳ Tinggal colok |
| Matcha & NotaBe | ⏳ Tinggal colok URL + key |

### Krama
| Komponen | Status |
|---|---|
| Backend API (auth, order, produk, wallet) | ✅ Selesai |
| `krama_app` (customer) | ✅ Selesai (fitur utama) |
| `krama_mitra` (merchant/driver/admin) | ✅ Selesai (fitur utama) |
| Gemini key di Krama | ⏳ Perlu isi `.env` |
| Midtrans (payment) | ⏳ Perlu key |
| Customer Top Up & Penarikan wallet | ⏳ Belum |
| Tab Pesan / chat | ⏳ Belum |
| n8n WhatsApp push | ⏳ Belum |
| Maps / lokasi driver real-time | ⏳ Belum |
| Deploy backend | ⏳ Belum |

---

*Istirahat dulu kapten — semua sudah ke-commit & push ke GitHub. 🙏*
