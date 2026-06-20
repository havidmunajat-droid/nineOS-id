# NineOS — Spesifikasi Modul 2: HelpDesk (Automasi Q&A)

> **Untuk: Claude Code**
> Kerjakan **bertahap sesuai Bagian 8**, berhenti di setiap checkpoint untuk direview founder. Modul ini **bergantung pada Modul 1** — pastikan tabel `platforms` dan `platform_connections` sudah ada sebelum migration di bawah dijalankan.

---

## 1. Ringkasan Modul

HelpDesk = automasi Q&A per platform. Saat pelanggan mengirim pesan lewat WhatsApp, Email, Instagram, atau TikTok ke salah satu dari 4 platform, sistem:

1. Mengenali platform & percakapan mana pesan itu berasal.
2. AI mencari jawaban dari knowledge base milik platform tersebut.
3. Kalau yakin → balas otomatis. Kalau tidak yakin / topik sensitif → eskalasi ke agent manusia.
4. Semua percakapan & hasil tercatat untuk bahan Analytics nanti.

**Pilot implementasi:** Matcha + channel WhatsApp dulu (lihat Bagian 8), baru di-scale ke NotaBe dan channel lain.

---

## 2. Skema Database

```sql
-- ============================================
-- NineOS — Modul 2: HelpDesk (Automasi Q&A)
-- Depends on: platforms(id) dari Modul 1
-- ============================================

-- Channel komunikasi aktif per platform
CREATE TABLE helpdesk_channels (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id                 UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    channel_type                VARCHAR(20) NOT NULL, -- 'whatsapp' | 'email' | 'instagram' | 'tiktok'
    channel_identifier          VARCHAR(255) NOT NULL, -- no. WA bisnis / alamat email / handle IG-TikTok
    access_token_encrypted      TEXT,
    webhook_verify_token_encrypted TEXT,
    is_active                   BOOLEAN DEFAULT true,
    created_at                  TIMESTAMPTZ DEFAULT now(),
    updated_at                  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (platform_id, channel_type)
);

-- Pengaturan automasi AI per platform
CREATE TABLE helpdesk_settings (
    platform_id            UUID PRIMARY KEY REFERENCES platforms(id) ON DELETE CASCADE,
    auto_reply_enabled     BOOLEAN DEFAULT true,
    confidence_threshold   NUMERIC(3,2) DEFAULT 0.75, -- 0.00 - 1.00
    escalation_keywords    TEXT[] DEFAULT ARRAY['refund','komplain','marah','tipu'],
    fallback_message       TEXT DEFAULT 'Terima kasih, pesanmu sudah kami terima. Tim kami akan membalas segera.',
    updated_at              TIMESTAMPTZ DEFAULT now()
);

-- Knowledge base / FAQ per platform
CREATE TABLE helpdesk_knowledge_base (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id   UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    category      VARCHAR(50),
    question      TEXT NOT NULL,
    answer        TEXT NOT NULL,
    tags          TEXT[],
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Satu percakapan = satu pelanggan di satu channel
CREATE TABLE helpdesk_conversations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id          UUID NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    channel_type         VARCHAR(20) NOT NULL,
    customer_identifier  VARCHAR(255) NOT NULL, -- no. HP / email / handle
    customer_name        VARCHAR(150),
    status               VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open' | 'escalated' | 'closed'
    assigned_agent       VARCHAR(150),
    created_at           TIMESTAMPTZ DEFAULT now(),
    last_message_at      TIMESTAMPTZ DEFAULT now()
);

-- Tiap pesan dalam percakapan (dari pelanggan, AI, atau agent)
CREATE TABLE helpdesk_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES helpdesk_conversations(id) ON DELETE CASCADE,
    sender_type         VARCHAR(20) NOT NULL, -- 'customer' | 'ai' | 'agent'
    message_text        TEXT NOT NULL,
    ai_confidence_score NUMERIC(3,2),
    matched_kb_id        UUID REFERENCES helpdesk_knowledge_base(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ DEFAULT now()
);

-- Log saat percakapan dieskalasi ke manusia
CREATE TABLE helpdesk_escalations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID NOT NULL REFERENCES helpdesk_conversations(id) ON DELETE CASCADE,
    reason            VARCHAR(50) NOT NULL, -- 'low_confidence' | 'keyword_match' | 'manual'
    escalated_at      TIMESTAMPTZ DEFAULT now(),
    resolved_at       TIMESTAMPTZ,
    resolved_by       VARCHAR(150)
);
```

**Relasi:** `platforms` 1—N `helpdesk_channels`, 1—1 `helpdesk_settings`, 1—N `helpdesk_knowledge_base`, 1—N `helpdesk_conversations` 1—N `helpdesk_messages`, dan `helpdesk_conversations` 1—N `helpdesk_escalations`.

---

## 3. Kontrak API Gateway

Base path: `/api/v1` (sama dengan Modul 1).

| Method | Path | Fungsi |
|---|---|---|
| GET | `/platforms/{slug}/helpdesk/settings` | Ambil pengaturan auto-reply platform |
| PUT | `/platforms/{slug}/helpdesk/settings` | Update threshold, keyword eskalasi, dll |
| GET | `/platforms/{slug}/helpdesk/knowledge-base` | List FAQ |
| POST | `/platforms/{slug}/helpdesk/knowledge-base` | Tambah FAQ |
| PUT | `/platforms/{slug}/helpdesk/knowledge-base/{id}` | Update FAQ |
| DELETE | `/platforms/{slug}/helpdesk/knowledge-base/{id}` | Hapus FAQ |
| GET | `/platforms/{slug}/helpdesk/knowledge-base/search?q=` | Dipanggil n8n — cari FAQ relevan (dipakai sebagai konteks AI) |
| GET | `/platforms/{slug}/helpdesk/conversations?status=` | List percakapan |
| GET | `/platforms/{slug}/helpdesk/conversations/{id}` | Detail percakapan + histori pesan |
| POST | `/helpdesk/messages/inbound` | Dipanggil n8n — pesan baru dari pelanggan masuk |
| POST | `/helpdesk/messages/outbound` | Dipanggil n8n — catat balasan AI/agent |
| PATCH | `/helpdesk/conversations/{id}/escalate` | Tandai percakapan dieskalasi |
| PATCH | `/helpdesk/conversations/{id}/close` | Tutup percakapan |

---

## 4. Contoh Payload JSON

**4.1 — `POST /helpdesk/messages/inbound`** (dikirim n8n setelah normalisasi pesan dari channel apa pun)
```json
{
  "platform": "matcha",
  "channel": "whatsapp",
  "customer_identifier": "+6281234567890",
  "customer_name": "Budi Santoso",
  "message_text": "Min, pesanan saya kapan sampai ya?",
  "received_at": "2026-06-20T08:15:00+07:00"
}
```
Response — gateway membuat/menemukan `conversation_id`:
```json
{
  "conversation_id": "c1a2...",
  "is_new_conversation": false,
  "status": "open"
}
```

**4.2 — `GET /platforms/matcha/helpdesk/knowledge-base/search?q=pesanan+kapan+sampai`**
```json
{
  "query": "pesanan kapan sampai",
  "results": [
    {
      "id": "kb_881",
      "question": "Berapa lama estimasi pengiriman?",
      "answer": "Estimasi pengiriman 2-4 hari kerja untuk area Jabodetabek.",
      "score": 0.86
    }
  ]
}
```

**4.3 — `POST /helpdesk/messages/outbound`** (AI berhasil menjawab, confidence tinggi)
```json
{
  "conversation_id": "c1a2...",
  "sender_type": "ai",
  "message_text": "Halo Budi, estimasi pengiriman pesananmu 2-4 hari kerja ya.",
  "ai_confidence_score": 0.91,
  "matched_kb_id": "kb_881"
}
```

**4.4 — `PATCH /helpdesk/conversations/{id}/escalate`** (confidence rendah atau keyword sensitif)
```json
{
  "reason": "keyword_match",
  "ai_confidence_score": 0.38,
  "matched_keyword": "refund"
}
```
n8n lalu mengirim notifikasi ke Telegram/WA tim support (reuse mekanisme report dari Modul 1).

---

## 5. Alur n8n

Diagram visual sudah ditampilkan di chat. Lima tahap:

1. **Trigger** — webhook inbound dari WhatsApp/Email/Instagram/TikTok (lewat provider masing-masing, dinormalisasi n8n sebelum diteruskan).
2. **Identifikasi** — `POST /helpdesk/messages/inbound` untuk mendapat/membuat `conversation_id`.
3. **Cari jawaban AI** — panggil `knowledge-base/search`, lalu node AI menyusun jawaban + skor keyakinan berdasarkan hasil pencarian.
4. **Keputusan keyakinan** — node `IF`: jika skor ≥ `confidence_threshold` dan tidak mengandung `escalation_keywords` → lanjut auto-balas. Jika tidak → eskalasi.
5. **Balas dan catat** — kirim balasan via channel API (auto) **atau** kirim `fallback_message` + notifikasi agent (eskalasi), lalu log ke `messages/outbound` atau `conversations/{id}/escalate`.

---

## 6. Rencana Eksekusi Bertahap untuk Claude Code

**Wajib berhenti di setiap "✅ Checkpoint review".**

| Tahap | Pekerjaan | Output |
|---|---|---|
| 1 | Migration 6 tabel di atas + seed `helpdesk_settings` default untuk 4 platform | Migration up/down |
| ✅ | **Checkpoint review 1** | — |
| 2 | API skeleton: CRUD knowledge base + `GET conversations` dengan data dummy | Service jalan lokal sesuai Bagian 3 |
| ✅ | **Checkpoint review 2** | — |
| 3 | Isi knowledge base awal Matcha (minimal 10-15 FAQ nyata dari founder) | Data KB tersimpan, bisa di-search |
| ✅ | **Checkpoint review 3** | — |
| 4 | Workflow n8n pilot: WhatsApp Matcha saja, auto-reply tanpa eskalasi dulu | Bot bisa balas pertanyaan sederhana |
| ✅ | **Checkpoint review 4** | — |
| 5 | Tambah logic eskalasi (threshold + keyword) + notifikasi agent | Pesan sensitif benar ke-escalate |
| ✅ | **Checkpoint review 5** | — |
| 6 | Scale ke NotaBe, lalu channel Email/Instagram/TikTok | HelpDesk aktif penuh di 2 platform prioritas |

---

*Modul HelpDesk ini menyediakan data yang nanti dipakai modul Analytics (jumlah percakapan, rasio auto-reply vs eskalasi) dan Virtual Office/CMO untuk insight pelanggan di Fase 2.*
