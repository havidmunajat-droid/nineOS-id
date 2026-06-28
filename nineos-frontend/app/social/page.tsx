'use client';
import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import ContentStudioModal from '@/components/ContentStudioModal';
import api from '@/lib/api';

interface Content {
  id: string; platform_slug: string; media_type: string; caption: string;
  status: string; scheduled_at?: string; published_at?: string; created_at: string;
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

  const filtered = contents.filter(c => {
    if (platformFilter !== 'all' && c.platform_slug !== platformFilter) return false;
    const statusFilter = tabToStatus[tab];
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });

  const fmt = (iso?: string) => {
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
