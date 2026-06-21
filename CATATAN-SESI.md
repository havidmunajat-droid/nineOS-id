# 📒 Catatan Sesi — NineOS & Krama

> Dibuat: 21 Juni 2026 · Untuk: Kapten Havid
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
8. **Regenerate Gemini API key NineOS** — key lama pernah terekspos di chat, sebaiknya revoke
9. **Deploy NineOS** backend (Render/Railway) + frontend (Vercel)
10. **Colok WhatsApp token** (Meta) → HelpDesk aktif
11. **Colok Instagram token** (Meta) → Social Media aktif
12. **Setup n8n** → Automation pipelines aktif (dipakai NineOS HelpDesk & Krama WHATSAPP_PUSH)
13. **Colok URL + token Matcha & NotaBe** → data platform lain masuk

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

# Flutter app ke HP (USB debugging ON, satu WiFi)
cd C:\Users\ulwan\krama-platform\apps\krama_app
flutter run
```

---

## 📍 Dokumentasi Lengkap
- **NineOS**: `nineOS-id/NineOS-Status-Progress.md`
- **Krama**: `krama-platform/docs/PROGRESS.md`

---

*Istirahat dulu kapten — semua sudah ke-commit & push ke GitHub. 🙏*
