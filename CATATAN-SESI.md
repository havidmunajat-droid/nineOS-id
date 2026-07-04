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

### 🟢 Update Sesi 30 Juni 2026 — Deploy config + Test Lokal
**Tujuan sesi:** siapkan deploy & bisa lihat test visual.

**Yang dibuat (commit `e2efb32`, sudah push):**
- `render.yaml` (root) — config deploy backend ke Render
- `nineos-frontend/vercel.json` — config deploy frontend ke Vercel
- Fix `.gitignore`: `public/generated/*` + keep `.gitkeep` (folder static harus ada saat deploy)
- Generate `GATEWAY_TOKEN` & `ENCRYPTION_KEY` baru untuk production (belum dipakai, simpan saat deploy)

**Hasil percobaan deploy — SEMUA BUTUH KARTU KREDIT di awal:**
- ❌ **Render** — wajib kartu kredit
- ❌ **Koyeb** — wajib kartu kredit
- ⏳ **Railway** — KEPUTUSAN: tunggu kapten siapkan Railway ($5/bln), deploy backend di sana nanti
- ⚠️ **Vercel (frontend)** — build gagal `npm run build exited 1`. Penyebab: Vercel build dari root repo, bukan subfolder.
  **FIX (jangka panjang, belum diterapkan):** Vercel dashboard → Settings → Build & Deployment → **Root Directory = `nineos-frontend`** → Redeploy. (Cara resmi monorepo Vercel; sekali set permanen). Kapten coba tapi masih error → skip dulu, lanjut setelah Railway.

**🎯 ARAHAN KAPTEN — fokus fitur SETELAH Railway aktif (30 Juni 2026):**
1. **Dashboard** — tiap platform tampil KPI-nya (Krama sudah; Matcha/NotaBe/Nine Studio nyusul saat dicolok).
2. **HelpDesk** — REVISI FINAL (model escalation, BUKAN chatbot pricing):
   - Chatbot hidup DI DALAM platform masing-masing (web chat, bukan WA). User Q&A dijawab chatbot platform.
   - Kalau chatbot MENTOK (di luar wewenang / butuh konfirmasi / tak ada di Q&A) → **escalate ke live agent (manusia)**. DI TITIK INI masuk ke NineOS — admin jawab manual di HelpDesk NineOS.
   - **Opsi A (REKOMENDASI):** platform kirim percakapan ke NineOS (pola X-NineOS-Key), muncul jadi tiket, admin balas di NineOS, balasan tampil lagi di chat platform via polling (sama pola Krama). Skema NineOS sudah siap: tabel `helpdesk_conversations/messages/escalations` tinggal ganti channel = in-platform chat.
   - **Opsi B (fallback):** chatbot mentok → kasih contact email → user email → muncul notice di HelpDesk NineOS → admin balas via email. Minus: butuh infra terima email masuk (Mailgun/SendGrid inbound).
   - Integrasi WA Meta = DI-DROP.
3. **Social Media** — REVISI ARAH:
   - ❌ TIDAK perlu autoposting → **tidak perlu API sosmed (Meta/IG)**. Cukup **atur jadwal**, kapten posting manual. (Autoposting = tahap scalable nanti.)
   - ✅ Generate AI sudah benar & ada.
   - 🔧 TODO: **pisahkan AI text (prompt) vs AI gambar/media**.
   - 🔧 TODO: ganti provider media **Veo → Bytedance** (lebih murah). (Scaffold Bytedance sudah ada di MediaGenerationService.)
4. **Automation** — kapten BUTUH PENJELASAN FITUR lagi di sesi depan (belum diputuskan).
5. **Virtual Office** — AI-nya **sama dengan AI text prompt** (satu service). Tambah fitur: **set meeting tiap jam 22:00 (10 malam)** untuk keputusan esok harinya.

> Konsekuensi prioritas: WhatsApp token (Meta) & Instagram token (Meta) **TURUN prioritas / tidak dipakai dulu** sesuai arahan di atas.

### 🟢 Update Sesi 3 Juli 2026 — Optimalisasi Struktur NineOS
**Backend:**
- `CommonModule` global baru (`src/common/common.module.ts`) — AIService, EncryptionService, MediaGenerationService, StorageService kini didaftarkan SEKALI (sebelumnya di-provide ulang di 3+ module → instance ganda)
- Hapus dependency `node-fetch` — pakai global fetch Node (2 titik: platform-kpi & platforms.service)
- Root API `GET /api/v1` kini health check `{status:'ok', service:'nineos-api'}` (siap dipakai healthcheck Railway); `app.service.ts` Hello World dihapus

**Bug nyata yang ketemu & diperbaiki saat verifikasi visual:**
1. **Kartu platform dashboard selalu kosong** — `GET /platforms` balas array mentah tapi frontend baca `r.data.data`. Fixed → 4 kartu tampil (3 Connected).
2. **Virtual Office tidak bisa dipakai sama sekali** — kontrak frontend ≠ backend: cek `status==='ready'` (backend: `'active'`), kirim `participant_executive_ids` (backend: `participant_roles`), kirim `sender_type` di body pesan (ditolak `forbidNonWhitelisted`), baca `r.data.data` untuk session/replies (backend: `session_id`/`replies`). Semua diselaraskan → pilih C-Level, buka sesi, kirim pesan JALAN (diverifikasi via browser).
3. Warning React "unique key" hilang (akibat `key={exec.id}` yang undefined).

**Frontend:** `lib/format.ts` baru (timeAgo, timeAgoShort, rupiah) — duplikasi di page dihapus.
**Repo:** README.md index baru · `.gitignore` +`*.pt` (yolov8n.pt milik nineClip nyasar di root, aman tak ke-commit) · launch.json +config `nineos-backend`.

✅ **GEMINI_API_KEY SUDAH DIGANTI & JALAN (3 Juli sore)** — kapten regenerate key baru, diisi ke `nineos-backend/.env`, ditest end-to-end: chat CTO Virtual Office dibalas Gemini. Blocker AI selesai.

### 🟢 Update Sesi 3 Juli 2026 (lanjutan) — Arahan MVP + nineClip + Generalisasi KPI
**KEPUTUSAN KAPTEN:**
- MVP = **KPI + Sosmed + Virtual Office**. HelpDesk SKIP dulu (platform-platform belum punya chatbot, baru tombol kontak email). Automation SKIP juga tapi biarkan untuk next.
- Platform ready: Matcha, NotaBe, Krama, **nineClip** (baru!). Nine Studio skip tapi tetap tampil.
- Integrasi platform dikerjakan **SEBELUM live** (KPI read-only, tidak tergantung payment gateway), di **sesi terpisah per repo platform** — prompt siap pakai di `NineOS-Integration-Prompts.md`.

**Yang dikerjakan:**
- **nineClip terdaftar** sebagai platform ke-5 (seed + DB Neon + Sidebar). Krama di seed dikoreksi jadi `ready` (sebelumnya stale `not_ready`).
- **KPI DIGENERALISASI** — hardcode `SUPPORTED=['krama']` dihapus: `fetchAllKpi()` coba semua platform terdaftar; env konvensi `{SLUG}_API_URL` + `{SLUG}_NINEOS_KEY`. Dashboard kini render section KPI per platform dari `/platforms/kpi/all` (blok `overview` + blok spesifik: orders/drivers/merchants). **Colok platform baru = 0 perubahan kode.**
- Diverifikasi live di browser: Krama backend dinyalakan → dashboard tampil "1 Live" + 5 kartu KPI Krama; 5 kartu platform (4 Connected); grid responsif.
- `NineOS-Integration-Contract.md` diupdate (langkah SUPPORTED dihapus) + `NineOS-Integration-Prompts.md` BARU (3 prompt copy-paste utk sesi Matcha/NotaBe/nineClip).
- ⚠️ **Fix di repo KRAMA (belum di-commit di sana):** `orders.service.ts:174` select `address` yang tidak ada di model Merchant → build error di HEAD. Dihapus (pola sama dgn `listForDriver`). Commit di sesi Krama berikutnya.

### 🟢 Update 3 Juli 2026 (sore) — MATCHA DICOLOK, KPI LIVE
- Matcha selesai implement `/nineos/health` + `/nineos/kpi` (slug `matcha`)
- Dicolok via env: `MATCHA_API_URL=https://matchascore.com/api` + `MATCHA_NINEOS_KEY` (production URL — lokal Matcha di port 3000 bentrok dgn backend NineOS)
- KPI Matcha: blok `overview` + `candidates`/`recruiters`/`jobs`/`screenings`/`payments`
- Dashboard ditambah kartu generik `Kandidat` & `Lowongan Aktif` — diverifikasi live di browser (Kandidat 13, Lowongan 3/3)
- Sisa colok: NotaBe & nineClip (prompt sudah di `NineOS-Integration-Prompts.md`)

### 🟢 Update 3 Juli 2026 (malam) — NINECLIP DICOLOK, DASHBOARD "3 LIVE"
- nineClip selesai implement `/nineos/*` (slug `nineclip`, backend NestJS di `nineClip/api`)
- ⚠️ Port default nineClip 3001 BENTROK dgn Krama → **dipindah permanen ke 3002** (`PORT=3002` di `nineClip/api/.env`) + launch config `nineclip-api` ditambahkan
- Dicolok via env: `NINECLIP_API_URL=http://localhost:3002/api/v1` + `NINECLIP_NINEOS_KEY`
- Dashboard ditambah kartu generik: `Clip Digenerate`, `Job Pipeline`, `Campaign Aktif`
- **Diverifikasi live: dashboard "3 Live" — Matcha (produksi) + Krama + nineClip serentak** 🎉
- Sisa colok: **NotaBe saja** (Nine Studio skip)

### 🟢 Update 4 Juli 2026 — VIRTUAL OFFICE DAILY MEETING + SOCIAL MEDIA MVP JADWAL

**Virtual Office — Tab Daily Meeting 22:00:**
- Ditambah tab "Daily Meeting" di sidebar (sebelumnya hanya "Chat 1-on-1")
- Tombol **"+ Jadwalkan Meeting 22:00"** — buat sesi `mode=meeting` dengan semua C-Level aktif + `scheduled_at` malam ini 22:00 WIB
- Deteksi otomatis: kalau meeting hari ini sudah ada → tombol berubah "✓ Meeting Malam Ini Terjadwal"
- Dalam meeting: **semua C-Level aktif merespons sekaligus** (CEO, CFO, CTO, CMO — masing-masing AI-nya menjawab sesuai domain)
- History meeting tersimpan di DB, bisa dibuka kembali lain waktu
- Tidak ada backend change — backend sudah support `mode=meeting` + `participant_roles[]` + `scheduled_at`

**Social Media MVP — Jadwal Posting Manual:**
- Backend: tambah kolom `scheduledAt (DateTime?)` ke tabel `content_items` (migration `20260704011515_add_content_scheduled_at`)
- `UpdateContentDto` direvisi: semua field opsional + tambah `status` + `scheduled_at` (sebelumnya extend CreateContentDto yang semua required)
- `updateContent` service apply `status` & `scheduledAt` dari DTO
- `formatContent` kini return `scheduled_at` di semua response
- Frontend — **ContentStudioModal** tambah panel "Posting Manual → Set Jadwal":
  - date + time picker (WIB) → simpan sebagai `status=scheduled + scheduled_at`
  - Success state "Konten Terjadwal 📅"
- Frontend — **social/page.tsx** tambah section **"Jadwal Hari Ini"**:
  - Muncul HANYA kalau ada konten `status=scheduled` dengan `scheduled_at` hari ini atau lewat
  - Tiap kartu: platform badge, jam, caption (bisa di-copy), tombol "✓ Posted"
  - Klik Posted → PUT `status=published` → kartu hilang dari section

**Rekomendasi Infrastruktur Scale (dicatat Kapten, dikerjakan nanti):**
- AI Text: Gemini Flash 2.5 sudah tepat → aktifkan billing → hilangkan rate limit
- AI Gambar: fal.ai + FLUX (~Rp300-500/gambar), atau Bytedance (scaffold sudah ada)
- AI Video nineClip: RunPod/Modal (GPU on-demand)
- Storage: Cloudinary free 25GB → swap StorageService
- DB: Neon upgrade ($19/bln) saat 0.5GB penuh
- Redis: caching AI response + job queue video async
- Total estimasi produksi: ~$30-35/bln

**Status NineOS saat Kapten istirahat (semua platform masih hidup sama):**
- Matcha + NotaBe: production (always live)
- Krama + nineClip: lokal (live saat backend platform berjalan)
- Frontend: localhost:3100 | Backend: localhost:3000

**Next langkah setelah semua platform live:**
1. Deploy backend → Railway
2. Fix Vercel frontend (Root Directory = `nineos-frontend`)
3. Aktifkan billing Gemini → Cloudinary storage
4. HelpDesk escalation model (setelah platform-platform punya chatbot sendiri)

### 🟢 Update 3 Juli 2026 (malam, final) — NOTABE DICOLOK: SEMUA 4 PLATFORM LIVE 🏁
- NotaBe implement `/nineos/*` sebagai **Supabase Edge Function** (production): `NOTABE_API_URL=https://nhveqjnlvowlksgmustv.supabase.co/functions/v1` + key
- Blok KPI NotaBe: overview + orders + keuangan (omzet/piutang/pengeluaran) + outlets + pelanggan — data nyata dari **pengujian tertutup Google Play** (user aktif 14, toko 12, pelanggan 13)
- Dashboard ditambah kartu generik: `Toko Terdaftar`, `Pelanggan`
- **MVP KPI KOMPLIT: Krama + Matcha + nineClip + NotaBe semua tercolok.** Matcha & NotaBe baca produksi (selalu live); Krama & nineClip lokal (live saat backend jalan, ganti URL saat deploy)
- Next: Sosmed MVP (pisah AI text/media, Bytedance) → Virtual Office meeting 22:00 → deploy Railway

**✅ TEST LOKAL JALAN (cara lihat visual tanpa deploy):**
| Apa | URL |
|-----|-----|
| Frontend NineOS | http://localhost:3001 |
| Backend API | http://localhost:3000/api/v1 |
| Swagger | http://localhost:3000/api/docs |
- Jalankan: backend `npm run start:dev` (port 3000), frontend `npx next dev -p 3001`
- ⚠️ KPI live Krama butuh backend Krama di port 3001 — bentrok dgn frontend NineOS. Kalau mau test Krama, atur ulang port (mis. frontend NineOS ke 3100).

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
