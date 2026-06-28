'use client';
import { useState } from 'react';
import { generateContent, generateMedia, publishNow } from '@/lib/api';

interface Props {
  platforms: { slug: string; label: string }[];
  onClose: () => void;
  onPublished: () => void;
}

const CHANNELS = ['instagram', 'facebook', 'tiktok', 'linkedin'];

export default function ContentStudioModal({ platforms, onClose, onPublished }: Props) {
  const [slug, setSlug] = useState(platforms[0]?.slug ?? 'matcha');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [prompt, setPrompt] = useState('');

  const [contentId, setContentId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [mediaPrompt, setMediaPrompt] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [provider, setProvider] = useState('');
  const [channels, setChannels] = useState<string[]>(['instagram']);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await generateContent(slug, prompt.trim(), mediaType);
      setContentId(r.content_id);
      setCaption(r.caption);
      setMediaPrompt(r.media_prompt ?? '');
      setProvider(r.provider ?? '');
      setMediaUrl(null);
    } catch (e: unknown) {
      setError(getMsg(e));
    } finally { setBusy(false); }
  };

  const handleGenerateMedia = async () => {
    if (!contentId) return;
    setBusy(true); setError(null);
    try {
      const r = await generateMedia(slug, contentId, mediaPrompt || undefined);
      setMediaUrl(r.media_urls?.[0] ?? null);
      setProvider(r.provider ?? provider);
    } catch (e: unknown) {
      setError(getMsg(e));
    } finally { setBusy(false); }
  };

  const handlePublish = async () => {
    if (!contentId || !channels.length) return;
    setBusy(true); setError(null);
    try {
      await publishNow(slug, contentId, channels);
      setDone(true);
      onPublished();
    } catch (e: unknown) {
      setError(getMsg(e));
    } finally { setBusy(false); }
  };

  const toggleChannel = (c: string) =>
    setChannels(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-base,#0d0d0f)] p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)]">Buat Konten AI</h2>
            <p className="text-[12px] text-[var(--text-muted)]">Generate → preview → posting realtime</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[20px] leading-none">×</button>
        </div>

        {done ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-[24px]">✓</div>
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">Berhasil diposting!</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">Ke: {channels.join(', ')}</p>
            <button onClick={onClose} className="mt-5 rounded-lg bg-[var(--brand-red)] px-5 py-2 text-[13px] font-semibold text-white">Selesai</button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Step 1: brief */}
            <div className="flex gap-2">
              <select value={slug} onChange={e => setSlug(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none">
                {platforms.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
              </select>
              <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-1">
                {(['image', 'video'] as const).map(t => (
                  <button key={t} onClick={() => setMediaType(t)}
                    className={`rounded-md px-3 py-1 text-[12px] capitalize ${mediaType === t ? 'bg-[var(--brand-red)] text-white font-semibold' : 'text-[var(--text-muted)]'}`}>
                    {t === 'image' ? 'Gambar' : 'Video'}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              placeholder="Brief konten… contoh: promo diskon 20% matcha latte akhir pekan, tone ceria"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none resize-none placeholder:text-[var(--text-muted)]"
            />
            <button onClick={handleGenerate} disabled={busy || !prompt.trim()}
              className="rounded-lg bg-[var(--brand-red)] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">
              {busy && !contentId ? 'AI sedang menulis…' : contentId ? '↻ Generate Ulang' : '✨ Generate dengan AI'}
            </button>

            {/* Step 2: preview caption + media */}
            {contentId && (
              <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Caption {provider && `· ${provider}`}</label>
                  <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none resize-none" />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Prompt Visual</label>
                  <textarea value={mediaPrompt} onChange={e => setMediaPrompt(e.target.value)} rows={2}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-muted)] outline-none resize-none" />
                </div>

                {/* Media preview */}
                {mediaUrl ? (
                  <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                    {mediaType === 'video'
                      ? <video src={mediaUrl} controls className="w-full max-h-[280px] bg-black" />
                      : <img src={mediaUrl} alt="preview" className="w-full max-h-[280px] object-cover" />}
                  </div>
                ) : (
                  <button onClick={handleGenerateMedia} disabled={busy}
                    className="rounded-lg border border-[var(--brand-red)] px-4 py-2.5 text-[13px] font-semibold text-[var(--brand-red)] disabled:opacity-40">
                    {busy ? 'Membuat media…' : `🎨 Generate ${mediaType === 'image' ? 'Gambar' : 'Video'}`}
                  </button>
                )}

                {/* Step 3: publish */}
                {mediaUrl && (
                  <div className="border-t border-[var(--border)] pt-3">
                    <label className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Posting ke</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CHANNELS.map(c => (
                        <button key={c} onClick={() => toggleChannel(c)}
                          className={`rounded-full px-3 py-1 text-[12px] capitalize border ${channels.includes(c) ? 'border-[var(--brand-red)] bg-[var(--brand-red)]/15 text-[var(--text-primary)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
                          {c}
                        </button>
                      ))}
                    </div>
                    <button onClick={handlePublish} disabled={busy || !channels.length}
                      className="mt-3 w-full rounded-lg bg-green-600 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">
                      {busy ? 'Memposting…' : '🚀 Posting Sekarang'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-[12px] text-[var(--status-error,#ef4444)]">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function getMsg(e: unknown): string {
  if (typeof e === 'object' && e && 'response' in e) {
    const r = (e as { response?: { data?: { message?: string } } }).response;
    if (r?.data?.message) return r.data.message;
  }
  return e instanceof Error ? e.message : 'Terjadi kesalahan';
}
