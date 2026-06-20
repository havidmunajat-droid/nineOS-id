# NineOS — Spesifikasi Fase 2, Modul 5: Virtual Office

> **Untuk: Claude Code**
> Kerjakan **bertahap sesuai Bagian 7**, berhenti di setiap checkpoint untuk direview founder. Modul ini **mengonsumsi data dari Modul 1-4** (Fase 1) sebagai "otak" yang membaca seluruh dashboard — sesuai catatan di file project.

---

## 1. Ringkasan Modul

Virtual Office adalah ruang chat antara founder dengan AI yang berperan sebagai tiap C-Level, plus mode meeting untuk diskusi multi-role dalam satu sesi.

| Role | Scope (sesuai file project) | Status |
|---|---|---|
| **CEO** | General dan keputusan akhir, report ke founder | 🟢 Aktif |
| **CFO** | Strategi keuangan dan laporan keuangan | 🟢 Aktif* |
| **CTO** | Server, bug, database, API | 🟢 Aktif |
| **CMO** | Strategi pemasaran | 🟢 Aktif |
| **COO** | Operasional harian | ⚪ Placeholder, scope belum didetailkan |
| **Legal** | Kepatuhan dan kontrak | ⚪ Placeholder, scope belum didetailkan |

\* CFO aktif untuk chat, tapi lihat **Bagian 2.1** — datanya masih perlu keputusan founder.

Skema dibuat generik untuk 6 role (pola sama seperti 4 platform di Modul 1) supaya COO dan Legal tinggal diaktifkan begitu scope-nya jelas, tanpa ubah skema.

---

## 2. Skema Database

```sql
-- ============================================
-- NineOS — Modul 5: Virtual Office (Fase 2)
-- ============================================

-- Registry 6 role C-Level
CREATE TABLE executives (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_code          VARCHAR(20) UNIQUE NOT NULL, -- 'CEO' | 'CFO' | 'CTO' | 'CMO' | 'COO' | 'LEGAL'
    display_name       VARCHAR(50) NOT NULL,
    scope_description  TEXT NOT NULL,
    system_prompt      TEXT NOT NULL, -- instruksi persona AI untuk role ini
    ai_model           VARCHAR(50) DEFAULT 'claude-sonnet-4-6',
    status             VARCHAR(20) NOT NULL DEFAULT 'not_ready', -- 'active' | 'not_ready'
    sort_order         INT DEFAULT 0,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Domain data yang boleh diakses tiap role (untuk membangun konteks AI)
CREATE TABLE executive_data_sources (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    executive_id  UUID NOT NULL REFERENCES executives(id) ON DELETE CASCADE,
    data_domain   VARCHAR(30) NOT NULL, -- 'platform_health' | 'social_media' | 'helpdesk' | 'automation' | 'finance'
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (executive_id, data_domain)
);

-- Sesi chat (1 role) atau meeting (banyak role)
CREATE TABLE executive_sessions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode                     VARCHAR(20) NOT NULL DEFAULT 'chat', -- 'chat' | 'meeting'
    title                    VARCHAR(200),
    participant_executive_ids UUID[] NOT NULL,
    status                   VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active' | 'scheduled' | 'in_progress' | 'completed' | 'archived'
    scheduled_at             TIMESTAMPTZ,
    started_at               TIMESTAMPTZ,
    ended_at                 TIMESTAMPTZ,
    summary                  TEXT,
    created_at               TIMESTAMPTZ DEFAULT now(),
    updated_at               TIMESTAMPTZ DEFAULT now()
);

-- Pesan dalam sesi (founder maupun tiap executive)
CREATE TABLE executive_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES executive_sessions(id) ON DELETE CASCADE,
    sender_type         VARCHAR(20) NOT NULL, -- 'founder' | 'executive' | 'system'
    speaker_executive_id UUID REFERENCES executives(id), -- NULL kalau sender_type = 'founder'
    message_text        TEXT NOT NULL,
    context_data        JSONB, -- data domain yang dipakai AI saat menjawab
    created_at           TIMESTAMPTZ DEFAULT now()
);

-- Seed 6 role (4 aktif, 2 placeholder)
INSERT INTO executives (role_code, display_name, scope_description, system_prompt, status, sort_order) VALUES
('CEO',   'CEO',   'General dan keputusan akhir, report ke founder', 'Kamu adalah CEO NineOS. Sintesis info dari CFO, CTO, CMO untuk beri rekomendasi keputusan ke founder.', 'active', 1),
('CFO',   'CFO',   'Strategi keuangan dan laporan keuangan', 'Kamu adalah CFO NineOS. Fokus pada kesehatan finansial dan strategi keuangan.', 'active', 2),
('CTO',   'CTO',   'Server, bug, database, API', 'Kamu adalah CTO NineOS. Fokus pada kesehatan teknis: koneksi platform, error, automasi.', 'active', 3),
('CMO',   'CMO',   'Strategi pemasaran', 'Kamu adalah CMO NineOS. Fokus pada performa konten, engagement, dan strategi pemasaran.', 'active', 4),
('COO',   'COO',   'Operasional harian (scope menyusul)', '', 'not_ready', 5),
('LEGAL', 'Legal', 'Kepatuhan dan kontrak (scope menyusul)', '', 'not_ready', 6);
```

**Relasi:** `executives` 1—N `executive_data_sources`; `executive_sessions` 1—N `executive_messages`; `executive_messages.speaker_executive_id` → `executives.id`.

### 2.1 — Catatan data finance (CFO)

Tidak ada modul Fase 1 yang menghasilkan data finansial (revenue, biaya, dll) — beda dengan CTO (data dari Modul 1/4) atau CMO (data dari Modul 2/3) yang sumbernya sudah ada. Supaya CFO tidak "kosong", saya sediakan tabel placeholder sederhana:

```sql
-- Opsional/placeholder — bukan modul Finance penuh
CREATE TABLE financial_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    revenue_total   NUMERIC(14,2),
    expense_total   NUMERIC(14,2),
    notes           TEXT,
    source          VARCHAR(20) DEFAULT 'manual', -- 'manual' | 'platform_aggregate'
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

Ini cukup untuk CFO menjawab pertanyaan dasar dari input manual founder, **bukan pengganti modul Finance/Accounting penuh**. Kalau nanti dibutuhkan integrasi otomatis ke data penjualan riil, itu jadi modul terpisah di luar dokumen ini.

---

## 3. Kontrak API Gateway

Base path: `/api/v1`.

| Method | Path | Fungsi |
|---|---|---|
| GET | `/virtual-office/executives` | List 6 role + status (active/not_ready) |
| GET | `/virtual-office/executives/{role_code}` | Detail role + data domain yang bisa diakses |
| POST | `/virtual-office/sessions` | Mulai sesi chat (1 role) atau meeting (banyak role) |
| GET | `/virtual-office/sessions?mode=&status=` | List sesi |
| GET | `/virtual-office/sessions/{id}` | Detail sesi + histori pesan |
| POST | `/virtual-office/sessions/{id}/messages` | Founder kirim pesan |
| POST | `/virtual-office/sessions/{id}/messages/ai-reply` | Dipanggil n8n — submit balasan AI executive |
| PATCH | `/virtual-office/sessions/{id}/end` | Tutup sesi, opsional simpan `summary` |
| GET | `/virtual-office/data-context/{domain}` | Dipanggil n8n — ambil ringkasan data domain tertentu sebelum AI menjawab |

---

## 4. Contoh Payload JSON

**4.1 — `GET /virtual-office/executives` response**
```json
{
  "data": [
    { "role_code": "CEO", "display_name": "CEO", "status": "active" },
    { "role_code": "CTO", "display_name": "CTO", "status": "active" },
    { "role_code": "COO", "display_name": "COO", "status": "not_ready" }
  ]
}
```

**4.2 — `POST /virtual-office/sessions`** (chat 1-on-1 dengan CTO)
```json
{
  "mode": "chat",
  "participant_roles": ["CTO"],
  "title": "Cek status koneksi platform"
}
```
Response:
```json
{ "session_id": "vo_101", "mode": "chat", "status": "active" }
```

**4.3 — `POST /virtual-office/sessions`** (meeting CEO + CFO + CMO)
```json
{
  "mode": "meeting",
  "participant_roles": ["CEO", "CFO", "CMO"],
  "title": "Review performa Q2",
  "scheduled_at": "2026-06-25T10:00:00+07:00"
}
```

**4.4 — `POST /virtual-office/sessions/vo_101/messages`** (founder bertanya)
```json
{
  "sender_type": "founder",
  "message_text": "Matcha kenapa sering error connection ya?"
}
```

**4.5 — `GET /virtual-office/data-context/platform_health`** (dipanggil n8n sebelum CTO menjawab)
```json
{
  "domain": "platform_health",
  "summary": {
    "matcha": { "status": "connected", "last_error": null, "uptime_24h": "99.2%" },
    "notabe": { "status": "connected", "last_error": null, "uptime_24h": "100%" }
  }
}
```

**4.6 — `POST /virtual-office/sessions/vo_101/messages/ai-reply`** (n8n submit balasan CTO)
```json
{
  "speaker_role": "CTO",
  "message_text": "Matcha sempat putus koneksi jam 03:00 selama 4 menit, sudah otomatis pulih. Tidak ada error berulang dalam 24 jam terakhir.",
  "context_data": {
    "source_domain": "platform_health",
    "queried_at": "2026-06-25T09:00:00+07:00"
  }
}
```

---

## 5. Alur n8n

Diagram visual sudah ditampilkan di chat. Lima tahap:

1. **Trigger** — webhook dari `POST /sessions/{id}/messages` saat founder kirim pesan.
2. **Tentukan role** — untuk mode `chat`, executive penjawab cuma 1 (dari `participant_executive_ids`). Untuk mode `meeting`, node `Loop` jalan ke tiap executive secara bergantian, masing-masing tetap melihat histori pesan sesi yang sama (jadi terasa seperti rapat beneran).
3. **Ambil konteks** — panggil `GET /data-context/{domain}` sesuai `executive_data_sources` milik role tsb. Khusus CEO, panggil semua domain lalu gabungkan sebagai konteks sintesis.
4. **Generate balasan AI** — kirim `system_prompt` role + konteks data + histori pesan sesi ke model AI.
5. **Kirim dan catat** — `POST /messages/ai-reply`, simpan `context_data` supaya jawaban bisa diaudit balik ke sumber datanya.

---

## 6. Peta Ketergantungan ke Modul Lain

| Role | Data domain | Sumber (Modul) |
|---|---|---|
| CTO | `platform_health`, `automation` | `platform_health_logs`, `platform_connections` (Modul 1); `automation_pipelines` (Modul 4) |
| CMO | `social_media`, `helpdesk` | `content_items`, `content_schedules` (Modul 3); `helpdesk_conversations` (Modul 2) |
| CFO | `finance` | `financial_snapshots` (Bagian 2.1 — input manual) |
| CEO | semua domain di atas | Sintesis lintas-modul |

Konsekuensinya: **CTO paling cepat bisa dibangun nyata** (data Modul 1 paling matang), CMO menyusul setelah Modul 2-3 jalan, CEO baru masuk akal setelah CTO+CMO siap karena tugasnya mensintesis keduanya.

---

## 7. Rencana Eksekusi Bertahap untuk Claude Code

**Wajib berhenti di setiap "✅ Checkpoint review".**

| Tahap | Pekerjaan | Output |
|---|---|---|
| 1 | Migration 4 tabel inti + `financial_snapshots` + seed 6 role | Migration up/down, 4 role berstatus `active` |
| ✅ | **Checkpoint review 1** | — |
| 2 | API skeleton: list executives, create session, kirim pesan founder (balasan AI masih manual/dummy dulu) | Service jalan lokal sesuai Bagian 3 |
| ✅ | **Checkpoint review 2** | — |
| 3 | Workflow n8n chat 1-on-1 — pilot **CTO** dulu karena datanya paling siap | CTO bisa menjawab pertanyaan nyata soal status platform |
| ✅ | **Checkpoint review 3** | — |
| 4 | Tambah **CMO**, lalu **CEO** (CEO setelah CMO+CTO jalan, karena perlu data keduanya) | 3 role aktif penuh |
| ✅ | **Checkpoint review 4** | — |
| 5 | Workflow mode meeting (multi-executive bergantian dalam satu sesi) | Founder bisa mulai meeting CEO+CFO+CMO |
| ✅ | **Checkpoint review 5** | — |
| 6 | **CFO** — setelah founder memutuskan sumber data finance final; **COO/Legal** menyusul setelah scope-nya didetailkan | — |

---

*Dengan ini, dokumen Fase 1 (Modul 1-4) dan Fase 2 awal (Modul 5 — Virtual Office) sudah lengkap untuk handoff ke Claude Code.*
