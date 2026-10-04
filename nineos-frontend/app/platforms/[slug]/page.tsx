'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import TopBar from '@/components/TopBar';
import api from '@/lib/api';
import { rupiah, timeAgo } from '@/lib/format';
import { kpiCards, attentionColor, type PlatformKpi } from '@/lib/kpi';

interface Platform {
  slug: string;
  name: string;
  description: string | null;
  readiness_status: string;
  connection: { status: string; last_checked_at: string | null } | null;
}
interface Snapshot { gmv: number | null; captured_at: string; }
interface Alert { id: string; title: string; message: string; severity: string; status: string; created_at: string; }

/** Blok tambahan yang hanya dikirim sebagian platform (saat ini Krama). */
type KpiDetail = PlatformKpi & {
  window?: { label?: string };
  orders?: PlatformKpi['orders'] & { by_vertical?: Record<string, number>; by_payment?: Record<string, number> };
  finance?: {
    platform_fee?: number; service_fee?: number; subsidy_given?: number;
    withdrawals_pending?: { count: number; amount: number };
    top_ups_paid?: { count: number; amount: number };
    saldo_top_ups?: { count: number; amount: number };
    revenue_breakdown?: Record<string, { count: number; amount: number }>;
  };
  poin?: { terpakai_untuk_order?: number; diberikan_gratis?: number; saldo_beredar?: number };
};

const BREAKDOWN_LABEL: Record<string, string> = {
  poin_dibeli_midtrans: 'Beli poin (Midtrans)',
  poin_dari_saldo_dompet: 'Tukar saldo jadi poin',
  fee_dipotong_dari_saldo: 'Fee dari saldo (poin habis)',
};

function MoneyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-bold text-[var(--status-success)]' : 'font-medium text-[var(--text-primary)]'}`}>{value}</dd>
    </div>
  );
}

type Period = 'today' | 'week' | 'month';
const PERIODS: Array<[Period, string]> = [['today', 'Hari ini'], ['week', '7 hari'], ['month', '30 hari']];

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  ready: { text: 'Live', color: 'var(--status-success)' },
  not_ready: { text: 'Dalam pembangunan', color: 'var(--text-muted)' },
  partial: { text: 'Sebagian', color: 'var(--status-warning)' },
  archived: { text: 'Diarsipkan', color: 'var(--text-muted)' },
};

const severityDot: Record<string, string> = {
  critical: 'var(--status-error)', warning: 'var(--status-warning)', info: 'var(--status-info)',
};

const jakartaDate = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' }).format(new Date(iso));

/**
 * Total harian dari snapshot kumulatif per jam.
 *
 * Tiap platform berganti hari pada jamnya sendiri (NotaBe 00:00 UTC = 07:00
 * WIB, Krama tengah malam WIB). Jam itu DIPELAJARI dari data: jam UTC yang
 * paling sering menjadi titik nilai turun. Lalu snapshot dikelompokkan per
 * siklus tersebut, dan total sehari = nilai tertinggi dalam siklusnya.
 *
 * Versi pertama memotong deret hanya saat nilai turun. Itu keliru: hari sepi
 * (GMV tetap 0 → 0) tidak pernah "turun", sehingga tergabung dengan hari
 * berikutnya dan tanggalnya bergeser. Terbukti di data NotaBe 21–26 Sep.
 */
function dailyTotals(snapshots: Snapshot[]) {
  const points = snapshots
    .filter((s) => s.gmv != null)
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  if (points.length === 0) return [];

  const dropHours = new Map<number, number>();
  for (let i = 1; i < points.length; i += 1) {
    if ((points[i].gmv as number) < (points[i - 1].gmv as number)) {
      const h = new Date(points[i].captured_at).getUTCHours();
      dropHours.set(h, (dropHours.get(h) ?? 0) + 1);
    }
  }
  // Belum pernah terlihat reset → anggap tengah malam WIB (17:00 UTC).
  const boundaryUtcHour = [...dropHours.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 17;

  const buckets = new Map<string, { start: string; total: number }>();
  for (const p of points) {
    const shifted = new Date(new Date(p.captured_at).getTime() - boundaryUtcHour * 3_600_000);
    const key = shifted.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (!b) buckets.set(key, { start: p.captured_at, total: p.gmv as number });
    else b.total = Math.max(b.total, p.gmv as number);
  }

  // Siklus pertama dibuang karena hampir pasti terpotong di awal rentang.
  return [...buckets.entries()].slice(1).map(([key, b], i, all) => ({
    label: jakartaDate(`${key}T12:00:00Z`),
    total: b.total,
    running: i === all.length - 1,
  }));
}

export default function PlatformDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [period, setPeriod] = useState<Period>('today');
  const [kpi, setKpi] = useState<KpiDetail | null>(null);
  const [kpiState, setKpiState] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    api.get(`/platforms/${slug}`)
      .then((r) => setPlatform(r.data))
      .catch((e) => { if (e?.response?.status === 404) setNotFound(true); });
    api.get('/agent/watcher/snapshots', { params: { platform: slug, limit: 500 } })
      .then((r) => setSnapshots(r.data.data ?? []))
      .catch(() => setSnapshots([]));
    api.get('/automation/alerts', { params: { platform: slug } })
      .then((r) => setAlerts(r.data.data ?? []))
      .catch(() => setAlerts([]));
  }, [slug]);

  useEffect(() => {
    setKpiState('loading');
    api.get(`/platforms/${slug}/kpi`, { params: { period } })
      .then((r) => {
        // Backend membalas null (body kosong) bila platform belum bisa dihubungi.
        if (r.data && typeof r.data === 'object' && Object.keys(r.data).length) {
          setKpi(r.data);
          setKpiState('ok');
        } else {
          setKpi(null);
          setKpiState('empty');
        }
      })
      .catch(() => { setKpi(null); setKpiState('empty'); });
  }, [slug, period]);

  const days = useMemo(() => dailyTotals(snapshots).slice(-14), [snapshots]);
  // Skala dibatasi 10× median hari yang ada transaksinya. Satu pencilan (mis.
  // salah ketik Rp24,4 juta di NotaBe 26 Sep) tidak boleh membuat semua hari
  // lain jadi garis gepeng. Batang pencilan tetap tampil dengan angkanya.
  const nonZero = days.map((d) => d.total).filter((t) => t > 0).sort((a, b) => a - b);
  const median = nonZero.length ? nonZero[Math.floor(nonZero.length / 2)] : 0;
  const rawMax = Math.max(1, ...days.map((d) => d.total));
  const maxDay = median > 0 && rawMax > median * 10 ? median * 10 : rawMax;
  const pendingAlerts = alerts.filter((a) => a.status === 'pending');

  if (notFound) {
    return (
      <div className="flex flex-col gap-6 max-w-[1116px]">
        <TopBar title="Platform tidak ditemukan" subtitle={`Tidak ada platform dengan nama "${slug}"`} />
        <Link href="/" className="text-[13px] text-[var(--brand-red)] hover:underline">← Kembali ke dashboard</Link>
      </div>
    );
  }

  // Selama data belum termuat, jangan menebak status — dulu tampil
  // 'Dalam pembangunan' sekejap bahkan untuk platform yang live.
  const status = platform
    ? STATUS_LABEL[platform.readiness_status] ?? STATUS_LABEL.not_ready
    : { text: 'Memuat…', color: 'var(--text-muted)' };
  const isLive = platform?.readiness_status === 'ready';

  return (
    <div className="flex flex-col gap-6 max-w-[1116px]">
      <TopBar title={platform?.name ?? '…'} subtitle={platform?.description ?? 'Detail platform'} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: status.color }} />
          <span className="text-[13px] font-medium" style={{ color: status.color }}>{status.text}</span>
          {platform?.connection?.last_checked_at && (
            <span className="text-[12px] text-[var(--text-muted)]">· dicek {timeAgo(platform.connection.last_checked_at)}</span>
          )}
        </div>
        {isLive && (
          <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] p-1">
            {PERIODS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  period === key
                    ? 'bg-[var(--brand-red-subtle)] text-[var(--brand-red)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {platform && !isLive && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-6 py-10 text-center">
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">
            {platform.readiness_status === 'archived' ? `${platform.name} sedang diarsipkan` : `${platform.name} masih dalam pembangunan`}
          </p>
          <p className="mx-auto mt-2 max-w-[520px] text-[13px] text-[var(--text-muted)]">
            {platform.readiness_status === 'archived'
              ? 'Platform ini tidak dipantau dan tidak tampil di dashboard. Data historisnya tetap tersimpan.'
              : 'KPI akan tampil di sini begitu platform-nya live dan menyediakan endpoint /nineos/kpi sesuai kontrak integrasi NineOS.'}
          </p>
        </div>
      )}

      {isLive && (
        <>
          {kpiState === 'loading' ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[...Array(5)].map((_, i) => <div key={i} className="h-[104px] animate-pulse rounded-xl bg-[var(--bg-surface)]" />)}
            </div>
          ) : kpiState === 'empty' || !kpi ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-8 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">KPI {platform?.name} tidak bisa diambil saat ini — backend platform mungkin sedang tidak menjawab.</p>
            </div>
          ) : (
            <>
              {(kpi.attention ?? []).length > 0 && (
                <div className="flex flex-col gap-2">
                  {kpi.attention!.map((a) => (
                    <div
                      key={a.code}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3"
                      style={{ borderLeft: `3px solid ${attentionColor[a.severity] ?? 'var(--border)'}` }}
                    >
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">{a.title}</p>
                      <p className="text-[12px] text-[var(--text-muted)]">{a.message}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {kpiCards(kpi).map((c) => (
                  <div key={c.label} title={c.hint} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <p className="text-[12px] text-[var(--text-muted)]">{c.label}</p>
                    <p className="mt-1 text-[22px] font-bold text-[var(--text-primary)] tabular-nums">{c.value}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{c.sub}</p>
                  </div>
                ))}
              </div>
              {kpi.window?.label && (
                <p className="-mt-3 text-[11px] text-[var(--text-muted)]">Periode: {kpi.window.label}</p>
              )}

              {(kpi.orders?.by_vertical || kpi.finance || kpi.langganan) && (
                <div className="grid gap-4 md:grid-cols-3">
                  {kpi.orders?.by_vertical && Object.keys(kpi.orders.by_vertical).length > 0 && (
                    <Breakdown title="Order per layanan" data={kpi.orders.by_vertical} />
                  )}
                  {kpi.orders?.by_payment && Object.keys(kpi.orders.by_payment).length > 0 && (
                    <Breakdown title="Metode bayar" data={kpi.orders.by_payment} />
                  )}
                  {kpi.finance?.revenue_breakdown && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                      <p className="mb-3 text-[13px] font-semibold text-[var(--text-primary)]">Pendapatan aplikator</p>
                      <dl className="flex flex-col gap-2 text-[12px]">
                        {Object.entries(kpi.finance.revenue_breakdown).map(([k, v]) => (
                          <MoneyRow key={k} label={`${BREAKDOWN_LABEL[k] ?? k}${v.count ? ` · ${v.count}×` : ''}`} value={rupiah(v.amount)} />
                        ))}
                        <MoneyRow label="Total masuk ke kapten" value={rupiah(kpi.overview?.revenue ?? 0)} strong />
                      </dl>
                      <p className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Bukan pendapatan</p>
                      <dl className="flex flex-col gap-2 text-[12px]">
                        {kpi.finance.saldo_top_ups && (
                          <MoneyRow label="Top-up saldo pengguna (titipan)" value={rupiah(kpi.finance.saldo_top_ups.amount)} />
                        )}
                        {kpi.finance.withdrawals_pending && (
                          <MoneyRow label="Penarikan mitra menunggu" value={rupiah(kpi.finance.withdrawals_pending.amount)} />
                        )}
                        {kpi.poin?.saldo_beredar !== undefined && (
                          <MoneyRow label="Saldo poin mitra (termasuk gratis)" value={`${kpi.poin.saldo_beredar.toLocaleString('id-ID')} poin`} />
                        )}
                        {kpi.poin?.terpakai_untuk_order !== undefined && (
                          <MoneyRow label="Poin terpakai periode ini" value={`${kpi.poin.terpakai_untuk_order.toLocaleString('id-ID')} poin`} />
                        )}
                      </dl>
                    </div>
                  )}
                  {kpi.langganan && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                      <p className="mb-3 text-[13px] font-semibold text-[var(--text-primary)]">Pendapatan aplikator</p>
                      <dl className="flex flex-col gap-2 text-[12px]">
                        <MoneyRow label={`Langganan lunas · ${kpi.langganan.pembayaran_lunas ?? 0}×`} value={rupiah(kpi.langganan.pendapatan ?? 0)} strong />
                        {(kpi.langganan.pembayaran_menunggu?.count ?? 0) > 0 && (
                          <MoneyRow
                            label={`Menunggu dibayar · ${kpi.langganan.pembayaran_menunggu!.count}×`}
                            value={rupiah(kpi.langganan.pembayaran_menunggu!.jumlah)}
                          />
                        )}
                        <MoneyRow label="Toko berbayar aktif" value={String(kpi.langganan.toko_berbayar_aktif ?? 0)} />
                        <MoneyRow label="Toko masa trial" value={String(kpi.langganan.toko_trial_aktif ?? 0)} />
                      </dl>
                      <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
                        Nilai transaksi laundry di atas adalah uang toko dengan pelanggannya — bukan pendapatan NotaBe.
                      </p>
                    </div>
                  )}
                  {kpi.langganan?.per_paket && Object.keys(kpi.langganan.per_paket).length > 0 && (
                    <Breakdown title="Toko berbayar per paket" data={kpi.langganan.per_paket} />
                  )}
                </div>
              )}
            </>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">Nilai transaksi harian</p>
              <p className="text-[11px] text-[var(--text-muted)]">dari rekaman watcher tiap jam · {days.length} hari</p>
            </div>
            {days.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-[var(--text-muted)]">Belum cukup rekaman untuk menyusun tren harian.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex h-[160px] min-w-[480px] items-end gap-2">
                  {days.map((d, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1.5" title={`${d.label}: ${rupiah(d.total)}${d.running ? ' (berjalan)' : ''}`}>
                      <span className={`text-[10px] tabular-nums ${d.total > maxDay ? 'font-semibold text-[var(--status-warning)]' : 'text-[var(--text-muted)]'}`}>
                        {d.total >= 1_000_000 ? `${(d.total / 1_000_000).toFixed(1).replace('.', ',')}jt` : d.total >= 1000 ? `${Math.round(d.total / 1000)}rb` : d.total}
                        {d.total > maxDay && ' ↑'}
                      </span>
                      <div
                        className="w-full rounded-t-[3px]"
                        style={{
                          height: `${Math.max(2, Math.min(1, d.total / maxDay) * 110)}px`,
                          background: d.running ? 'var(--brand-red-subtle)' : 'var(--brand-red)',
                          border: d.running ? '1px dashed var(--brand-red)' : 'none',
                        }}
                      />
                      <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {days.some((d) => d.total > maxDay) && (
              <p className="mt-3 text-[11px] text-[var(--status-warning)]">
                ↑ = di luar skala grafik. Nilainya jauh di atas hari-hari lain — layak dicek apakah transaksi sungguhan atau salah input di platform.
              </p>
            )}
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              Batang bergaris = hari yang masih berjalan. Tiap platform berganti hari pada jamnya sendiri, jadi total dihitung per siklus platform, bukan per tanggal kalender.
            </p>
          </div>
        </>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">Alert {platform?.name ?? ''}</p>
          {pendingAlerts.length > 0 && (
            <Link href="/automation" className="text-[12px] font-medium text-[var(--brand-red)] hover:underline">
              Tinjau di Automation →
            </Link>
          )}
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
          {alerts.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[var(--text-muted)]">Belum ada alert untuk platform ini</p>
          ) : (
            alerts.slice(0, 6).map((a, i, arr) => (
              <div key={a.id} className={`flex items-start gap-2.5 px-4 py-3 ${i < arr.length - 1 ? 'border-b border-[var(--border)]' : ''} ${a.status === 'resolved' ? 'opacity-50' : ''}`}>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: severityDot[a.severity] ?? 'var(--text-muted)' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{a.title}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {timeAgo(a.created_at)} · {a.status === 'pending' ? 'perlu ditinjau' : a.status === 'resolved' ? 'sudah ditangani' : a.status}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <p className="mb-3 text-[13px] font-semibold text-[var(--text-primary)]">{title}</p>
      <div className="flex flex-col gap-2.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1">
            <div className="flex justify-between text-[12px]">
              <span className="text-[var(--text-muted)]">{k.replace(/_/g, ' ').toLowerCase()}</span>
              <span className="font-medium text-[var(--text-primary)] tabular-nums">{v}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5">
              <div className="h-1.5 rounded-full bg-[var(--brand-red)]" style={{ width: `${(v / total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
