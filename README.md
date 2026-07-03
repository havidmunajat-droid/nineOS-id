# NineOS

Central dashboard untuk 4 platform (**Matcha, NotaBe, Krama, Nine Studio**) — satu tempat untuk KPI, HelpDesk, Social Media, Automation, dan Virtual Office AI.

```
Frontend (Next.js 15) → Backend / API Gateway (NestJS + PostgreSQL) → Automation Engine (n8n)
                                                                              │
                                                                 AI · WhatsApp · Email · Sosmed
```

## Struktur Repo

| Folder / File | Isi |
|---|---|
| `nineos-backend/` | NestJS API Gateway — 5 modul, 24 tabel (Prisma), Swagger di `/api/docs` |
| `nineos-frontend/` | Next.js 15 dashboard — dark theme merah-hitam |
| `docker-compose.yml` | PostgreSQL lokal |
| `render.yaml` / `railway.json` / `vercel.json` | Config deploy |

## Dokumentasi

**Mulai dari sini:** [NineOS-00-Master-Index.md](NineOS-00-Master-Index.md) — peta modul, konvensi teknis, inventaris tabel.

| Dokumen | Isi |
|---|---|
| [NineOS-Status-Progress.md](NineOS-Status-Progress.md) | Status terkini + checklist "tinggal colok" |
| [CATATAN-SESI.md](CATATAN-SESI.md) | Catatan sesi kerja & arahan founder terbaru |
| [NineOS-Integration-Contract.md](NineOS-Integration-Contract.md) | Kontrak colok platform baru (2 endpoint + X-NineOS-Key) |
| [NineOS-Architecture-Decision.md](NineOS-Architecture-Decision.md) | ADR: NineOS otak, n8n tangan · AI teks vs media dipisah |
| [NineOS-Deployment-Guide.md](NineOS-Deployment-Guide.md) | Guide deploy + estimasi biaya |
| `NineOS-Modul1..5-*.md` | Spesifikasi teknis per modul (schema, API, payload) |

## Jalankan Lokal

```bash
# Backend (port 3000)
cd nineos-backend && npm run start:dev

# Frontend (port 3100 — hindari bentrok dgn backend Krama di 3001)
cd nineos-frontend && npm run dev -- -p 3100
```

- Frontend: http://localhost:3100
- API: http://localhost:3000/api/v1 (health check di root path)
- Swagger: http://localhost:3000/api/docs

Env vars: lihat `nineos-backend/.env` (jangan commit) — daftar lengkap di [NineOS-Status-Progress.md](NineOS-Status-Progress.md).
