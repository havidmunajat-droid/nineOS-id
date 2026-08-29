import { NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  safeEqual,
} from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const password = process.env.NINEOS_PASSWORD;
  const secret = process.env.NINEOS_SESSION_SECRET;

  if (!password || !secret) {
    return Response.json(
      { error: 'NINEOS_PASSWORD atau NINEOS_SESSION_SECRET belum diset di environment.' },
      { status: 500 },
    );
  }

  let submitted = '';
  try {
    submitted = ((await req.json()) as { password?: string }).password ?? '';
  } catch {
    return Response.json({ error: 'Body harus JSON' }, { status: 400 });
  }

  if (!safeEqual(submitted, password)) {
    // Sengaja tidak membedakan "password kosong" dan "password salah".
    return Response.json({ error: 'Password salah' }, { status: 401 });
  }

  const response = Response.json({ ok: true });
  response.headers.set(
    'Set-Cookie',
    [
      `${SESSION_COOKIE}=${await createSession(secret)}`,
      'Path=/',
      // httpOnly: tidak bisa dibaca JavaScript, jadi kebal pencurian lewat XSS.
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
      ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
    ].join('; '),
  );
  return response;
}
