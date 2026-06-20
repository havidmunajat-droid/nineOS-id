'use client';
import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import api from '@/lib/api';

interface Platform { id: string; slug: string; name: string; readiness_status: string; }
interface Alert { id: string; title: string; severity: string; status: string; created_at: string; }
interface KramaKpi {
  period: string;
  orders: { total: number; pending: number; completed: number; revenue: number };
  drivers: { total: number; online: number };
  merchants: { total: number; open: number };
  products: { total: number };
  walletBalance: number;
}

const readinessColor: Record<string, string> = {
  ready: 'var(--status-success)', not_ready: 'var(--text-muted)', pending: 'var(--status-warning)',
};
const severityDot: Record<string, string> = {
  critical: 'var(--status-error)', warning: 'var(--status-warning)', info: 'var(--status-success)',
};

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs} jam lalu` : `${Math.floor(hrs / 24)} hari lalu`;
}

function rupiah(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

export default function DashboardPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [kramaKpi, setKramaKpi] = useState<KramaKpi | null>(null);
  const [kramaLoading, setKramaLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/platforms').then(r => r.data.data ?? []),
      api.get('/automation/alerts').then(r => r.data.data ?? []),
    ]).then(([p, a]) => { setPlatforms(p); setAlerts(a.slice(0, 6)); })
      .catch(() => {})
      .finally(() => setLoading(false));

    api.get('/platforms/krama/kpi?period=today')
      .then(r => setKramaKpi(r.data))
      .catch(() => {})
      .finally(() => setKramaLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-6 max-w-[1116px]">
      <TopBar title="Dashboard" subtitle="Ringkasan operasional NineOS" />

      {/* Platform cards */}
      <div className="grid grid-cols-4 gap-4">
        {loading
          ? [...Array(4)].map((_, i) => (
              <div key={i} className="h-[112px] animate-pulse rounded-xl bg-[var(--bg-surface)]" />
            ))
          : platforms.map(p => (
              <div key={p.slug} className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-[18px]">
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">{p.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: readinessColor[p.readiness_status] }} />
                  <span className="text-[12px] font-medium" style={{ color: readinessColor[p.readiness_status] }}>
                    {p.readiness_status === 'ready' ? 'Connected' : 'Not ready'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {p.readiness_status === 'ready' ? 'Platform siap' : 'Integrasi menyusul'}
                </p>
              </div>
            ))}
      </div>

      {/* Recent Activity */}
      <p className="text-[16px] font-semibold text-[var(--text-primary)]">Aktivitas Terbaru</p>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
        {!loading && alerts.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[var(--text-muted)]">Belum ada aktivitas</p>
        ) : (
          alerts.map((a, i) => (
            <div key={a.id}>
              <div className="flex items-center justify-between px-5 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: severityDot[a.severity] ?? 'var(--text-muted)' }} />
                  <span className="text-[13px] text-[var(--text-primary)]">{a.title}</span>
                </div>
                <span className="ml-4 shrink-0 text-[12px] text-[var(--text-muted)]">{timeAgo(a.created_at)}</span>
              </div>
              {i < alerts.length - 1 && <div className="mx-5 h-px bg-[var(--border)]" />}
            </div>
          ))
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Platform Aktif', value: platforms.filter(p => p.readiness_status === 'ready').length, sub: 'dari 4 platform' },
          { label: 'Alert Pending', value: alerts.filter(a => a.status === 'pending').length, sub: 'menunggu dikirim' },
          { label: 'Total Alert', value: alerts.length, sub: 'tercatat' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <p className="text-[12px] text-[var(--text-muted)]">{s.label}</p>
            <p className="mt-1 text-[32px] font-bold text-[var(--text-primary)]">{loading ? '—' : s.value}</p>
            <p className="text-[11px] text-[var(--text-muted)]">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Krama KPI */}
      <div className="flex items-center justify-between">
        <p className="text-[16px] font-semibold text-[var(--text-primary)]">Krama Platform — KPI Hari Ini</p>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${kramaKpi ? 'bg-[color-mix(in_srgb,var(--status-success)_15%,transparent)] text-[var(--status-success)]' : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'}`}>
          {kramaLoading ? 'memuat...' : kramaKpi ? 'Live' : 'Offline'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Total Order', value: kramaLoading ? null : kramaKpi?.orders.total ?? '—', sub: `${kramaKpi?.orders.completed ?? 0} selesai` },
          { label: 'Revenue', value: kramaLoading ? null : kramaKpi ? rupiah(kramaKpi.orders.revenue) : '—', sub: 'hari ini' },
          { label: 'Driver Online', value: kramaLoading ? null : kramaKpi ? `${kramaKpi.drivers.online}/${kramaKpi.drivers.total}` : '—', sub: 'aktif bertugas' },
          { label: 'Merchant Buka', value: kramaLoading ? null : kramaKpi ? `${kramaKpi.merchants.open}/${kramaKpi.merchants.total}` : '—', sub: 'sedang buka' },
          { label: 'Produk', value: kramaLoading ? null : kramaKpi?.products.total ?? '—', sub: 'SKU terdaftar' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <p className="text-[12px] text-[var(--text-muted)]">{s.label}</p>
            <p className="mt-1 text-[24px] font-bold text-[var(--text-primary)]">{s.value === null ? '—' : s.value}</p>
            <p className="text-[11px] text-[var(--text-muted)]">{s.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
