# NineOS — Dokumen Index Master (Handoff ke Claude Code)

> **Baca dokumen ini lebih dulu**, sebelum membuka dokumen modul mana pun. Dokumen ini adalah peta navigasi: urutan eksekusi lintas-modul, konvensi teknis bersama, dan inventaris seluruh tabel database. Detail teknis penuh (skema, kontrak API, payload, rencana tahap) tetap ada di masing-masing dokumen modul — dokumen ini tidak menggantikannya.
>
> **Aturan kerja tetap berlaku:** kerjakan bertahap, **berhenti di setiap checkpoint review** untuk konfirmasi founder.

---

## 1. Tentang Proyek

NineOS adalah central dashboard untuk 4 platform (**Matcha, NotaBe** — ready; **Krama, Nine Studio** — belum ready), dengan arsitektur 3-layer:

```
Frontend Dashboard → Backend / API Gateway → Automation Engine (n8n)
                                                       │
                                          AI · WhatsApp · Email · Instagram · TikTok
```

Pengembangan dibagi 2 Fase. Fase 1 (4 modul) memberi manfaat operasional harian. Fase 2 (Virtual Office) jadi "otak" yang membaca data dari Fase 1.

---

## 2. Peta Modul & Ketergantungan

Diagram visual sudah ditampilkan di chat.

| # | Modul | Fase | Bergantung pada | Dokumen |
|---|---|---|---|---|
| 1 | Konfigurasi & Koneksi Backend | 1 | — (fondasi) | `NineOS-Modul1-Konfigurasi-Backend.md` |
| 2 | HelpDesk | 1 | Modul 1 | `NineOS-Modul2-HelpDesk.md` |
| 3 | Social Media | 1 | Modul 1 | `NineOS-Modul3-SocialMedia.md` |
| 4 | Automation | 1 | Modul 1, 2, 3 | `NineOS-Modul4-Automation.md` |
| 5 | Virtual Office | 2 | Modul 1, 2, 3, 4 | `NineOS-Modul5-VirtualOffice.md` |

---

## 3. Master Timeline (Urutan Eksekusi Lintas-Modul)

Tiap modul punya rencana tahap sendiri (lihat dokumen masing-masing). Berikut cara merangkainya jadi satu alur kerja:

**Wave 1 — Fondasi**
Modul 1, Tahap 1-2 (migration + API skeleton, termasuk mock data Krama & Nine Studio)
✅ *Checkpoint sebelum lanjut Wave 2*

**Wave 2 — Integrasi Nyata & Pilot Matcha**
Modul 1 Tahap 3 (integrasi nyata Matcha & NotaBe) → lalu Modul 2 Tahap 1-4 (HelpDesk pilot Matcha+WhatsApp) **dan** Modul 3 Tahap 1-4 (Social Media pilot Instagram Matcha) — *keduanya bisa paralel, sama-sama cuma bergantung ke Modul 1*.
✅ *Checkpoint sebelum lanjut Wave 3*

**Wave 3 — Orkestrasi**
Modul 4 Tahap 1-4 (alert real-time dulu, baru report berkala)
✅ *Checkpoint sebelum lanjut Wave 4*

**Wave 4 — Scale-Out Fase 1**
Modul 2 Tahap 5-6 (eskalasi penuh + scale ke NotaBe & channel lain) · Modul 3 Tahap 5-6 (TikTok + scale ke NotaBe) · Modul 4 Tahap 5 (WhatsApp sebagai channel alternatif)
✅ *Checkpoint — Fase 1 selesai*

**Wave 5 — Fase 2: Virtual Office**
Modul 5 Tahap 1-4 (CTO → CMO → CEO, baru mode meeting) → Tahap 6 (CFO setelah keputusan sumber data; COO/Legal setelah scope didetailkan)

---

## 4. Konvensi Teknis Bersama

Berlaku di semua modul, supaya kode Claude Code konsisten lintas-modul:

- **Primary key:** UUID (`gen_random_uuid()`)
- **Timestamp:** `TIMESTAMPTZ`, kolom `created_at`/`updated_at` di hampir semua tabel
- **Base path API:** `/api/v1`
- **Auth:** header `Authorization: Bearer <gateway_token>`, kecuali endpoint `/webhooks/*` yang divalidasi via HMAC signature (`X-NineOS-Signature`)
- **Kredensial** (kolom `*_encrypted`): wajib dienkripsi at-rest, **tidak pernah** dikembalikan di response API mana pun
- **Naming:** snake_case untuk semua tabel & kolom
- **Pola status registry** (platform/role siap atau belum): `'active'` / `'not_ready'` — dipakai di Modul 1 (platforms) dan Modul 5 (executives)
- **Pola status koneksi:** `'pending'` / `'connected'` / `'error'`
- **Pola status job/publish:** `'pending'` / `'posted'` atau `'success'` / `'failed'`

---

## 5. Inventaris Tabel Database (24 tabel)

**Modul 1 — Konfigurasi & Koneksi Backend**
`platforms` · master 4 platform & metadata
`platform_connections` · kredensial & status koneksi
`platform_health_logs` · histori health-check
`platform_endpoints` · peta kapabilitas/endpoint tiap platform
`automation_sync_jobs` · log job automasi n8n lintas-modul

**Modul 2 — HelpDesk**
`helpdesk_channels` · channel komunikasi aktif per platform
`helpdesk_settings` · pengaturan auto-reply per platform
`helpdesk_knowledge_base` · FAQ per platform
`helpdesk_conversations` · percakapan pelanggan
`helpdesk_messages` · pesan dalam percakapan
`helpdesk_escalations` · log eskalasi ke agent manusia

**Modul 3 — Social Media**
`social_accounts` · akun sosmed tujuan posting
`content_items` · konten/caption
`content_schedules` · jadwal posting per channel
`content_publish_logs` · histori percobaan publish

**Modul 4 — Automation**
`automation_pipelines` · registry status tiap pipeline n8n
`report_schedules` · jadwal report berkala ke founder
`automation_alerts` · alert real-time dari modul lain
`report_logs` · log semua pesan terkirim ke founder

**Modul 5 — Virtual Office**
`executives` · registry 6 role C-Level
`executive_data_sources` · peta domain data per role
`executive_sessions` · sesi chat/meeting
`executive_messages` · pesan dalam sesi
`financial_snapshots` · data finansial manual (placeholder CFO)

*Sudah dicek: tidak ada nama tabel yang bentrok antar modul.*

---

## 6. Token Desain — Tema Merah-Hitam

(Detail lengkap di Modul 1, Bagian 7 — direkap di sini untuk akses cepat)

| Token | Hex | Pemakaian |
|---|---|---|
| `--bg-base` | `#0A0A0A` | Background utama dashboard |
| `--bg-surface` | `#1A1A1A` | Card, sidebar, panel |
| `--brand-red` | `#A32D2D` | Aksen utama, tombol primer |
| `--brand-red-strong` | `#791F1F` | Hover/active state |
| `--text-primary` | `#F5F5F5` | Teks utama |
| `--status-success` | `#22C55E` | Status: connected/success |
| `--status-warning` | `#EF9F27` | Status: pending |
| `--status-error` | `#E24B4A` | Status: error/failed |

---

## 7. Catatan Terbuka — Perlu Keputusan Founder Sebelum/Selama Eksekusi

| # | Modul | Catatan |
|---|---|---|
| 1 | Umum | Asumsi stack: PostgreSQL + REST/JSON. Ganti kalau tim pakai stack lain. |
| 2 | Modul 1 | `platform_endpoints` sengaja generik — bisa disederhanakan kalau 4 backend platform ternyata punya struktur API yang seragam. |
| 3 | Modul 2 | `confidence_threshold` (0.75) dan `escalation_keywords` default cuma contoh awal, sesuaikan dengan kasus nyata Matcha/NotaBe. |
| 4 | Modul 3 | Status `'partial'` di `content_items` (sukses sebagian channel) wajib di-handle, jangan dianggap binary success/fail. |
| 5 | Modul 4 | `automation_pipelines` adalah registry ringan, bukan sinkron langsung ke n8n REST API — peningkatan ini bisa jadi iterasi berikutnya. |
| 6 | Modul 5 | CFO belum punya sumber data nyata dari Fase 1 (`financial_snapshots` = placeholder manual). COO & Legal scope-nya belum didetailkan. Urutan CTO→CMO→CEO ditentukan dari kesiapan data, bukan hierarki organisasi — kasih tahu kalau founder mau urutan lain. |

---

## 8. Ringkasan Angka

5 modul · 24 tabel · ~54 endpoint API · 27 contoh payload JSON · 5 diagram alur n8n.

Semua dokumen modul siap dibaca Claude Code secara berurutan mengikuti Bagian 3. Selamat membangun NineOS. 🔴⚫
