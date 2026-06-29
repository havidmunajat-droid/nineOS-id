import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Penyimpanan media hasil generate → URL publik.
 *
 * Implementasi sekarang: LOCAL DISK (cukup untuk dev & single-server).
 * Hasil disimpan di `public/generated/` dan disajikan statis di `/static/...`
 * (lihat main.ts → useStaticAssets).
 *
 * Untuk produksi/scale: ganti saveBase64() ke S3/Cloudinary tanpa ubah pemanggil.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly dir = join(process.cwd(), 'public', 'generated');

  /** Base URL publik backend (untuk membentuk URL absolut media). */
  private get baseUrl(): string {
    return (process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '');
  }

  /** Simpan data base64 → return URL publik. */
  async saveBase64(base64: string, ext: string): Promise<string> {
    await fs.mkdir(this.dir, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(join(this.dir, filename), Buffer.from(base64, 'base64'));
    return `${this.baseUrl}/static/generated/${filename}`;
  }

  /** Simpan dari URL sumber (mis. file Veo) → unduh → simpan lokal → URL publik. */
  async saveFromUrl(sourceUrl: string, ext: string, headers?: Record<string, string>): Promise<string> {
    const res = await fetch(sourceUrl, { headers });
    if (!res.ok) throw new Error(`Gagal unduh media: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(this.dir, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(join(this.dir, filename), buf);
    return `${this.baseUrl}/static/generated/${filename}`;
  }
}
