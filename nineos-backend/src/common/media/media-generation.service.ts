import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { StorageService } from '../storage/storage.service';

export interface MediaGenResult {
  status: 'completed' | 'processing' | 'failed';
  mediaType: 'image' | 'video';
  mediaUrl?: string;
  jobId?: string;
  provider: string;
  error?: string;
}

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
// Model bisa di-override via env (default: varian fast paling hemat)
const IMAGEN_MODEL = process.env.IMAGEN_MODEL ?? 'imagen-4.0-fast-generate-001';
const VEO_MODEL = process.env.VEO_MODEL ?? 'veo-3.0-fast-generate-001';

interface ImagenResponse {
  predictions?: { bytesBase64Encoded: string; mimeType?: string }[];
  error?: { message?: string };
}

interface GeminiOperation {
  name?: string;
  done?: boolean;
  response?: unknown;
  error?: { message?: string };
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

  constructor(private readonly storage: StorageService) {}

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
   * jobId = nama operation Google (mis. "models/veo-.../operations/abc").
   */
  async getStatus(jobId: string): Promise<MediaGenResult> {
    const provider = this.activeProvider;
    if (provider !== 'google') {
      return { status: 'completed', mediaType: 'video', jobId, provider };
    }
    try {
      const key = process.env.GEMINI_API_KEY!;
      const res = await fetch(`${GEMINI_API}/${jobId}?key=${key}`);
      const data = (await res.json()) as GeminiOperation;
      if (!data.done) return { status: 'processing', mediaType: 'video', jobId, provider };

      const uri = this.extractVeoUri(data);
      if (!uri) return { status: 'failed', mediaType: 'video', jobId, provider, error: 'Video URI tidak ditemukan di response' };

      // File Veo perlu API key untuk diunduh → simpan ke storage kita
      const mediaUrl = await this.storage.saveFromUrl(`${uri}&key=${key}`, 'mp4');
      return { status: 'completed', mediaType: 'video', mediaUrl, provider };
    } catch (err) {
      return { status: 'failed', mediaType: 'video', jobId, provider, error: err instanceof Error ? err.message : 'unknown' };
    }
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

  // ── Google Veo/Imagen ───────────────────────────────────────────
  // Imagen: synchronous (base64) → simpan ke storage → URL publik.
  // Veo: long-running operation → return { processing, jobId }, poll via getStatus().
  // Catatan: generate media butuh BILLING Google aktif (ai.dev/projects).
  private async generateGoogle(prompt: string, mediaType: 'image' | 'video'): Promise<MediaGenResult> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { status: 'failed', mediaType, provider: 'google', error: 'GEMINI_API_KEY kosong' };

    if (mediaType === 'image') {
      const res = await fetch(`${GEMINI_API}/models/${IMAGEN_MODEL}:predict?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: '1:1' },
        }),
      });
      const data = (await res.json()) as ImagenResponse;
      if (!res.ok || !data.predictions?.length) {
        const msg = data.error?.message ?? `HTTP ${res.status}`;
        return { status: 'failed', mediaType, provider: 'google', error: msg };
      }
      const b64 = data.predictions[0].bytesBase64Encoded;
      const mediaUrl = await this.storage.saveBase64(b64, 'png');
      return { status: 'completed', mediaType, mediaUrl, provider: 'google' };
    }

    // Video → Veo (long-running)
    const res = await fetch(`${GEMINI_API}/models/${VEO_MODEL}:predictLongRunning?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt }] }),
    });
    const data = (await res.json()) as GeminiOperation;
    if (!res.ok || !data.name) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      return { status: 'failed', mediaType, provider: 'google', error: msg };
    }
    // Async: kembalikan operation name sebagai jobId; UI/SocialService poll getStatus()
    return { status: 'processing', mediaType, jobId: data.name, provider: 'google' };
  }

  /** Ambil URI video dari response operation Veo (struktur bisa beragam antar versi). */
  private extractVeoUri(op: GeminiOperation): string | null {
    const resp = op.response as Record<string, unknown> | undefined;
    if (!resp) return null;
    // Bentuk umum: response.generateVideoResponse.generatedSamples[0].video.uri
    const gv = resp['generateVideoResponse'] as Record<string, unknown> | undefined;
    const samples = (gv?.['generatedSamples'] ?? gv?.['generatedVideos']) as Array<Record<string, unknown>> | undefined;
    const video = samples?.[0]?.['video'] as Record<string, unknown> | undefined;
    return (video?.['uri'] as string) ?? null;
  }

  // ── Bytedance Seedream/Seedance (colok masa depan) ──────────────
  private async generateBytedance(prompt: string, mediaType: 'image' | 'video'): Promise<MediaGenResult> {
    this.logger.warn('Provider bytedance belum diimplementasi — fallback mock');
    return this.generateMock(prompt, mediaType);
  }
}
