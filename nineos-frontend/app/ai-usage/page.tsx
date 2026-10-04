'use client';
import { useEffect, useMemo, useState } from 'react';
import TopBar from '@/components/TopBar';
import api from '@/lib/api';

interface Sum { runs: number; failed_runs: number; requests: number; input: number; output: number; thinking: number; cached: number; }
interface Usage {
  days: number;
  recording_since: string | null;
  observed_days: number;
  total: Sum;
  projection_30d: { input: number; output: number; runs: number; reliable: boolean };
  by_model: Array<Sum & { provider: string; model: string }>;
  by_feature: Array<Sum & { feature: string }>;
}

/** Satu baris simulasi: tarif per 1 juta token, dalam USD, diisi kapten. */
interface PriceRow { id: string; label: string; input: string; output: string; }

const STORAGE_KEY = 'nineos.ai-pricing.v1';

// Baris awal kosong dengan sengaja. Harga provider berubah-ubah; angka yang
// ditulis di kode akan diam-diam basi dan menyesatkan perbandingan.
const DEFAULT_ROWS: PriceRow[] = [
  { id: 'gemini', label: 'Gemini', input: '', output: '' },
  { id: 'claude', label: 'Claude (Anthropic)', input: '', output: '' },
  { id: 'openai', label: 'GPT (OpenAI)', input: '', output: '' },
];

const PRICING_PAGES = [
  { name: 'Gemini', url: 'https://ai.google.dev/gemini-api/docs/pricing' },
  { name: 'Anthropic', url: 'https://www.anthropic.com/pricing' },
  { name: 'OpenAI', url: 'https://openai.com/api/pricing/' },
];

const FEATURE_LABEL: Record<string, string> = {
  nightly_report: 'Laporan Malam',
  virtual_office: 'Chat Virtual Office',
  content_caption: 'Caption Content Studio',
  manual: 'Uji manual',
  chat: 'Lainnya',
};

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2).replace('.', ',')} jt` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} rb` : String(n);
const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;

function loadRows(): { rows: PriceRow[]; kurs: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* penyimpanan browser tidak tersedia — pakai bawaan */ }
  return { rows: DEFAULT_ROWS, kurs: '' };
}

export default function AiUsagePage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);
  const [rows, setRows] = useState<PriceRow[]>(DEFAULT_ROWS);
  const [kurs, setKurs] = useState('');
  // Simpan hanya SETELAH tarif tersimpan selesai dimuat. Tanpa penjaga ini,
  // efek simpan berjalan duluan dengan baris kosong bawaan dan menimpa tarif
  // yang sudah diisi kapten setiap kali halaman dibuka.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = loadRows();
    setRows(saved.rows);
    setKurs(saved.kurs);
    setHydrated(true);
    api.get('/agent/ai-usage', { params: { days: 30 } })
      .then((r) => setUsage(r.data))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows, kurs })); } catch { /* abaikan */ }
  }, [rows, kurs, hydrated]);

  const update = (id: string, patch: Partial<PriceRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { id: crypto.randomUUID(), label: 'Model lain', input: '', output: '' }]);
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const proj = usage?.projection_30d;
  const kursNum = Number(kurs.replace(/\./g, '').replace(',', '.'));

  const simulated = useMemo(() => rows.map((r) => {
    const inP = Number(r.input.replace(',', '.'));
    const outP = Number(r.output.replace(',', '.'));
    if (!proj || !r.input || !r.output || Number.isNaN(inP) || Number.isNaN(outP)) return { ...r, cost: null as number | null };
    return { ...r, cost: (proj.input / 1_000_000) * inP + (proj.output / 1_000_000) * outP };
  }), [rows, proj]);

  const cheapest = simulated.filter((s) => s.cost != null).sort((a, b) => (a.cost as number) - (b.cost as number))[0];

  return (
    <div className="flex max-w-[1000px] flex-col gap-6">
      <TopBar title="Biaya AI" subtitle="Pemakaian token nyata NineOS & simulasi biaya per provider" />

      {failed && (
        <p className="text-[13px] text-[var(--status-error)]">Data pemakaian tidak bisa dimuat. Muat ulang halaman.</p>
      )}

      {usage && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: 'Token masuk', value: fmtTokens(usage.total.input), sub: usage.recording_since ? `${usage.observed_days.toFixed(1).replace('.', ',')} hari terekam` : 'pencatatan belum dimulai' },
              { label: 'Token keluar', value: fmtTokens(usage.total.output), sub: usage.total.thinking ? `${fmtTokens(usage.total.thinking)} di antaranya "berpikir"` : 'termasuk token berpikir' },
              { label: 'Panggilan AI', value: usage.total.runs, sub: `${usage.total.requests} request ke provider` },
              { label: 'Gagal', value: usage.total.failed_runs, sub: 'tetap dihitung bila sempat memakai token' },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                <p className="text-[12px] text-[var(--text-muted)]">{c.label}</p>
                <p className="mt-1 text-[24px] font-bold text-[var(--text-primary)] tabular-nums">{c.value}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{c.sub}</p>
              </div>
            ))}
          </div>

          {usage.total.runs === 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-6 text-[13px] text-[var(--text-muted)]">
              Belum ada pemakaian yang terekam. Pencatatan dimulai sejak fitur ini dipasang — angka akan terisi setelah Laporan Malam
              atau chat Virtual Office berikutnya berhasil berjalan.
            </div>
          )}

          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">Simulasi biaya 30 hari</p>
              <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
                Proyeksi: {fmtTokens(proj?.input ?? 0)} masuk · {fmtTokens(proj?.output ?? 0)} keluar
              </p>
            </div>
            <p className="mb-4 text-[12px] text-[var(--text-muted)]">
              Isi tarif per <b>1 juta token</b> (USD) dari halaman harga resmi:{' '}
              {PRICING_PAGES.map((p, i) => (
                <span key={p.name}>
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-[var(--brand-red)] hover:underline">{p.name}</a>
                  {i < PRICING_PAGES.length - 1 ? ' · ' : ''}
                </span>
              ))}
              . Tarif tersimpan di browser ini.
            </p>
            {proj && !proj.reliable && usage.total.runs > 0 && (
              <p className="mb-4 rounded-md bg-[color-mix(in_srgb,var(--status-warning)_12%,transparent)] px-3 py-2 text-[12px] text-[var(--status-warning)]">
                Baru {usage.observed_days.toFixed(1).replace('.', ',')} hari data — proyeksi masih kasar. Mulai bisa diandalkan setelah 7 hari.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                    <th className="pb-2 font-medium">Model</th>
                    <th className="pb-2 font-medium">Input / 1 jt</th>
                    <th className="pb-2 font-medium">Output / 1 jt</th>
                    <th className="pb-2 text-right font-medium">Per bulan</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {simulated.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--border)]">
                      <td className="py-2 pr-2">
                        <input
                          value={r.label}
                          onChange={(e) => update(r.id, { label: e.target.value })}
                          aria-label="Nama model"
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[var(--text-primary)] outline-none focus:border-[var(--border)]"
                        />
                      </td>
                      {(['input', 'output'] as const).map((k) => (
                        <td key={k} className="py-2 pr-2">
                          <div className="flex items-center gap-1">
                            <span className="text-[var(--text-muted)]">$</span>
                            <input
                              inputMode="decimal"
                              value={r[k]}
                              placeholder="0,00"
                              onChange={(e) => update(r.id, { [k]: e.target.value })}
                              aria-label={`Tarif ${k} ${r.label}`}
                              className="w-24 rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1 text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--brand-red)]"
                            />
                          </div>
                        </td>
                      ))}
                      <td className="py-2 text-right tabular-nums">
                        {r.cost == null ? (
                          <span className="text-[var(--text-muted)]">—</span>
                        ) : (
                          <span className={`font-semibold ${cheapest?.id === r.id && simulated.filter((s) => s.cost != null).length > 1 ? 'text-[var(--status-success)]' : 'text-[var(--text-primary)]'}`}>
                            {usd(r.cost)}
                            {kursNum > 0 && (
                              <span className="block text-[11px] font-normal text-[var(--text-muted)]">
                                ≈ Rp{Math.round(r.cost * kursNum).toLocaleString('id-ID')}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button type="button" onClick={() => removeRow(r.id)} aria-label={`Hapus ${r.label}`} className="text-[12px] text-[var(--text-muted)] hover:text-[var(--status-error)]">
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={addRow} className="text-[12px] font-medium text-[var(--brand-red)] hover:underline">
                + Tambah model
              </button>
              <label className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                Kurs 1 USD = Rp
                <input
                  inputMode="numeric"
                  value={kurs}
                  placeholder="isi kurs"
                  onChange={(e) => setKurs(e.target.value)}
                  className="w-24 rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1 text-[var(--text-primary)] tabular-nums outline-none focus:border-[var(--brand-red)]"
                />
              </label>
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
              Catatan: tiap provider memecah teks menjadi token dengan cara berbeda, jadi teks yang sama bisa berbeda jumlah tokennya
              di model lain. Anggap simulasi ini perkiraan urutan besaran, bukan tagihan pasti. Token keluar sudah termasuk token
              &quot;berpikir&quot; yang ditagih sebagai output.
            </p>
          </section>

          {(usage.by_feature.length > 0 || usage.by_model.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                <p className="mb-3 text-[14px] font-semibold text-[var(--text-primary)]">Per fitur</p>
                {usage.by_feature.map((f) => (
                  <div key={f.feature} className="flex justify-between gap-3 border-t border-[var(--border)] py-2 text-[12px] first:border-t-0">
                    <span className="text-[var(--text-muted)]">{FEATURE_LABEL[f.feature] ?? f.feature} · {f.runs}×</span>
                    <span className="font-medium text-[var(--text-primary)] tabular-nums">{fmtTokens(f.input + f.output)} token</span>
                  </div>
                ))}
              </section>
              <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                <p className="mb-3 text-[14px] font-semibold text-[var(--text-primary)]">Per model terpakai</p>
                {usage.by_model.map((m) => (
                  <div key={`${m.provider}:${m.model}`} className="flex justify-between gap-3 border-t border-[var(--border)] py-2 text-[12px] first:border-t-0">
                    <span className="text-[var(--text-muted)]">{m.model}</span>
                    <span className="font-medium text-[var(--text-primary)] tabular-nums">{fmtTokens(m.input)} masuk · {fmtTokens(m.output)} keluar</span>
                  </div>
                ))}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
