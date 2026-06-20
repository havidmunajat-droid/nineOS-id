# NineOS — Spesifikasi Modul 4: Automation (Orkestrasi & Report Founder)

> **Untuk: Claude Code**
> Kerjakan **bertahap sesuai Bagian 6**, berhenti di setiap checkpoint untuk direview founder. Modul ini **mengagregasi data dari Modul 1-3** — paling efektif dikerjakan setelah HelpDesk dan Social Media minimal sudah di tahap pilot.

---

## 1. Ringkasan Modul

Sesuai catatan di file project, Automation berisi dua hal:

1. **Jalur automasi posting** (dengan data dari konten) — sudah dibangun sebagai workflow n8n di Modul 3. Modul ini menambahkan **lapisan kontrol**: registry status tiap pipeline (aktif/pause/error) supaya terlihat di dashboard, tidak perlu buka n8n langsung.
2. **Automasi kirim report ke Telegram/WA founder** — ringkasan berkala (harian/mingguan) dan alert real-time saat ada kegagalan di modul lain (publish gagal, eskalasi HelpDesk, koneksi platform error).

Dengan selesainya modul ini, **empat modul Phase 1 lengkap** (Dashboard, HelpDesk, Social Media, Automation) — sesuai catatan di file project, ini langsung memberi manfaat operasional harian sebelum masuk Fase 2 (Virtual Office).

**Catatan implementasi:** tabel `automation_pipelines` di bawah adalah registry ringan di sisi NineOS, bukan duplikasi penuh data n8n. Untuk MVP cukup di-update manual oleh tiap workflow saat run. Sinkronisasi otomatis dengan REST API n8n (ambil status workflow & histori eksekusi asli) bisa jadi peningkatan di iterasi berikutnya, bukan blocker Phase 1.

---

## 2. Skema Database

```sql
-- ============================================
-- NineOS — Modul 4: Automation (Orkestrasi & Report Founder)
-- Depends on: platforms(id) dari Modul 1
-- ============================================

-- Registry tiap pipeline/workflow n8n yang berjalan
CREATE TABLE automation_pipelines (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(150) NOT NULL,
    pipeline_type    VARCHAR(30) NOT NULL, -- 'social_publish' | 'helpdesk_autoresponse' | 'health_check' | 'report'
    platform_id      UUID REFERENCES platforms(id) ON DELETE CASCADE, -- NULL = berlaku global, semua platform
    n8n_workflow_id  VARCHAR(100), -- referensi ID workflow di n8n
    status           VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'error'
    last_run_at      TIMESTAMPTZ,
    last_run_status  VARCHAR(20), -- 'success' | 'failed'
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Jadwal report berkala ke founder
CREATE TABLE report_schedules (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type            VARCHAR(30) NOT NULL, -- 'daily_summary' | 'weekly_summary'
    destination_channel    VARCHAR(20) NOT NULL, -- 'telegram' | 'whatsapp'
    destination_identifier VARCHAR(150) NOT NULL, -- chat_id Telegram / no. WA
    cron_expression        VARCHAR(50) NOT NULL, -- mis. '0 20 * * *' = tiap jam 20:00
    is_active               BOOLEAN DEFAULT true,
    last_sent_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

-- Alert real-time dari modul lain (publish gagal, eskalasi, platform error)
CREATE TABLE automation_alerts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_module  VARCHAR(30) NOT NULL, -- 'platform_health' | 'helpdesk' | 'social_media'
    severity       VARCHAR(20) NOT NULL DEFAULT 'warning', -- 'info' | 'warning' | 'critical'
    message        TEXT NOT NULL,
    related_table  VARCHAR(50), -- mis. 'content_schedules', 'helpdesk_escalations'
    related_id     UUID,
    status         VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
    created_at     TIMESTAMPTZ DEFAULT now(),
    sent_at        TIMESTAMPTZ
);

-- Log semua pesan yang terkirim ke founder (report berkala maupun alert)
CREATE TABLE report_logs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type             VARCHAR(20) NOT NULL, -- 'scheduled_report' | 'realtime_alert'
    source_id               UUID NOT NULL, -- merujuk report_schedules.id atau automation_alerts.id
    destination_channel     VARCHAR(20) NOT NULL,
    destination_identifier  VARCHAR(150) NOT NULL,
    message_content         TEXT,
    status                  VARCHAR(20) NOT NULL, -- 'success' | 'failed'
    error_message           TEXT,
    sent_at                 TIMESTAMPTZ DEFAULT now()
);
```

**Relasi:** `platforms` 1—N `automation_pipelines` (nullable, bisa global). `report_schedules` dan `automation_alerts` masing-masing 1—N ke `report_logs` lewat `source_type` + `source_id` (referensi longgar, bukan FK langsung, karena satu tabel log melayani dua sumber berbeda).

---

## 3. Kontrak API Gateway

Base path: `/api/v1`.

| Method | Path | Fungsi |
|---|---|---|
| GET | `/automation/pipelines` | List semua pipeline + status |
| PATCH | `/automation/pipelines/{id}` | Pause/resume pipeline |
| GET | `/automation/pipelines/{id}/runs` | Histori run pipeline (agregasi dari log Modul 1-3) |
| GET | `/automation/reports/schedules` | List jadwal report |
| POST | `/automation/reports/schedules` | Buat jadwal report baru |
| PUT | `/automation/reports/schedules/{id}` | Update jadwal report |
| DELETE | `/automation/reports/schedules/{id}` | Hapus jadwal report |
| GET | `/automation/reports/due` | Dipanggil n8n cron — ambil jadwal report yang due dikirim |
| POST | `/automation/alerts` | Dipanggil modul lain — daftarkan alert baru |
| GET | `/automation/alerts?status=pending` | Dipanggil n8n — ambil alert yang belum dikirim |
| PATCH | `/automation/alerts/{id}/sent` | Tandai alert sudah dikirim |
| POST | `/automation/reports/logs` | Catat hasil pengiriman (report maupun alert) |

---

## 4. Contoh Payload JSON

**4.1 — `GET /automation/pipelines` response**
```json
{
  "data": [
    {
      "id": "pl_01",
      "name": "Social publish - Matcha",
      "pipeline_type": "social_publish",
      "platform": "matcha",
      "status": "active",
      "last_run_at": "2026-06-23T09:00:14+07:00",
      "last_run_status": "success"
    },
    {
      "id": "pl_02",
      "name": "HelpDesk autoresponse - Matcha",
      "pipeline_type": "helpdesk_autoresponse",
      "platform": "matcha",
      "status": "active",
      "last_run_at": "2026-06-23T10:12:00+07:00",
      "last_run_status": "success"
    }
  ]
}
```

**4.2 — `PATCH /automation/pipelines/pl_01`** (pause dari dashboard)
```json
{ "status": "paused" }
```

**4.3 — `POST /automation/reports/schedules` request**
```json
{
  "report_type": "daily_summary",
  "destination_channel": "telegram",
  "destination_identifier": "-1001234567890",
  "cron_expression": "0 20 * * *"
}
```

**4.4 — `POST /automation/alerts`** (dipanggil Modul 3 saat publish gagal)
```json
{
  "source_module": "social_media",
  "severity": "warning",
  "message": "Publish Instagram Matcha gagal: token expired",
  "related_table": "content_schedules",
  "related_id": "sch_771"
}
```

**4.5 — `GET /automation/reports/due`** (dipanggil n8n cron, jam 20:00)
```json
{
  "data": [
    {
      "schedule_id": "rs_01",
      "report_type": "daily_summary",
      "destination_channel": "telegram",
      "destination_identifier": "-1001234567890"
    }
  ]
}
```

**4.6 — `POST /automation/reports/logs`** (n8n setelah kirim)
```json
{
  "source_type": "scheduled_report",
  "source_id": "rs_01",
  "destination_channel": "telegram",
  "destination_identifier": "-1001234567890",
  "message_content": "Ringkasan harian NineOS 23 Jun 2026: 12 post terbit, 45 chat HelpDesk (3 eskalasi), semua platform connected.",
  "status": "success"
}
```

---

## 5. Alur n8n

Diagram visual sudah ditampilkan di chat. Ada **dua jalur trigger** yang bermuara ke node yang sama:

1. **Trigger** — `Cron` (untuk report berkala, panggil `GET /automation/reports/due`) **atau** `Webhook` (untuk alert real-time, dipicu saat modul lain memanggil `POST /automation/alerts`).
2. **Kumpulkan data** — untuk jalur report: query ringkasan dari Modul 1 (`platform_health_logs`), Modul 2 (`helpdesk_conversations`/`escalations`), Modul 3 (`content_schedules`). Untuk jalur alert: ambil detail dari `automation_alerts` yang relevan.
3. **Susun pesan** — node AI merangkai data jadi kalimat ringkas natural language (bukan dump angka mentah).
4. **Kirim ke founder** — `IF` berdasarkan `destination_channel`: API Telegram Bot atau WhatsApp Business API.
5. **Catat log** — `POST /automation/reports/logs`, dan untuk jalur alert tambahan `PATCH /automation/alerts/{id}/sent`.

---

## 6. Rencana Eksekusi Bertahap untuk Claude Code

**Wajib berhenti di setiap "✅ Checkpoint review".**

| Tahap | Pekerjaan | Output |
|---|---|---|
| 1 | Migration 4 tabel di atas | Migration up/down |
| ✅ | **Checkpoint review 1** | — |
| 2 | API skeleton: list/pause pipeline + CRUD report schedule, data dummy dulu | Service jalan lokal sesuai Bagian 3 |
| ✅ | **Checkpoint review 2** | — |
| 3 | Workflow n8n alert real-time dulu — hubungkan ke kegagalan publish (Modul 3) dan eskalasi (Modul 2) yang sudah berjalan | Alert masuk ke Telegram saat ada kegagalan nyata |
| ✅ | **Checkpoint review 3** | — |
| 4 | Workflow n8n report harian: cron jam 20:00 → agregasi data → kirim Telegram | Founder terima ringkasan harian otomatis |
| ✅ | **Checkpoint review 4** | — |
| 5 | Tambah WhatsApp sebagai `destination_channel` alternatif + opsi report mingguan | Founder bisa pilih channel & frekuensi report |
| ✅ | **Checkpoint review 5** | — |

---

*Selesainya modul ini menandai Phase 1 lengkap. Fase 2 (Virtual Office — CEO, CFO, CTO, CMO) akan jadi "otak" yang membaca data dari keempat modul ini, sesuai catatan di file project.*
