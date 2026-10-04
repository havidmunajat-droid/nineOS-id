'use client';
import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import api from '@/lib/api';
import { timeAgo, rupiah } from '@/lib/format';

interface Platform { id: string; slug: string; name: string; readiness_status: string; }
interface Alert { id: string; title: string; severity: string; status: string; created_at: string; }
// Bentuk KPI generik sesuai NineOS-Integration-Contract.md — blok `overview` umum,
// blok lain opsional dan spesifik platform.
interface AttentionItem { code: string; severity: 'info' | 'warning' | 'critical'; title: string; message: string; }

interface PlatformKpi {
  period?: string;
  overview?: { gmv?: number; revenue?: number; active_users?: number; new_registrations?: number };
  orders?: {
    total?: number; completed?: number; cancelled?: number; cancellation_rate?: number;
    waiting_pickup?: number; oldest_waiting_minutes?: number | null; avg_order_value?: number;
  };
  drivers?: { total_registered?: number; online_now?: number };
  merchants?: { total_registered?: number; open_now?: number };
  outlets?: { total_toko?: number; new_toko?: number };
  pelanggan?: { total?: number; new_period?: number };
  quality?: { avg_rating?: number | null; reviews?: number };
  /** Hal yang menurut platform itu sendiri perlu tindakan sekarang. */
  attention?: AttentionItem[];
}

// Susun kartu metrik dari blok yang tersedia. Urutannya disengaja: uang dulu,
// lalu volume, lalu kondisi lapangan — supaya baris pertama selalu menjawab
// "berapa yang masuk hari ini".
function kpiCards(kpi: PlatformKpi) {
  const cards: { label: string; value: string | number; sub: string }[] = [];
  const o = kpi.overview;
  if (o?.gmv !== undefined) cards.push({ label: 'GMV', value: rupiah(o.gmv), sub: 'dibayar pelanggan' });
  if (o?.revenue !== undefined) cards.push({ label: 'Revenue', value: rupiah(o.revenue), sub: 'pendapatan platform' });
  if (kpi.orders) {
    cards.push({ label: 'Order', value: kpi.orders.total ?? 0, sub: `${kpi.orders.completed ?? 0} selesai · ${kpi.orders.cancelled ?? 0} batal` });
    if (kpi.orders.avg_order_value) cards.push({ label: 'Rata-rata Order', value: rupiah(kpi.orders.avg_order_value), sub: 'per order selesai' });
  }
  if (kpi.outlets) cards.push({ label: 'Toko Terdaftar', value: kpi.outlets.total_toko ?? 0, sub: `${kpi.outlets.new_toko ?? 0} baru periode ini` });
  if (kpi.pelanggan) cards.push({ label: 'Pelanggan', value: kpi.pelanggan.total ?? 0, sub: `${kpi.pelanggan.new_period ?? 0} baru periode ini` });
  if (kpi.drivers) cards.push({ label: 'Driver Online', value: `${kpi.drivers.online_now ?? 0}/${kpi.drivers.total_registered ?? 0}`, sub: 'sedang online' });
  if (kpi.merchants) cards.push({ label: 'Merchant Buka', value: `${kpi.merchants.open_now ?? 0}/${kpi.merchants.total_registered ?? 0}`, sub: 'sedang buka' });
  if (kpi.quality?.avg_rating != null) cards.push({ label: 'Rating', value: `★ ${kpi.quality.avg_rating}`, sub: `${kpi.quality.reviews ?? 0} ulasan` });
  if (o?.active_users !== undefined) cards.push({ label: 'Pelanggan Aktif', value: o.active_users, sub: 'memesan periode ini' });
  return cards.slice(0, 10);
}

const attentionColor: Record<AttentionItem['severity'], string> = {
  critical: 'var(--status-error)',
  warning: 'var(--status-warning)',
  info: 'var(--status-info)',
};

const readinessColor: Record<string, string> = {
  ready: 'var(--status-success)', not_ready: 'var(--text-muted)', pending: 'var(--status-warning)',
};
const severityDot: Record<string, string> = {
  critical: 'var(--status-error)', warning: 'var(--status-warning)', info: 'var(--status-success)',
};

export default function DashboardPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  // Dihitung dari data penuh, BUKAN dari 6 alert yang ditampilkan di feed —
  // dulu keduanya tercampur sehingga 'Alert Pending' bisa 0 padahal ada.
  const [alertStats, setAlertStats] = useState({ pending: 0, total: 0 });
  const [kpis, setKpis] = useState<Record<string, PlatformKpi>>({});
  const [kpiLoading, setKpiLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/platforms').then(r => (Array.isArray(r.data) ? r.data : r.data.data ?? [])),
      api.get('/automation/alerts').then(r => r.data.data ?? []),
      api.get('/automation/alerts', { params: { status: 'pending' } }).then(r => r.data.data ?? []),
    ]).then(([p, a, pending]) => {
      setPlatforms(p);
      setAlerts(a.slice(0, 6));
      setAlertStats({ pending: pending.length, total: a.length });
    })
      .catch(() => {})
      .finally(() => setLoading(false));

    api.get('/platforms/kpi/all?period=today')
      .then(r => setKpis(r.data ?? {}))
      .catch(() => {})
      .finally(() => setKpiLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-6 max-w-[1116px]">
      <TopBar title="Dashboard" subtitle="Ringkasan operasional NineOS" />

      {/* Platform cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {loading
          ? [...Array(5)].map((_, i) => (
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
          { label: 'Platform Aktif', value: platforms.filter(p => p.readiness_status === 'ready').length, sub: `dari ${platforms.length || '—'} platform` },
          { label: 'Alert Pending', value: alertStats.pending, sub: 'menunggu ditinjau' },
          { label: 'Total Alert', value: alertStats.total >= 100 ? '100+' : alertStats.total, sub: 'tercatat' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <p className="text-[12px] text-[var(--text-muted)]">{s.label}</p>
            <p className="mt-1 text-[32px] font-bold text-[var(--text-primary)]">{loading ? '—' : s.value}</p>
            <p className="text-[11px] text-[var(--text-muted)]">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* KPI per platform — semua platform yang balas /nineos/kpi tampil di sini */}
      <div className="flex items-center justify-between">
        <p className="text-[16px] font-semibold text-[var(--text-primary)]">KPI Platform — Hari Ini</p>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${Object.keys(kpis).length ? 'bg-[color-mix(in_srgb,var(--status-success)_15%,transparent)] text-[var(--status-success)]' : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'}`}>
          {kpiLoading ? 'memuat...' : Object.keys(kpis).length ? `${Object.keys(kpis).length} Live` : 'Offline'}
        </span>
      </div>
      {kpiLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-xl bg-[var(--bg-surface)]" />
          ))}
        </div>
      ) : Object.keys(kpis).length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-8 text-center">
          <p className="text-[13px] text-[var(--text-muted)]">Belum ada KPI live — pastikan backend platform berjalan dan koneksinya terdaftar</p>
        </div>
      ) : (
        platforms
          .filter(p => kpis[p.slug])
          .map(p => (
            <div key={p.slug} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-success)]" />
                <p className="text-[14px] font-semibold text-[var(--text-primary)]">{p.name}</p>
              </div>
              {(kpis[p.slug].attention ?? []).length > 0 && (
                <div className="flex flex-col gap-2">
                  {kpis[p.slug].attention!.map(a => (
                    <div key={a.code} className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3" style={{ borderLeft: `3px solid ${attentionColor[a.severity] ?? "var(--border)"}` }}>
                      <div className="flex flex-col gap-0.5">
                        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{a.title}</p>
                        <p className="text-[12px] text-[var(--text-muted)]">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {kpiCards(kpis[p.slug]).map(s => (
                  <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <p className="text-[12px] text-[var(--text-muted)]">{s.label}</p>
                    <p className="mt-1 text-[24px] font-bold text-[var(--text-primary)]">{s.value}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          ))
      )}
    </div>
  );
}
