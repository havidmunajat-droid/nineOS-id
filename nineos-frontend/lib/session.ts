// Sesi login tanpa database: cookie berisi "<kedaluwarsa>.<tanda-tangan>",
// ditandatangani HMAC-SHA256 dengan NINEOS_SESSION_SECRET. Karena stateless,
// ini jalan sama persis di server Vercel maupun lokal.
//
// Sengaja pakai Web Crypto (bukan node:crypto) supaya bisa dipanggil dari
// middleware, yang berjalan di Edge runtime.

export const SESSION_COOKIE = 'nineos_session';

/** Masa berlaku sesi: 7 hari. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

/**
 * Bandingkan dua string dalam waktu tetap. Perbandingan biasa (===) berhenti
 * di karakter pertama yang berbeda, sehingga lama eksekusinya membocorkan
 * berapa banyak karakter awal yang sudah benar.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(secret: string): Promise<string> {
  const expiresAt = String(Date.now() + SESSION_TTL_MS);
  return `${expiresAt}.${await sign(secret, expiresAt)}`;
}

export async function verifySession(
  secret: string,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;

  const separator = token.indexOf('.');
  if (separator < 1) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  // Cek tanda tangan DULU, baru kedaluwarsa — supaya nilai kedaluwarsa
  // yang belum terbukti asli tidak dipakai untuk apa pun.
  if (!safeEqual(signature, await sign(secret, expiresAt))) return false;

  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}
