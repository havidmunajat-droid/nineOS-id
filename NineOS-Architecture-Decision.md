# 🏛️ Keputusan Arsitektur NineOS (ADR)

> Tanggal: 21 Juni 2026 · Status: DISETUJUI (founder + Claude)

## ADR-001: AI di kode NineOS sebagai otak, n8n sebagai tangan

**Keputusan:** Semua logika inti (generate caption, generate media, preview,
keputusan posting) berjalan **langsung di backend NineOS**. n8n dipakai hanya
sebagai lapisan otomasi pinggiran (penjadwalan, fan-out channel, notifikasi).

**Prinsip emas:**
> **n8n memanggil NineOS, BUKAN sebaliknya untuk logika inti.**
> NineOS tetap "otak". n8n hanya "tangan" yang memanggil endpoint NineOS.

**Alasan:**
- Logika = IP, harus di repo (versioned, testable, reviewable)
- Produk SaaS harus bisa di-scale & di-maintain dari codebase, bukan workflow visual
- Alur interaktif (submit → preview → post) butuh request/response cepat — tidak cocok lewat n8n yang async
- Menghindari ketergantungan kritis ke uptime/hosting n8n

**Pembagian peran:**
| Bagian | Pelaksana |
|---|---|
| Generate caption + media (Veo) | NineOS langsung |
| Preview & approve | NineOS langsung |
| Post realtime "sekarang" | NineOS langsung |
| Posting terjadwal, fan-out multi-channel | n8n (panggil NineOS) |
| Auto-reply, report, notifikasi | n8n (panggil NineOS) |

## ADR-002: Provider AI dipisah teks vs media

- **Teks/caption** → `AIService` (Gemini / Anthropic) — sudah ada
- **Media (gambar/video)** → `MediaGenerationService` baru, provider-switch
  - Mulai: **Google Veo/Imagen** (key Gemini sudah ada)
  - Siap colok: **Bytedance** (Seedream/Seedance via BytePlus) tanpa ubah kode pemanggil
  - Fallback: provider `mock` (placeholder) supaya alur bisa dites tanpa biaya

**Yang masih perlu dicolok untuk media-gen produksi:**
1. Akses & billing Veo/Imagen (atau Bytedance)
2. **Storage media** (S3/Cloudinary) — hasil generate butuh URL publik untuk diposting
