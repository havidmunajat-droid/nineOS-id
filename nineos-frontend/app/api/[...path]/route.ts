import { NextRequest } from 'next/server';

// Proxy BFF: browser memanggil /api/... di origin Vercel, route handler ini
// yang meneruskan ke backend NineOS sambil MENAMBAHKAN gateway token.
//
// Kenapa ada: sebelumnya token dikirim lewat NEXT_PUBLIC_GATEWAY_TOKEN, dan
// semua var NEXT_PUBLIC_* ikut ter-bundle ke browser. Begitu dashboard live,
// siapa pun bisa ambil token itu dari devtools lalu memanggil API langsung —
// membaca KPI bisnis, menyetujui aksi agent, sampai menghabiskan kuota AI.
// Dengan proxy ini token tidak pernah meninggalkan server.

// Giliran agentic bisa lama (loop tool + retry kuota Gemini bisa 42 dtk).
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BACKEND_URL =
  process.env.NINEOS_API_URL ?? 'http://localhost:3000/api/v1';
const GATEWAY_TOKEN = process.env.NINEOS_GATEWAY_TOKEN ?? '';

// Header dari browser yang TIDAK boleh diteruskan apa adanya.
const STRIPPED = new Set([
  'host',
  'connection',
  'content-length',
  'authorization',
  'cookie',
  'accept-encoding',
]);

async function proxy(req: NextRequest, path: string[]) {
  if (!GATEWAY_TOKEN) {
    return Response.json(
      {
        error:
          'NINEOS_GATEWAY_TOKEN belum diset di environment frontend. Dashboard tidak bisa memanggil backend.',
      },
      { status: 500 },
    );
  }

  const search = req.nextUrl.search;
  const target = `${BACKEND_URL}/${path.join('/')}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIPPED.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set('Authorization', `Bearer ${GATEWAY_TOKEN}`);

  const hasBody = !['GET', 'HEAD'].includes(req.method);

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      cache: 'no-store',
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type':
          upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    // Backend mati / URL salah / timeout — jangan bocorkan target internal.
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: 'Backend NineOS tidak dapat dihubungi', detail: message },
      { status: 502 },
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
