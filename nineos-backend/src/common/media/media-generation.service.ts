import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface MediaGenResult {
  status: 'completed' | 'processing' | 'failed';
  mediaType: 'image' | 'video';
  mediaUrl?: string;
  jobId?: string;
  provider: string;
  error?: string;
}

/**
 * Layanan generate media (gambar/video) — provider-agnostic.
 *
 * Pola sama dengan AIService (teks): otak tetap di NineOS (ADR-001),
 * provider tinggal di-switch lewat env MEDIA_PROVIDER:
 *   - 'google'    → Veo (video) / Imagen (gambar) via Gemini API
 *   - 'bytedance' → Seedream/Seedance (colok nanti)
 *   - 'mock'      → placeholder, untuk dev/test tanpa biaya (default)
 *
 * Caption tetap di AIService. Service ini KHUSUS media.
 */
@Injectable()
export class MediaGenerationService {
  private readonly logger = new Logger(MediaGenerationService.name);

  get activeProvider(): string {
    const p = (process.env.MEDIA_PROVIDER ?? '').toLowerCase();
    if (p === 'google' && process.env.GEMINI_API_KEY) return 'google';
    if (p === 'bytedance' && process.env.BYTEPLUS_API_KEY) return 'bytedance';
    // Default aman: mock (tidak ada biaya, alur tetap jalan)
    return 'mock';
  }

  /** Generate gambar dari prompt. */
  async generateImage(prompt: string): Promise<MediaGenResult> {
    return this.generate(prompt, 'image');
  }

  /** Generate video dari prompt (bisa async → status 'processing' + jobId). */
  async generateVideo(prompt: string): Promise<MediaGenResult> {
    return this.generate(prompt, 'video');
  }

  private async generate(
    prompt: string,
    mediaType: 'image' | 'video',
  ): Promise<MediaGenResult> {
    const provider = this.activeProvider;
    try {
      switch (provider) {
        case 'google':
          return await this.generateGoogle(prompt, mediaType);
        case 'bytedance':
          return await this.generateBytedance(prompt, mediaType);
        default:
          return this.generateMock(prompt, mediaType);
      }
    } catch (err) {
      this.logger.warn(`Media gen (${provider}) gagal: ${err instanceof Error ? err.message : err}`);
      return { status: 'failed', mediaType, provider, error: err instanceof Error ? err.message : 'unknown' };
    }
  }

  /**
   * Cek status job async (untuk video Veo yang long-running).
   * Mock & gambar biasanya langsung 'completed', jadi ini untuk provider nyata.
   */
  async getStatus(jobId: string): Promise<MediaGenResult> {
    const provider = this.activeProvider;
    // TODO(google): poll operations.get(jobId) → ambil video URI saat selesai
    return { status: 'processing', mediaType: 'video', jobId, provider };
  }

  // ── Mock provider (default, gratis) ─────────────────────────────
  // Mengembalikan placeholder deterministik agar preview & posting bisa dites.
  private generateMock(prompt: string, mediaType: 'image' | 'video'): MediaGenResult {
    const seed = createHash('md5').update(prompt).digest('hex').slice(0, 12);
    const mediaUrl =
      mediaType === 'image'
        ? `https://picsum.photos/seed/${seed}/1080/1080`
        : `https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`;
    return { status: 'completed', mediaType, mediaUrl, provider: 'mock' };
  }

  // ── Google Veo/Imagen (colok berikutnya) ────────────────────────
  // Imagen: synchronous (base64) → perlu upload ke storage → URL publik.
  // Veo: long-running operation → return { processing, jobId }, poll via getStatus().
  private async generateGoogle(prompt: string, mediaType: 'image' | 'video'): Promise<MediaGenResult> {
    // TODO: implementasi nyata butuh:
    //   1. Akses & billing Veo/Imagen aktif
    //   2. Storage (S3/Cloudinary) untuk host hasil → URL publik
    // Selama belum siap, fallback ke mock supaya alur tetap jalan.
    this.logger.warn('Provider google belum diimplementasi penuh (butuh billing + storage) — fallback mock');
    return this.generateMock(prompt, mediaType);
  }

  // ── Bytedance Seedream/Seedance (colok masa depan) ──────────────
  private async generateBytedance(prompt: string, mediaType: 'image' | 'video'): Promise<MediaGenResult> {
    this.logger.warn('Provider bytedance belum diimplementasi — fallback mock');
    return this.generateMock(prompt, mediaType);
  }
}
