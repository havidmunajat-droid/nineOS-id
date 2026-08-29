'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Gagal masuk');
        setPassword('');
        return;
      }
      // replace() supaya halaman login tidak tersimpan di riwayat browser.
      router.replace(params.get('next') ?? '/');
      router.refresh();
    } catch {
      setError('Tidak bisa menghubungi server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <form
        onSubmit={submit}
        className="w-full max-w-[360px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-8"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-red)]" />
          <h1 className="text-[17px] font-semibold text-[var(--text-primary)]">NineOS</h1>
        </div>
        <p className="mb-6 text-[13px] text-[var(--text-muted)]">
          Dashboard internal. Masukkan password untuk lanjut.
        </p>

        <label htmlFor="password" className="mb-1.5 block text-[13px] text-[var(--text-muted)]">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-3 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--brand-red)]"
        />

        {error && (
          <p className="mb-4 text-[13px] text-[var(--status-error)]" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="h-10 w-full rounded-md bg-[var(--brand-red)] text-[14px] font-semibold text-white transition-colors hover:bg-[var(--brand-red-hover)] disabled:opacity-40"
        >
          {loading ? 'Memeriksa…' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
