# 📋 Prompt Siap Pakai — Sesi Integrasi Platform ke NineOS

> Copy-paste prompt di bawah ke sesi Claude di masing-masing repo platform.
> Referensi kontrak: `C:\Users\ulwan\nineOS-id\NineOS-Integration-Contract.md`
> Contoh implementasi jadi: Krama (`C:\Users\ulwan\krama-platform\backend\krama-api\src\modules\nineos\`)

---

## 1️⃣ Sesi Matcha (`C:\Users\ulwan\matcha-id`)

```
Buatkan module integrasi NineOS di backend Matcha, ikuti kontrak di
C:\Users\ulwan\nineOS-id\NineOS-Integration-Contract.md
(contoh implementasi nyata: C:\Users\ulwan\krama-platform\backend\krama-api\src\modules\nineos\).

Yang dibutuhkan:
1. GET {BASE_URL}/nineos/health → { "status": "ok", "platform": "matcha", "timestamp": ISO }
2. GET {BASE_URL}/nineos/kpi?period=today|week|month → JSON metrik dengan blok "overview"
   berisi minimal: gmv, revenue, active_users, new_registrations (isi 0 kalau belum ada
   datanya, mis. revenue sebelum payment gateway aktif). Boleh tambah blok lain yang
   spesifik Matcha (mis. assessments, candidates, companies).
3. Kedua endpoint dijaga guard header X-NineOS-Key — key disimpan di tabel/config
   service-account dengan flag is_active (jangan hardcode). Key tidak valid → 401.
4. Sesuaikan implementasi dengan stack backend project ini.

Slug platform: "matcha".
Di akhir sesi, berikan saya: BASE_URL lokal (termasuk global prefix kalau ada),
service key yang digenerate, dan cara menjalankan backendnya — akan saya colok ke NineOS.
```

---

## 2️⃣ Sesi NotaBe (`C:\Users\ulwan\notabe` / repo NotaBe)

```
Buatkan integrasi NineOS untuk NotaBe, ikuti kontrak di
C:\Users\ulwan\nineOS-id\NineOS-Integration-Contract.md
(contoh implementasi nyata di NestJS: C:\Users\ulwan\krama-platform\backend\krama-api\src\modules\nineos\).

Yang dibutuhkan:
1. GET {BASE_URL}/nineos/health → { "status": "ok", "platform": "notabe", "timestamp": ISO }
2. GET {BASE_URL}/nineos/kpi?period=today|week|month → JSON metrik dengan blok "overview"
   berisi minimal: gmv, revenue, active_users, new_registrations (isi 0 kalau belum ada).
   Tambah blok spesifik NotaBe yang relevan (mis. orders/transaksi laundry, outlets).
3. Kedua endpoint dijaga validasi header X-NineOS-Key (key disimpan aman, bukan hardcode;
   tidak valid → 401).
4. PENTING: NotaBe pakai Supabase — implementasikan endpoint ini sebagai Supabase Edge
   Function (atau API layer lain yang sudah ada di project). Sesuaikan dengan struktur project.

Slug platform: "notabe".
Di akhir sesi, berikan saya: BASE_URL endpoint tersebut, service key yang digenerate,
dan cara test — akan saya colok ke NineOS.
```

---

## 3️⃣ Sesi nineClip (`C:\Users\ulwan\nineClip`)

```
Buatkan module integrasi NineOS di backend nineClip, ikuti kontrak di
C:\Users\ulwan\nineOS-id\NineOS-Integration-Contract.md
(contoh implementasi nyata: C:\Users\ulwan\krama-platform\backend\krama-api\src\modules\nineos\).

Yang dibutuhkan:
1. GET {BASE_URL}/nineos/health → { "status": "ok", "platform": "nineclip", "timestamp": ISO }
2. GET {BASE_URL}/nineos/kpi?period=today|week|month → JSON metrik dengan blok "overview"
   berisi minimal: gmv, revenue, active_users, new_registrations (isi 0 kalau belum ada,
   mis. revenue sebelum billing aktif). Tambah blok spesifik nineClip yang relevan
   (mis. clips: total generate, jobs sukses/gagal, menit video diproses).
3. Kedua endpoint dijaga guard header X-NineOS-Key — key di tabel service-account
   dengan flag is_active (jangan hardcode). Key tidak valid → 401.
4. Sesuaikan dengan stack backend nineClip yang sudah ada.

Slug platform: "nineclip".
Di akhir sesi, berikan saya: BASE_URL lokal (termasuk prefix kalau ada), service key
yang digenerate, dan port backendnya — akan saya colok ke NineOS.
```

---

## Setelah 3 Sesi Selesai — Kembali ke Sesi NineOS

Bawa hasil tiap platform (BASE_URL + key + slug), lalu di sesi NineOS cukup bilang:

```
Colok platform <nama>: BASE_URL=<url>, key=<key>
```

NineOS side sudah generalisasi — tidak perlu ubah kode, cukup:
- Dev cepat: tambah env `{SLUG}_API_URL` + `{SLUG}_NINEOS_KEY` di `nineos-backend/.env`
- Atau permanen: daftarkan via `PUT /api/v1/platforms/:slug/connection` (key terenkripsi)

Kartu KPI platform otomatis muncul di dashboard begitu endpoint-nya balas.
