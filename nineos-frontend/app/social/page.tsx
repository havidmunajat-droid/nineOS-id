'use client';
import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import ContentStudioModal from '@/components/ContentStudioModal';
import api, { updateContent } from '@/lib/api';

interface Content {
  id: string; platform_slug: string; media_type: string; caption: string;
  status: string; scheduled_at?: string | null; published_at?: string; created_at: string;
}

function isTodayOrPastWIB(isoStr: string): boolean {
  const WIB = 7 * 60 * 60 * 1000;
  const d = new Date(isoStr);
  const today = new Date(Date.now() + WIB);
  const todayStr = `${today.getUTCFullYear()}-${today.getUTCMonth()}-${today.getUTCDate()}`;
  const dWIB = new Date(d.getTime() + WIB);
  const dStr = `${dWIB.getUTCFullYear()}-${dWIB.getUTCMonth()}-${dWIB.getUTCDate()}`;
  return dStr <= todayStr;
}

const statusColors: Record<string, string> = {
  draft: 'text-[var(--text-muted)] bg-white/5',
  scheduled: 'text-[var(--status-info)] bg-blue-500/10',
  published: 'text-[var(--status-success)] bg-green-500/10',
  failed: 'text-[var(--status-error)] bg-red-500/10',
};

const TABS = ['Semua', 'Draft', 'Terjadwal', 'Published'];
const tabToStatus: Record<string, string | null> = {
  'Semua': null, 'Draft': 'draft', 'Terjadwal': 'scheduled', 'Published': 'published'
};

const PLATFORMS = [
  { slug: 'matcha', label: 'Matcha' },
  { slug: 'notabe', label: 'NotaBe' },
  { slug: 'krama', label: 'Krama' },
  { slug: 'nine-studio', label: 'Nine Studio' },
];

export default function SocialPage() {
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Semua');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [showStudio, setShowStudio] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadContent = () => {
    setLoading(true);
    Promise.all(PLATFORMS.map(p =>
      api.get(`/platforms/${p.slug}/content`)
        .then(r => (r.data.data ?? []).map((c: Content) => ({ ...c, platform_slug: p.slug })))
        .catch(() => [])
    )).then(results => {
      const all = results.flat().sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setContents(all);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadContent(); }, []);

  const markAsPosted = async (c: Content) => {
    setMarkingId(c.id);
    try {
      await updateContent(c.platform_slug, c.id, { status: 'published', caption: c.caption, media_type: c.media_type });
      setContents(prev => prev.map(x => x.id === c.id ? { ...x, status: 'published' } : x));
    } catch { /* diam saja jika gagal */ }
    finally { setMarkingId(null); }
  };

  const filtered = contents.filter(c => {
    if (platformFilter !== 'all' && c.platform_slug !== platformFilter) return false;
    const statusFilter = tabToStatus[tab];
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });

  // scheduled_at bertipe `string | null`, jadi null harus ikut diterima —
  // kalau tidak, `next build` gagal di tahap typecheck.
  const fmt = (iso?: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1116px]">
      <TopBar title="Content Studio" subtitle="Generate konten AI & posting realtime" />

      {showStudio && (
        <ContentStudioModal
          platforms={PLATFORMS}
          onClose={() => setShowStudio(false)}
          onPublished={loadContent}
        />
      )}

      {/* Jadwal Hari Ini */}
      {(() => {
        const todayItems = contents.filter(c => c.status === 'scheduled' && c.scheduled_at && isTodayOrPastWIB(c.scheduled_at));
        if (!todayItems.length) return null;
        return (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">Jadwal Hari Ini</p>
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-400">{todayItems.length} konten</span>
            </div>
            <div className="flex flex-col gap-2">
              {todayItems.map(c => {
                const timeStr = c.scheduled_at
                  ? new Date(c.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
                  : '—';
                const isPast = c.scheduled_at ? new Date(c.scheduled_at) < new Date() : false;
                return (
                  <div key={c.id} className={`flex items-start gap-4 rounded-xl border p-4 ${isPast ? 'border-[var(--status-warning)]/30 bg-[color-mix(in_srgb,var(--status-warning)_5%,transparent)]' : 'border-blue-500/20 bg-blue-500/5'}`}>
                    {/* Platform + time */}
                    <div className="flex flex-col items-center gap-1 shrink-0 w-[72px]">
                      <span className="rounded-full bg-[var(--bg-surface)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase">{c.platform_slug}</span>
                      <span className={`text-[13px] font-bold ${isPast ? 'text-[var(--status-warning)]' : 'text-blue-400'}`}>{timeStr}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{c.media_type}</span>
                    </div>
                    {/* Caption */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[var(--text-primary)] leading-relaxed line-clamp-3">{c.caption}</p>
                    </div>
                    {/* Actions */}
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => navigator.clipboard.writeText(c.caption)}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => markAsPosted(c)}
                        disabled={markingId === c.id}
                        className="rounded-lg bg-[var(--status-success)]/80 hover:bg-[var(--status-success)] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors disabled:opacity-50"
                      >
                        {markingId === c.id ? '...' : '✓ Posted'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Tabs + filter row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                tab === t
                  ? 'bg-[var(--brand-red)] font-semibold text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none"
          >
            <option value="all">Semua Platform</option>
            {PLATFORMS.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
          </select>
          <button
            onClick={() => setShowStudio(true)}
            className="whitespace-nowrap rounded-lg bg-[var(--brand-red)] px-4 py-2 text-[13px] font-semibold text-white"
          >
            ✨ Buat Konten AI
          </button>
        </div>
      </div>

      {/* Content list */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-4 px-5 py-3 border-b border-[var(--border)]">
          {['Konten', 'Platform', 'Tipe', 'Tanggal', 'Status'].map(h => (
            <span key={h} className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{h}</span>
          ))}
        </div>

        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="h-[56px] animate-pulse border-b border-[var(--border)] mx-5 my-2 rounded-lg bg-white/5" />
          ))
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[var(--text-muted)]">Belum ada konten</div>
        ) : (
          filtered.map((c, i) => (
            <div
              key={c.id}
              className={`grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-4 px-5 py-3.5 items-center hover:bg-white/5 transition-colors ${
                i < filtered.length - 1 ? 'border-b border-[var(--border)]' : ''
              }`}
            >
              <p className="text-[13px] text-[var(--text-primary)] truncate pr-4">{c.caption}</p>
              <p className="text-[13px] text-[var(--text-muted)] capitalize">{c.platform_slug}</p>
              <p className="text-[13px] text-[var(--text-muted)] capitalize">{c.media_type}</p>
              <p className="text-[13px] text-[var(--text-muted)]">{fmt(c.published_at ?? c.scheduled_at)}</p>
              <span className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusColors[c.status] ?? 'text-[var(--text-muted)]'}`}>
                {c.status}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Konten', value: contents.length },
          { label: 'Draft', value: contents.filter(c => c.status === 'draft').length },
          { label: 'Terjadwal', value: contents.filter(c => c.status === 'scheduled').length },
          { label: 'Published', value: contents.filter(c => c.status === 'published').length },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <p className="text-[12px] text-[var(--text-muted)]">{s.label}</p>
            <p className="mt-1 text-[28px] font-bold text-[var(--text-primary)]">{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
