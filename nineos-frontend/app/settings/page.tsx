'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import api from '@/lib/api';
import { timeAgo } from '@/lib/format';

interface NotifyStatus {
  configured: boolean;
  has_bot_token: boolean;
  has_chat_id: boolean;
  bot?: { ok: boolean; username?: string; error?: string };
}
interface WatcherStatus {
  enabled: boolean;
  autonomy: string;
  schedule: { snapshot: string; briefing: string };
  snapshot_count: number;
  last_snapshot: { platform: string; at: string } | null;
  pending_alerts: number;
  pending_approvals: number;
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'ok' | 'warn' | 'muted' }) {
  const color = tone === 'ok' ? 'var(--status-success)' : tone === 'warn' ? 'var(--status-warning)' : 'var(--text-primary)';
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-[13px]">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-right font-medium" style={{ color }}>{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <p className="mb-2 text-[14px] font-semibold text-[var(--text-primary)]">{title}</p>
      <div className="divide-y divide-[var(--border)]">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const [notify, setNotify] = useState<NotifyStatus | null>(null);
  const [watcher, setWatcher] = useState<WatcherStatus | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  useEffect(() => {
    api.get('/agent/notify/status').then((r) => setNotify(r.data)).catch(() => setNotify(null));
    api.get('/agent/watcher/status').then((r) => setWatcher(r.data)).catch(() => setWatcher(null));
    api.get('/virtual-office/ai/status').then((r) => setProvider(r.data.provider)).catch(() => setProvider(null));
  }, []);

  const sendTest = async () => {
    setTestState('sending');
    try {
      const r = await api.post('/agent/notify/test');
      setTestState(r.data?.sent ? 'sent' : 'failed');
    } catch {
      setTestState('failed');
    }
  };

  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <TopBar title="Settings" subtitle="Status sistem NineOS" />

      <Card title="Notifikasi Telegram">
        <Row
          label="Status"
          value={notify ? (notify.configured ? 'Aktif' : 'Belum lengkap') : '—'}
          tone={notify?.configured ? 'ok' : 'warn'}
        />
        <Row label="Bot" value={notify?.bot?.ok ? notify.bot.username : (notify?.bot?.error ?? '—')} />
        <Row label="Chat tujuan" value={notify?.has_chat_id ? 'Terpasang' : 'Belum diisi'} tone={notify?.has_chat_id ? 'ok' : 'warn'} />
        <div className="flex items-center justify-between gap-4 pt-3">
          <span className="text-[12px] text-[var(--text-muted)]">
            {testState === 'sent' && 'Terkirim — cek Telegram.'}
            {testState === 'failed' && 'Gagal mengirim. Cek token & chat_id di Railway.'}
            {(testState === 'idle' || testState === 'sending') && 'Kirim satu pesan untuk memastikan notifikasi sampai.'}
          </span>
          <button
            type="button"
            onClick={sendTest}
            disabled={!notify?.configured || testState === 'sending'}
            className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--brand-red)] disabled:opacity-40"
          >
            {testState === 'sending' ? 'Mengirim…' : 'Kirim pesan uji'}
          </button>
        </div>
      </Card>

      <Card title="AI">
        <Row label="Provider aktif" value={provider ?? '—'} />
        <Row label="Mode otonomi agent" value={watcher?.autonomy === 'full' ? 'Penuh (tanpa approval)' : 'Dijaga — aksi sensitif butuh approval'} />
        <Row label="Menunggu persetujuan" value={watcher?.pending_approvals ?? '—'} tone={watcher?.pending_approvals ? 'warn' : undefined} />
        <div className="pt-3">
          <Link href="/ai-usage" className="text-[12px] font-medium text-[var(--brand-red)] hover:underline">
            Lihat pemakaian & biaya AI →
          </Link>
        </div>
      </Card>

      <Card title="Watcher">
        <Row label="Status" value={watcher ? (watcher.enabled ? 'Berjalan' : 'Dimatikan') : '—'} tone={watcher?.enabled ? 'ok' : 'warn'} />
        <Row label="Rekam KPI" value={watcher?.schedule.snapshot ?? '—'} />
        <Row label="Laporan malam" value={watcher?.schedule.briefing ?? '—'} />
        <Row label="Snapshot terekam" value={watcher?.snapshot_count?.toLocaleString('id-ID') ?? '—'} />
        <Row
          label="Rekaman terakhir"
          value={watcher?.last_snapshot ? `${watcher.last_snapshot.platform} · ${timeAgo(watcher.last_snapshot.at)}` : '—'}
        />
      </Card>
    </div>
  );
}
