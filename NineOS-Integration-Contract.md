# 🔌 Kontrak Integrasi NineOS — Panduan "Cara Dicolok"

> Berikan dokumen ini ke developer (Claude/manusia) platform yang mau disambung ke NineOS.
> Contoh implementasi nyata yang sudah jalan: **Krama** (`krama-platform/backend/krama-api/src/modules/nineos/`).

NineOS = dashboard pusat yang membaca KPI dari beberapa platform (Matcha, NotaBe, Krama, Nine Studio).
Agar sebuah platform bisa "dicolok", **backend platform itu cukup menyediakan 2 endpoint + 1 auth**.

---

## Yang Harus Disediakan Platform (sisi mereka)

### 1. Endpoint Health Check
```
GET  {BASE_URL}/nineos/health
Header: X-NineOS-Key: <service-key>

Response 200:
{ "status": "ok", "platform": "<slug>", "timestamp": "2026-06-21T10:00:00.000Z" }
```

### 2. Endpoint KPI
```
GET  {BASE_URL}/nineos/kpi?period=today|week|month
Header: X-NineOS-Key: <service-key>

Response 200: JSON ringkasan metrik (lihat format di bawah)
```

### 3. Auth — Header `X-NineOS-Key`
- Kedua endpoint di atas dijaga guard yang memvalidasi header `X-NineOS-Key`.
- Key disimpan di tabel service-account milik platform (jangan hardcode).
- Kalau key tidak valid / tidak aktif → balas `401`.

> **Penting soal BASE_URL:** NineOS memanggil `{BASE_URL}/nineos/kpi`.
> Kalau backend pakai global prefix (mis. Krama `api/v1`), maka
> `BASE_URL = https://domain-platform/api/v1` (sudah termasuk prefix).

---

## Format Response KPI (rekomendasi)

Bentuk bebas per platform, TAPI usahakan ada blok `overview` berisi metrik umum
supaya NineOS gampang menampilkan lintas-platform:

```jsonc
{
  "platform": "<slug>",
  "period": "today",
  "overview": {
    "gmv": 0,                 // total nilai transaksi
    "revenue": 0,             // pendapatan platform (fee)
    "active_users": 0,
    "new_registrations": 0
  },
  // ...blok lain spesifik platform (orders, drivers, dst — bebas)
}
```

Contoh nyata Krama mengembalikan: `overview`, `drivers`, `merchants`, `orders`, `sayur_ai`, `ai_provider`.
Matcha/NotaBe boleh beda isinya sesuai metrik mereka.

---

## Yang Harus Diset di NineOS (sisi kita — saya yang kerjakan)

Setelah platform menyediakan endpoint di atas, di NineOS tinggal:

1. **Daftarkan platform** (slug, nama) di tabel `platforms`.
2. **Daftarkan koneksi**: `baseUrl` + `apiKey` (terenkripsi) di tabel `platform_connections`
   — ATAU untuk dev cepat, set env var:
   ```
   MATCHA_API_URL=https://.../api/v1
   MATCHA_NINEOS_KEY=<key-yang-sama-dengan-service-account-platform>
   ```
   (lihat `platform-kpi.service.ts` → `getEnvUrl()` / `getEnvKey()`)
3. **Tambahkan slug** ke array `SUPPORTED` di `platform-kpi.service.ts`
   (sekarang baru `['krama']`).
4. Frontend NineOS menampilkan kartu KPI-nya.

---

## Checklist untuk Developer Platform Baru

Minta developer platform mengerjakan ini (copy dari pola Krama):

- [ ] Buat module `nineos/` di backend platform
- [ ] `GET /nineos/health` → `{ status, platform, timestamp }`
- [ ] `GET /nineos/kpi?period=` → JSON metrik (ada blok `overview`)
- [ ] Tabel service-account untuk simpan key NineOS (`is_active` flag)
- [ ] Guard `X-NineOS-Key` di kedua endpoint
- [ ] Kasih ke kita: **BASE_URL** + **service key** + **slug** platform

> Referensi file Krama (boleh dijadikan contoh persis):
> - `src/modules/nineos/nineos.controller.ts` (health + kpi)
> - `src/common/guards/nineos-key.guard.ts` (auth X-NineOS-Key)
> - tabel `nineos_service_accounts` di `prisma/schema.prisma`

---

## Ringkasan 1 Kalimat

> "Platform cukup sediakan `GET /nineos/health` dan `GET /nineos/kpi?period=`,
> dua-duanya dijaga header `X-NineOS-Key`. Lalu kasih kita BASE_URL + key + slug."
