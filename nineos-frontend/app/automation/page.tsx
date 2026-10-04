'use client';
import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import api from '@/lib/api';

interface Pipeline {
  id: string; name: string; pipeline_type: string; status: string;
  last_run_at?: string; last_run_status?: string;
  platform?: { name: string };
}
interface Alert {
  id: string; title: string; message: string; severity: string;
  status: string; created_at: string;
  platform?: { name: string };
}

const pipelineStatus: Record<string, string> = {
  active: 'text-[var(--status-success)] bg-green-500/10',
  paused: 'text-[var(--status-warning)] bg-yellow-500/10',
  error: 'text-[var(--status-error)] bg-red-500/10',
  inactive: 'text-[var(--text-muted)] bg-white/5',
};

const alertSeverity: Record<string, string> = {
  critical: 'text-[var(--status-error)]',
  warning: 'text-[var(--status-warning)]',
  info: 'text-[var(--status-info)]',
};
const severityDot: Record<string, string> = {
  critical: 'var(--status-error)',
  warning: 'var(--status-warning)',
  info: 'var(--status-info)',
};

export default function AutomationPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  // Diambil terpisah dengan status=pending. Daftar "semua" hanya memuat 100
  // alert terbaru, sehingga alert pending yang lama (mis. NotaBe September)
  // tidak pernah tampil dan tidak pernah bisa ditutup.
  const [pending, setPending] = useState<Alert[]>([]);
  const [view, setView] = useState<'pending' | 'all'>('pending');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/automation/pipelines').then(r => r.data.data ?? []).catch(() => []),
      api.get('/automation/alerts').then(r => r.data.data ?? []).catch(() => []),
      api.get('/automation/alerts', { params: { status: 'pending' } }).then(r => r.data.data ?? []).catch(() => []),
    ]).then(([p, a, pend]) => {
      setPipelines(p);
      setAlerts(a);
      setPending(pend);
    }).finally(() => setLoading(false));
  }, []);

  const markResolved = (ids: string[]) => {
    const done = new Set(ids);
    setPending(prev => prev.filter(a => !done.has(a.id)));
    setAlerts(prev => prev.map(a => (done.has(a.id) ? { ...a, status: 'resolved' } : a)));
  };

  const resolveOne = async (id: string) => {
    setError('');
    setBusy(prev => new Set(prev).add(id));
    try {
      await api.patch(`/automation/alerts/${id}/resolve`);
      markResolved([id]);
    } catch {
      setError('Alert gagal ditutup. Coba lagi.');
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const resolveAll = async () => {
    if (pending.length === 0) return;
    if (!window.confirm(`Tandai ${pending.length} alert sebagai sudah ditangani?`)) return;
    setError('');
    const ids = pending.map(a => a.id);
    setBusy(new Set(ids));
    try {
      await api.patch('/automation/alerts/resolve', { ids });
      markResolved(ids);
    } catch {
      setError('Sebagian alert gagal ditutup. Muat ulang halaman lalu coba lagi.');
    } finally {
      setBusy(new Set());
    }
  };

  const shown = view === 'pending' ? pending : alerts.slice(0, 20);

  const fmt = (iso?: string) => {
    if (!iso) return 'Belum berjalan';
    return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1116px]">
      <TopBar title="Automation" subtitle="Pipeline & monitoring otomatisasi" />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Pipeline', value: pipelines.length },
          { label: 'Aktif', value: pipelines.filter(p => p.status === 'active').length },
          { label: 'Perlu Ditinjau', value: pending.length },
          { label: 'Critical Terbuka', value: pending.filter(a => a.severity === 'critical').length },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <p className="text-[12px] text-[var(--text-muted)]">{s.label}</p>
            <p className="mt-1 text-[28px] font-bold text-[var(--text-primary)]">{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Pipelines */}
        <div className="flex flex-col gap-3">
          <p className="text-[16px] font-semibold text-[var(--text-primary)]">Pipeline</p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="h-[64px] animate-pulse border-b border-[var(--border)] mx-4 my-2 rounded-lg bg-white/5" />
              ))
            ) : pipelines.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-[var(--text-muted)]">Belum ada pipeline</p>
            ) : (
              pipelines.map((p, i) => (
                <div
                  key={p.id}
                  className={`px-4 py-3.5 ${i < pipelines.length - 1 ? 'border-b border-[var(--border)]' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-[var(--text-primary)]">{p.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {p.pipeline_type} · {p.platform?.name ?? 'Global'}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pipelineStatus[p.status] ?? ''}`}>
                      {p.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                    Run terakhir: {fmt(p.last_run_at)}
                    {p.last_run_status ? ` · ${p.last_run_status}` : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Alerts */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] p-1">
              {([
                ['pending', `Perlu ditinjau${loading ? '' : ` (${pending.length})`}`],
                ['all', 'Semua'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    view === key
                      ? 'bg-[var(--brand-red-subtle)] text-[var(--brand-red)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {view === 'pending' && pending.length > 1 && (
              <button
                type="button"
                onClick={resolveAll}
                disabled={busy.size > 0}
                className="text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                Tutup semua
              </button>
            )}
          </div>

          {error && (
            <p className="text-[12px] text-[var(--status-error)]" role="alert">{error}</p>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="h-[64px] animate-pulse border-b border-[var(--border)] mx-4 my-2 rounded-lg bg-white/5" />
              ))
            ) : shown.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-[var(--text-muted)]">
                {view === 'pending' ? 'Semua alert sudah ditangani' : 'Tidak ada alert'}
              </p>
            ) : (
              shown.map((a, i) => (
                <div
                  key={a.id}
                  className={`px-4 py-3.5 ${i < shown.length - 1 ? 'border-b border-[var(--border)]' : ''} ${a.status === 'resolved' ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: severityDot[a.severity] ?? 'var(--text-muted)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{a.title}</p>
                        <span className={`shrink-0 text-[11px] font-medium ${alertSeverity[a.severity] ?? ''}`}>
                          {a.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-3">{a.message}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {fmt(a.created_at)}{a.status === 'resolved' ? ' · sudah ditangani' : ''}
                        </span>
                        {a.status !== 'resolved' && (
                          <button
                            type="button"
                            onClick={() => resolveOne(a.id)}
                            disabled={busy.has(a.id)}
                            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--status-success)] hover:text-[var(--status-success)] disabled:opacity-40"
                          >
                            {busy.has(a.id) ? 'Menutup…' : 'Selesai'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
