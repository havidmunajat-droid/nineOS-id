# NineOS — Spesifikasi Modul 1: Konfigurasi & Koneksi Backend (4 Platform)

> **Untuk: Claude Code**
> Dokumen ini adalah kontrak teknis untuk Modul 1 dari sistem NineOS. Kerjakan **bertahap sesuai Bagian 8**, dan **berhenti di setiap checkpoint untuk direview founder** sebelum lanjut ke tahap berikutnya. Jangan mengeksekusi seluruh tahap sekaligus tanpa konfirmasi.

---

## 1. Ringkasan Modul

Modul 1 adalah **lapisan konfigurasi** di Backend/API Gateway NineOS. Tugasnya:

1. Menyimpan cara API Gateway terhubung ke 4 backend platform (Matcha, NotaBe, Krama, Nine Studio) — base URL, kredensial, tipe autentikasi.
2. Mencatat status kesehatan tiap koneksi (connected / error / pending).
3. Memetakan kapabilitas/endpoint yang dimiliki tiap platform (karena struktur API backend tiap platform berbeda-beda).
4. Menjadi sumber data yang nanti dipakai modul HelpDesk, Social Media, Analytics, dan workflow n8n.

### Status & prioritas platform

| Platform | Status saat ini | Prioritas implementasi |
|---|---|---|
| **Matcha** | Ready (belum live) | 🔴 Prioritas 1 — integrasi nyata |
| **NotaBe** | Ready (belum live) | 🔴 Prioritas 1 — integrasi nyata |
| **Krama** | Belum ready | ⚪ Skema disiapkan, integrasi menyusul |
| **Nine Studio** | Belum ready | ⚪ Skema disiapkan, integrasi menyusul |

**Pendekatan:** skema database & kontrak API dibuat generik untuk 4 platform sekaligus (forward-compatible). Begitu Krama dan Nine Studio live, tim tinggal mengisi baris `platform_connections` baru — **tidak perlu ubah skema**.

---

## 2. Posisi Modul dalam Arsitektur 3-Layer

```
Frontend Dashboard (Sidebar: Matcha/NotaBe/Krama/Nine Studio, HelpDesk,
Social Media, Automation, Analytics, Calendar, Virtual Office)
            │
            ▼
Backend / API Gateway   ← Modul 1 hidup di sini
            │
            ▼
Automation Engine (n8n) ← konsumen dari API Gateway
            │
   AI · WhatsApp · Email · Instagram · TikTok
```

---

## 3. Skema Database

Asumsi: PostgreSQL. Sesuaikan tipe data jika Claude Code memakai engine lain.

```sql
-- ============================================
-- NineOS — Modul 1: Platform Configuration & Connection
-- ============================================

-- Master 4 platform
CREATE TABLE platforms (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                   VARCHAR(50) UNIQUE NOT NULL,   -- 'matcha' | 'notabe' | 'krama' | 'nine-studio'
    name                   VARCHAR(100) NOT NULL,
    description            TEXT,
    logo_url               TEXT,
    theme_primary_color    VARCHAR(7) DEFAULT '#A32D2D',  -- merah (lihat Bagian 7)
    theme_secondary_color  VARCHAR(7) DEFAULT '#121212',  -- hitam
    readiness_status       VARCHAR(20) NOT NULL DEFAULT 'not_ready', -- 'not_ready' | 'ready' | 'live'
    is_priority            BOOLEAN DEFAULT false,          -- TRUE untuk Matcha & NotaBe
    sort_order             INT DEFAULT 0,
    created_at             TIMESTAMPTZ DEFAULT now(),
    updated_at             TIMESTAMPTZ DEFAULT now()
);

-- Koneksi backend tiap platform (mendukung multi-environment)
CREATE TABLE platform_connections (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id                     UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    environment                     VARCHAR(20) NOT NULL DEFAULT 'staging', -- 'staging' | 'production'
    base_url                        TEXT NOT NULL,
    auth_type                       VARCHAR(20) NOT NULL DEFAULT 'api_key', -- 'api_key' | 'oauth2' | 'basic'
    api_key_encrypted               TEXT,
    oauth_client_id                 TEXT,
    oauth_client_secret_encrypted   TEXT,
    oauth_access_token_encrypted    TEXT,
    oauth_refresh_token_encrypted   TEXT,
    webhook_secret_encrypted        TEXT,
    connection_status               VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'connected' | 'error' | 'disabled'
    last_checked_at                 TIMESTAMPTZ,
    last_error                      TEXT,
    created_at                      TIMESTAMPTZ DEFAULT now(),
    updated_at                      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (platform_id, environment)
);

-- Histori health-check (dipakai juga oleh modul Analytics & CTO/Virtual Office nanti)
CREATE TABLE platform_health_logs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id        UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    checked_at         TIMESTAMPTZ DEFAULT now(),
    status             VARCHAR(20) NOT NULL, -- 'ok' | 'error' | 'timeout'
    response_time_ms   INT,
    error_detail       TEXT
);

-- Peta endpoint/kapabilitas tiap platform (struktur API tiap backend berbeda)
CREATE TABLE platform_endpoints (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id   UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    capability    VARCHAR(50) NOT NULL, -- 'helpdesk' | 'social_post' | 'analytics' | 'calendar' | 'content'
    method        VARCHAR(10) NOT NULL DEFAULT 'GET',
    path          TEXT NOT NULL,        -- relatif terhadap base_url
    description   TEXT,
    is_active     BOOLEAN DEFAULT true,
    UNIQUE (platform_id, capability)
);

-- Log job automasi dari n8n (audit trail + bahan Analytics)
CREATE TABLE automation_sync_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id   UUID REFERENCES platforms(id) ON DELETE SET NULL,
    job_type      VARCHAR(50) NOT NULL, -- 'content_publish' | 'helpdesk_sync' | 'report_daily'
    triggered_by  VARCHAR(20) NOT NULL DEFAULT 'n8n', -- 'n8n' | 'manual' | 'schedule'
    status        VARCHAR(20) NOT NULL DEFAULT 'running', -- 'running' | 'success' | 'failed'
    payload       JSONB,
    result        JSONB,
    started_at    TIMESTAMPTZ DEFAULT now(),
    finished_at   TIMESTAMPTZ
);

-- Seed 4 platform (Krama & Nine Studio sengaja 'not_ready')
INSERT INTO platforms (slug, name, readiness_status, is_priority, sort_order) VALUES
('matcha',      'Matcha',      'ready',     true,  1),
('notabe',      'NotaBe',      'ready',     true,  2),
('krama',       'Krama',       'not_ready', false, 3),
('nine-studio', 'Nine Studio', 'not_ready', false, 4);
```

**Relasi (ERD ringkas):**
`platforms` 1—N `platform_connections`, 1—N `platform_health_logs`, 1—N `platform_endpoints`, 1—N `automation_sync_jobs`.

**Catatan keamanan:** semua kolom `*_encrypted` wajib dienkripsi at-rest (mis. `pgcrypto` atau KMS terpisah) — jangan pernah simpan kredensial plaintext, dan jangan pernah kembalikan nilai asli kredensial di response API manapun (lihat Bagian 5).

---

## 4. Kontrak API Gateway

Base path: `/api/v1` (sesuaikan domain).

| Method | Path | Fungsi |
|---|---|---|
| GET | `/platforms` | List 4 platform + status & koneksi ringkas |
| GET | `/platforms/{slug}` | Detail satu platform |
| PUT | `/platforms/{slug}/connection` | Buat/update kredensial koneksi |
| POST | `/platforms/{slug}/connection/test` | Test konektivitas → update `connection_status` |
| GET | `/platforms/{slug}/health` | Health log terbaru |
| GET | `/platforms/{slug}/endpoints` | List kapabilitas/endpoint terdaftar |
| POST | `/webhooks/{slug}/{capability}` | Penerima webhook masuk dari backend platform (dipakai n8n) |
| POST | `/automation/jobs` | n8n mencatat mulainya sebuah job |
| PATCH | `/automation/jobs/{id}` | n8n update hasil job (success/failed) |

Semua endpoint butuh header `Authorization: Bearer <gateway_token>` kecuali `/webhooks/*` yang divalidasi via `webhook_secret` (HMAC signature di header `X-NineOS-Signature`).

---

## 5. Contoh Payload JSON

**5.1 — `GET /platforms` response**
```json
{
  "data": [
    {
      "id": "b3f1a2c4-...",
      "slug": "matcha",
      "name": "Matcha",
      "readiness_status": "ready",
      "is_priority": true,
      "theme": { "primary": "#A32D2D", "secondary": "#121212" },
      "connection": {
        "environment": "staging",
        "status": "connected",
        "last_checked_at": "2026-06-19T10:00:00Z"
      }
    },
    {
      "id": "7e2c9d10-...",
      "slug": "krama",
      "name": "Krama",
      "readiness_status": "not_ready",
      "is_priority": false,
      "theme": { "primary": "#A32D2D", "secondary": "#121212" },
      "connection": null
    }
  ]
}
```

**5.2 — `PUT /platforms/matcha/connection` request**
```json
{
  "environment": "staging",
  "base_url": "https://api.matcha.internal",
  "auth_type": "api_key",
  "credentials": {
    "api_key": "sk-matcha-xxxxxxxxxxxx"
  }
}
```
Response **tidak pernah** mengembalikan `credentials` asli — hanya status:
```json
{
  "platform": "matcha",
  "environment": "staging",
  "connection_status": "pending",
  "updated_at": "2026-06-20T09:00:00Z"
}
```

**5.3 — `POST /platforms/matcha/connection/test` response**
```json
{
  "platform": "matcha",
  "status": "ok",
  "response_time_ms": 184,
  "checked_at": "2026-06-20T09:12:03Z"
}
```

**5.4 — Webhook masuk dari backend platform (trigger n8n auto-posting)**
```json
{
  "event": "content.ready_to_publish",
  "platform": "matcha",
  "content_id": "ct_8821",
  "caption_draft": "Promo akhir pekan...",
  "media_url": "https://cdn.matcha.app/posts/8821.jpg",
  "target_channels": ["instagram", "tiktok"],
  "scheduled_at": "2026-06-21T08:00:00+07:00"
}
```

**5.5 — n8n mencatat job ke `POST /automation/jobs`**
```json
{
  "job_type": "content_publish",
  "platform": "matcha",
  "triggered_by": "n8n",
  "payload": {
    "content_id": "ct_8821",
    "channels": ["instagram", "tiktok"]
  }
}
```

**5.6 — n8n update hasil ke `PATCH /automation/jobs/{id}`**
```json
{
  "status": "success",
  "result": {
    "instagram": { "post_id": "ig_99281", "status": "published" },
    "tiktok": { "post_id": "tt_44210", "status": "published" }
  },
  "finished_at": "2026-06-21T08:00:42+07:00"
}
```

---

## 6. Alur Automasi n8n

Diagram visual sudah ditampilkan di chat. Lima tahap node:

1. **Trigger** — schedule harian (cron) atau webhook `content.ready_to_publish` dari API Gateway.
2. **Platform router** — node `Switch` berdasarkan `platform` (matcha/notabe/krama/nine-studio); tiap cabang memakai `base_url` & kredensial dari `platform_connections`.
3. **Ambil dan proses AI** — `HTTP Request` ke backend platform untuk ambil data konten, lalu node AI menyusun/menyesuaikan caption.
4. **Distribusi channel** — cabang paralel ke WhatsApp, Email, Instagram, TikTok sesuai `target_channels` pada payload webhook.
5. **Log dan laporan** — `PATCH /automation/jobs/{id}` untuk update status, lalu kirim ringkasan ke Telegram/WA founder.

---

## 7. Token Desain — Tema Merah-Hitam

Untuk dipakai langsung di Frontend Dashboard (di luar widget chat ini, yang ikut tema host Claude):

| Token | Hex | Pemakaian |
|---|---|---|
| `--bg-base` | `#0A0A0A` | Background utama dashboard |
| `--bg-surface` | `#1A1A1A` | Card, sidebar, panel |
| `--border` | `#2A2A2A` | Garis pembatas |
| `--brand-red` | `#A32D2D` | Aksen utama, tombol primer, highlight aktif sidebar |
| `--brand-red-strong` | `#791F1F` | Hover/active state |
| `--text-primary` | `#F5F5F5` | Teks utama di atas background gelap |
| `--text-muted` | `#A3A3A3` | Teks sekunder |
| `--status-success` | `#22C55E` | Connection status: connected |
| `--status-warning` | `#EF9F27` | Connection status: pending |
| `--status-error` | `#E24B4A` | Connection status: error |

> Saran: simpan token ini di `tailwind.config` atau CSS variables global frontend, dipakai konsisten dari Modul 1 (badge status koneksi) sampai Virtual Office di Fase 2.

---

## 8. Rencana Eksekusi Bertahap untuk Claude Code

**Wajib berhenti di setiap "✅ Checkpoint review" untuk konfirmasi founder sebelum lanjut.**

| Tahap | Pekerjaan | Output |
|---|---|---|
| 1 | Migration script database (Bagian 3) + seed 4 platform | File migration, bisa di-run `up`/`down` |
| ✅ | **Checkpoint review 1** | — |
| 2 | API Gateway skeleton: endpoint `GET/PUT /platforms*` dengan mock data untuk Krama & Nine Studio | Service berjalan lokal, response sesuai Bagian 5 |
| ✅ | **Checkpoint review 2** | — |
| 3 | Integrasi nyata Matcha & NotaBe: kredensial asli, `connection/test` benar-benar memanggil backend | Status `connected` terverifikasi untuk 2 platform prioritas |
| ✅ | **Checkpoint review 3** | — |
| 4 | Setup workflow dasar n8n: trigger → router → 1 channel dulu (sarankan WhatsApp dulu karena paling sering dipakai founder untuk report) | Workflow n8n importable (.json) |
| ✅ | **Checkpoint review 4** | — |
| 5 | Tambah channel Email, Instagram, TikTok + laporan ke Telegram/WA founder | Workflow lengkap sesuai Bagian 6 |
| ✅ | **Checkpoint review 5** | — |

---

*Dokumen ini cakupannya hanya Modul 1 (Konfigurasi & Koneksi Backend). Modul HelpDesk, Social Media, Automation, dan Analytics akan dibuatkan dokumen kontrak terpisah setelah Modul 1 direview.*
