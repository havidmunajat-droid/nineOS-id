# NineOS — Ekstensi Modul 5: Council Meeting (Rapat Malam 22:00)

> **Untuk: Claude Code**
> Dokumen ini adalah **ekstensi**, bukan modul baru — dibangun di atas Virtual Office yang sudah aktif (`nineos-backend/src/modules/virtual-office/`). Referensi ide dari repo publik [`llm-council`](https://github.com/karpathy/llm-council) (pola 3-stage: opini individual → peer review → sintesis chairman), tapi **diadaptasi jadi single-provider multi-persona**, bukan multi-vendor, karena alasan biaya (lihat Bagian 5).
>
> **Koreksi konteks penting:** dokumen `NineOS-Modul5-VirtualOffice.md` (Bagian 5) menyebut alur lewat n8n — itu SUDAH DIGANTIKAN oleh ADR-001 (21 Juni 2026): AI dipanggil langsung dari backend (`VirtualOfficeService.callAI()` → `AIService.chat()`), bukan lewat n8n. Ekstensi ini mengikuti ADR-001, murni backend NestJS + cron.

---

## 1. Latar Belakang & Tujuan

Arahan kapten (30 Juni 2026): Virtual Office perlu fitur **"set meeting tiap 22:00 untuk keputusan esok hari"**.

Tujuan: tiap malam jam 22:00, semua executive aktif (CEO, CFO, CTO, CMO) otomatis "rapat" — masing-masing kasih 2-3 prioritas berdasarkan data platform hari itu, lalu CEO mensintesis jadi keputusan final untuk besok. Founder tinggal buka Virtual Office paginya dan baca ringkasan, tanpa perlu memicu chat manual satu-satu ke tiap role.

## 2. Kenapa BUKAN Multi-Vendor Council

Repo referensi (`llm-council`) memanggil 4 model premium berbeda (GPT-5.1, Gemini-3-Pro, Claude-Sonnet-4.5, Grok-4) lewat OpenRouter per pertanyaan — 8-10 API call mahal per sesi, butuh API key/akun tambahan (OpenRouter).

NineOS **sudah** punya `AIService` (Gemini Flash 2.5 primary, Claude fallback) yang dipakai di seluruh Virtual Office. Pola yang diadopsi di sini:

- **Bukan** 4 model berbeda → **1 provider, N persona** (reuse `exec.systemPrompt` tiap executive yang sudah ada di tabel `executives`).
- Efek "banyak sudut pandang" tetap didapat (tiap executive tetap punya konteks/scope berbeda), tapi biaya tetap 1 tarif provider murah.
- Stage 2 (peer-review/ranking ala llm-council) **di-skip secara default** — tidak relevan untuk pengambilan keputusan internal (bukan blind-benchmark model), dan menghemat separuh API call. Bisa diaktifkan sebagai opsi nanti (lihat Bagian 6).

## 3. Perubahan Skema Database

**Tidak perlu tabel baru.** Reuse penuh:
- `executive_sessions.mode` → tambah nilai `'council'` (selain `'chat'`/`'meeting'` yang sudah ada).
- `executive_sessions.participant_executive_ids` → isi semua executive `status='active'`.
- `executive_sessions.scheduled_at` / `summary` → sudah ada, cocok untuk timestamp cron & hasil sintesis CEO.
- `executive_messages` → satu row per stage per executive (`sender_type='executive'`, `context_data` diisi `{ "stage": "opinion" | "synthesis" }`).

**Migration kecil opsional** (audit trail, bukan wajib):
```sql
ALTER TABLE executive_sessions
  ADD COLUMN trigger_source VARCHAR(20) NOT NULL DEFAULT 'manual';
  -- 'manual' | 'cron'
```

## 4. Perubahan Backend

### 4.1 Dependency baru
```bash
npm install @nestjs/schedule
```
Belum ada infrastruktur cron sama sekali di backend saat ini — ini dependency baru.

### 4.2 File baru
`src/modules/virtual-office/council-scheduler.service.ts`
```ts
@Injectable()
export class CouncilSchedulerService {
  constructor(private readonly virtualOffice: VirtualOfficeService) {}

  @Cron(process.env.COUNCIL_CRON_EXPR ?? '0 22 * * *', { timeZone: 'Asia/Jakarta' })
  async handleNightlyCouncil() {
    await this.virtualOffice.runDailyCouncilMeeting('cron');
  }
}
```

### 4.3 Modifikasi `virtual-office.module.ts`
- Import `ScheduleModule.forRoot()` (sekali saja di root module, cek jangan didaftarkan dobel kalau modul lain nanti butuh cron juga).
- Register `CouncilSchedulerService` sebagai provider.

### 4.4 Modifikasi `virtual-office.service.ts` — method baru
```ts
async runDailyCouncilMeeting(triggerSource: 'cron' | 'manual'): Promise<ExecutiveSession> {
  const executives = await this.listExecutives({ status: 'active' }); // CEO, CFO, CTO, CMO

  const session = await this.createSession({
    mode: 'council',
    participantExecutiveIds: executives.map(e => e.id),
    title: `Rapat Malam ${new Date().toISOString().slice(0,10)}`,
    scheduledAt: new Date(),
  });

  // Stage 1 — opini paralel tiap executive (reuse buildContext + callAI yang sudah ada)
  const opinions = await Promise.all(
    executives.map(async (exec) => {
      const context = await this.buildContext('all'); // sudah ada, dipakai CEO existing
      const prompt = `Berdasarkan data berikut, beri 2-3 prioritas konkret untuk BESOK dari sudut pandang perananmu:\n${JSON.stringify(context)}`;
      const text = await this.callAI(exec, [], prompt, context);
      await this.saveExecutiveMessage(session.id, exec.id, text, { stage: 'opinion' });
      return { role: exec.roleCode, text };
    })
  );

  // Stage 2 — SKIP by default (lihat Bagian 6 untuk opsi mengaktifkan)

  // Stage 3 — sintesis oleh CEO (chairman)
  const ceo = executives.find(e => e.roleCode === 'CEO');
  const synthesisPrompt = `Berikut pendapat tiap C-Level untuk prioritas besok:\n${
    opinions.map(o => `${o.role}: ${o.text}`).join('\n\n')
  }\n\nSintesis jadi 3-5 KEPUTUSAN konkret untuk besok, format list bernomor.`;
  const finalDecision = await this.callAI(ceo, [], synthesisPrompt, {});
  await this.saveExecutiveMessage(session.id, ceo.id, finalDecision, { stage: 'synthesis' });

  await this.endSession(session.id, { summary: finalDecision });
  return session;
}
```
(Nama method `buildContext`, `callAI`, `saveExecutiveMessage`, `endSession` — sesuaikan dengan nama private method asli di service, ini pseudocode berdasarkan struktur yang sudah ada.)

### 4.5 Modifikasi `virtual-office.controller.ts` — endpoint baru
| Method | Path | Fungsi |
|---|---|---|
| POST | `/virtual-office/council/run-now` | Trigger manual (testing/admin) — panggil `runDailyCouncilMeeting('manual')` |
| GET | `/virtual-office/council/latest` | Ambil sesi `mode='council'` terbaru + summary, untuk ditampilkan pagi hari |

### 4.6 Environment variables baru
```
COUNCIL_CRON_EXPR=0 22 * * *
COUNCIL_ENABLE_PEER_REVIEW=false
```

## 5. Estimasi Biaya

| Skenario | Call/hari | Provider | Catatan |
|---|---|---|---|
| Council tanpa peer-review (default) | 4 opini + 1 sintesis = **5** | Gemini Flash 2.5 (sudah aktif) | ~150 call/bulan, tidak butuh API key baru |
| Council + peer-review opsional | +4 = **9** | Gemini Flash 2.5 | Masih 1 provider murah |
| (Pembanding) llm-council asli | 8-10 | 4 model premium beda vendor via OpenRouter | Butuh akun+key baru, jauh lebih mahal — **tidak dipakai** |

Karena dijalankan cron 1x/hari (bukan per pesan user), biaya total tetap sangat kecil dibanding chatbot interaktif.

## 6. Opsi Lanjutan (Tidak Wajib di Versi Awal)

- **Peer-review stage**: aktifkan `COUNCIL_ENABLE_PEER_REVIEW=true` untuk momen penting (tutup bulan) — tiap executive kasih review singkat ke opini lain sebelum CEO sintesis.
- **Multi-provider per role**: kalau nanti mau CFO benar-benar pakai model berbeda dari CTO, tinggal manfaatkan kolom `executives.ai_model` yang **sudah ada** di skema (per-executive model override) — tidak perlu ubah arsitektur.
- **Notifikasi**: kirim ringkasan `finalDecision` ke WhatsApp/email founder tiap pagi (butuh integrasi terpisah, di luar scope dokumen ini).

## 7. Perubahan Frontend (`nineos-frontend/app/virtual-office/page.tsx`)

Kondisi saat ini: halaman cuma chat 1-on-1, **belum ada** list/history sesi.

Tambahan minimal:
1. Kartu **"Rapat Malam"** di atas halaman — tampilkan `summary` sesi `mode='council'` terakhir + timestamp, collapsible untuk lihat opini tiap executive (`stage='opinion'`).
2. Tombol **"Jalankan Rapat Sekarang"** (admin/testing) → `POST /virtual-office/council/run-now`.
3. (Nice-to-have, bisa menyusul) List riwayat sesi `mode='council'` — perlu endpoint `GET /virtual-office/sessions?mode=council` yang mungkin sudah bisa dipakai dari kontrak API existing.

## 8. Rencana Eksekusi Bertahap

**Wajib berhenti di setiap "✅ Checkpoint review"**, ikuti pola dokumen Modul 5 asli.

| Tahap | Pekerjaan | Output |
|---|---|---|
| 1 | Install `@nestjs/schedule`, migration `trigger_source` (opsional) | Dependency siap |
| ✅ | **Checkpoint review 1** | — |
| 2 | `runDailyCouncilMeeting()` di service + endpoint `POST /council/run-now` (manual dulu, cron belum aktif) | Bisa ditrigger manual via Postman/curl, hasil tersimpan di `executive_sessions`/`executive_messages` |
| ✅ | **Checkpoint review 2** | — |
| 3 | `CouncilSchedulerService` + `@Cron` aktif jam 22:00 WIB | Rapat jalan otomatis tiap malam |
| ✅ | **Checkpoint review 3** | — |
| 4 | Frontend: kartu Rapat Malam + tombol manual | Founder bisa lihat ringkasan paginya |
| ✅ | **Checkpoint review 4** | — |
| 5 (opsional) | Peer-review stage + notifikasi eksternal | — |

---

*Dokumen ini melengkapi `NineOS-Modul5-VirtualOffice.md` — siap diserahkan ke sesi project nineOS untuk dieksekusi Claude Code.*
