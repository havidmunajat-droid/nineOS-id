# NineOS — Spesifikasi Modul 3: Social Media (Auto Posting & Scheduler)

> **Untuk: Claude Code**
> Kerjakan **bertahap sesuai Bagian 6**, berhenti di setiap checkpoint untuk direview founder. Modul ini **bergantung pada Modul 1** — tabel `platforms` harus sudah ada.

---

## 1. Ringkasan Modul

Social Media menangani 3 hal:

1. **Koneksi akun sosmed** per platform — tujuan posting (Instagram, TikTok) untuk Matcha/NotaBe/Krama/Nine Studio.
2. **Konten** — pembuatan content/caption, termasuk generate via AI dari prompt singkat (fitur "Konten" di Settings pada file project).
3. **Scheduler & auto posting** — menjadwalkan content ke 1 atau lebih channel, lalu n8n yang mengeksekusi publish-nya secara otomatis pada waktunya.

**Pilot implementasi:** Instagram Matcha dulu (lihat Bagian 6), baru TikTok dan platform lain menyusul.

---

## 2. Skema Database

```sql
-- ============================================
-- NineOS — Modul 3: Social Media (Auto Posting & Scheduler)
-- Depends on: platforms(id) dari Modul 1
-- ============================================

-- Akun sosmed yang jadi tujuan posting per platform
CREATE TABLE social_accounts (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id              UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    channel_type             VARCHAR(20) NOT NULL, -- 'instagram' | 'tiktok'
    account_handle           VARCHAR(150) NOT NULL,
    account_id_external      VARCHAR(150), -- ID akun di sisi Instagram/TikTok
    access_token_encrypted   TEXT,
    refresh_token_encrypted  TEXT,
    token_expires_at         TIMESTAMPTZ,
    is_active                BOOLEAN DEFAULT true,
    connected_at             TIMESTAMPTZ,
    created_at                TIMESTAMPTZ DEFAULT now(),
    updated_at                TIMESTAMPTZ DEFAULT now(),
    UNIQUE (platform_id, channel_type)
);

-- Konten/caption — bisa dibuat manual atau lewat AI generator
CREATE TABLE content_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id     UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    title           VARCHAR(200),
    caption         TEXT NOT NULL,
    media_type      VARCHAR(20) NOT NULL DEFAULT 'image', -- 'image' | 'video' | 'carousel'
    media_urls      TEXT[],
    ai_prompt_used  TEXT, -- prompt asli kalau caption digenerate AI
    status          VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft' | 'scheduled' | 'published' | 'partial' | 'failed'
    created_by      VARCHAR(150),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Jadwal posting per content, per channel tujuan
CREATE TABLE content_schedules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id        UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    scheduled_at      TIMESTAMPTZ NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'posted' | 'failed'
    posted_at         TIMESTAMPTZ,
    external_post_id  VARCHAR(150),
    error_message     TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Histori tiap percobaan publish (untuk retry & audit)
CREATE TABLE content_publish_logs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id      UUID NOT NULL REFERENCES content_schedules(id) ON DELETE CASCADE,
    attempt_number   INT NOT NULL DEFAULT 1,
    status           VARCHAR(20) NOT NULL, -- 'success' | 'failed'
    response_payload JSONB,
    attempted_at     TIMESTAMPTZ DEFAULT now()
);
```

**Relasi:** `platforms` 1—N `social_accounts`, 1—N `content_items` 1—N `content_schedules` 1—N `content_publish_logs`. Satu `content_item` bisa dijadwalkan ke beberapa channel sekaligus (Instagram + TikTok) lewat baris `content_schedules` terpisah — status `content_items.status` jadi `partial` kalau salah satu channel gagal sementara channel lain sukses.

---

## 3. Kontrak API Gateway

Base path: `/api/v1`.

| Method | Path | Fungsi |
|---|---|---|
| GET | `/platforms/{slug}/social/accounts` | List akun sosmed terhubung |
| PUT | `/platforms/{slug}/social/accounts/{channel}` | Connect/update akun (OAuth token) |
| DELETE | `/platforms/{slug}/social/accounts/{channel}` | Putuskan akun |
| POST | `/platforms/{slug}/content/generate` | Generate draft caption via AI dari prompt singkat |
| GET | `/platforms/{slug}/content?status=` | List content |
| POST | `/platforms/{slug}/content` | Buat content manual |
| PUT | `/platforms/{slug}/content/{id}` | Update content |
| DELETE | `/platforms/{slug}/content/{id}` | Hapus content |
| POST | `/platforms/{slug}/content/{id}/schedule` | Jadwalkan ke 1+ channel |
| GET | `/social/schedules/due?before=` | Dipanggil n8n — ambil jadwal yang siap diposting |
| PATCH | `/social/schedules/{id}/result` | Dipanggil n8n — catat hasil publish |

Kredensial akun (`access_token_encrypted`, `refresh_token_encrypted`) **tidak pernah** dikembalikan di response — sama seperti aturan di Modul 1.

---

## 4. Contoh Payload JSON

**4.1 — `PUT /platforms/matcha/social/accounts/instagram` request**
```json
{
  "account_handle": "@matcha.id",
  "account_id_external": "17841400000000000",
  "oauth_token": "IGQVJ...",
  "token_expires_at": "2026-09-18T00:00:00Z"
}
```

**4.2 — `POST /platforms/matcha/content/generate` request**
```json
{
  "prompt": "Caption promo diskon 20% produk matcha latte, tone santai dan playful",
  "media_type": "image"
}
```
Response:
```json
{
  "content_id": "ct_9012",
  "caption": "Yuk seruput kebahagiaan dengan diskon 20% buat semua varian matcha latte minggu ini!",
  "status": "draft"
}
```

**4.3 — `POST /platforms/matcha/content/ct_9012/schedule` request**
```json
{
  "channels": ["instagram", "tiktok"],
  "scheduled_at": "2026-06-22T09:00:00+07:00",
  "media_urls": ["https://cdn.matcha.app/posts/9012.jpg"]
}
```
Response:
```json
{
  "content_id": "ct_9012",
  "schedules": [
    { "schedule_id": "sch_771", "channel": "instagram", "status": "pending" },
    { "schedule_id": "sch_772", "channel": "tiktok", "status": "pending" }
  ]
}
```

**4.4 — `GET /social/schedules/due?before=2026-06-22T09:05:00+07:00`** (dipanggil n8n cron trigger)
```json
{
  "data": [
    {
      "schedule_id": "sch_771",
      "content_id": "ct_9012",
      "platform": "matcha",
      "channel": "instagram",
      "caption": "Yuk seruput kebahagiaan...",
      "media_urls": ["https://cdn.matcha.app/posts/9012.jpg"]
    }
  ]
}
```

**4.5 — `PATCH /social/schedules/sch_771/result`** (n8n setelah publish)
```json
{
  "status": "posted",
  "external_post_id": "ig_5512893",
  "posted_at": "2026-06-22T09:00:14+07:00"
}
```
Kalau gagal:
```json
{
  "status": "failed",
  "error_message": "Token expired"
}
```

---

## 5. Alur n8n

Diagram visual sudah ditampilkan di chat. Lima tahap:

1. **Trigger** — node `Cron` n8n polling tiap interval (mis. tiap 5 menit) memanggil `GET /social/schedules/due`.
2. **Channel router** — node `Switch` memisahkan jadwal berdasarkan `channel` (instagram/tiktok), karena format API publish-nya beda.
3. **Siapkan payload** — susun body sesuai spesifikasi Instagram Graph API atau TikTok API dari data caption + media yang sudah diambil.
4. **Publish ke sosmed** — `HTTP Request` ke API resmi channel terkait.
5. **Update dan lapor** — `PATCH /social/schedules/{id}/result`; kalau `status: failed`, kirim notifikasi ke Telegram/WA founder (reuse mekanisme dari Modul 1).

---

## 6. Rencana Eksekusi Bertahap untuk Claude Code

**Wajib berhenti di setiap "✅ Checkpoint review".**

| Tahap | Pekerjaan | Output |
|---|---|---|
| 1 | Migration 4 tabel di atas | Migration up/down |
| ✅ | **Checkpoint review 1** | — |
| 2 | API skeleton: CRUD content + connect akun (mock, belum OAuth nyata) | Service jalan lokal sesuai Bagian 3 |
| ✅ | **Checkpoint review 2** | — |
| 3 | Integrasi OAuth nyata Instagram untuk Matcha, test connect dan publish manual sekali | Akun `connected`, 1 post berhasil tayang |
| ✅ | **Checkpoint review 3** | — |
| 4 | Workflow n8n scheduler dasar: cron → due schedules → publish Instagram Matcha saja | Post terjadwal tayang otomatis tanpa intervensi manual |
| ✅ | **Checkpoint review 4** | — |
| 5 | Tambah TikTok + endpoint `/content/generate` (AI caption generator) | Dua channel aktif untuk Matcha |
| ✅ | **Checkpoint review 5** | — |
| 6 | Scale ke NotaBe, lalu Krama/Nine Studio setelah live | Social Media aktif penuh di platform prioritas |

---

*Data dari modul ini (status publish, jumlah content terjadwal vs sukses) jadi salah satu sumber utama Analytics dan modul Automation berikutnya.*
