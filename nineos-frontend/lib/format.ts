// Util format bersama — dipakai lintas halaman, jangan duplikasi di page.

/** "5 menit lalu", "2 jam lalu", "3 hari lalu" */
export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs} jam lalu` : `${Math.floor(hrs / 24)} hari lalu`;
}

/** Versi ringkas untuk list padat: "5m lalu", "2j lalu", "3h lalu" */
export function timeAgoShort(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m lalu`;
  if (mins < 1440) return `${Math.floor(mins / 60)}j lalu`;
  return `${Math.floor(mins / 1440)}h lalu`;
}

/** Format Rupiah tanpa desimal: Rp 1.500.000 */
export function rupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}
