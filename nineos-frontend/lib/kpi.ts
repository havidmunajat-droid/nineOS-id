// Logika kartu KPI bersama — dipakai dashboard dan halaman detail platform,
// supaya keduanya tidak pernah menampilkan angka dengan cara berbeda.
import { rupiah } from './format';

// Bentuk KPI generik sesuai NineOS-Integration-Contract.md — blok `overview` umum,
// blok lain opsional dan spesifik platform.
export interface AttentionItem { code: string; severity: 'info' | 'warning' | 'critical'; title: string; message: string; }

export interface PlatformKpi {
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
export function kpiCards(kpi: PlatformKpi) {
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
  // Label netral: arti active_users beda per platform (Krama = pelanggan yang
  // memesan, NotaBe = pengguna aplikasi kasir yang aktif).
  if (o?.active_users !== undefined) cards.push({ label: 'Pengguna Aktif', value: o.active_users, sub: 'aktif periode ini' });
  return cards.slice(0, 10);
}

export const attentionColor: Record<AttentionItem['severity'], string> = {
  critical: 'var(--status-error)',
  warning: 'var(--status-warning)',
  info: 'var(--status-info)',
};
