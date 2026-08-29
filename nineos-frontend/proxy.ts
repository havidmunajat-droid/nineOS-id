import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

// Gerbang login untuk SELURUH dashboard, termasuk BFF di app/api/[...path].
//
// BFF menambahkan gateway token untuk setiap pemanggil, jadi tanpa
// gerbang ini siapa pun yang tahu URL Vercel bisa membaca KPI bisnis Matcha
// dan NotaBe. Berkas ini yang menutupnya.

export const config = {
  // Lewati aset statis; sisanya wajib punya sesi.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)'],
};

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const secret = process.env.NINEOS_SESSION_SECRET;
  if (!secret) {
    // Gagal TERTUTUP, bukan terbuka: kalau secret belum diset, tolak semua.
    // Salah konfigurasi tidak boleh berujung dashboard terbuka ke publik.
    return NextResponse.json(
      { error: 'NINEOS_SESSION_SECRET belum diset di environment frontend.' },
      { status: 500 },
    );
  }

  if (await verifySession(secret, req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // Panggilan API dapat 401 supaya axios di frontend bisa menanganinya;
  // kunjungan halaman dialihkan ke form login.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (pathname !== '/') url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}
