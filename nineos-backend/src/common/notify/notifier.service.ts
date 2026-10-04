import { Injectable, Logger } from '@nestjs/common';

export type NotifySeverity = 'info' | 'warning' | 'critical' | 'ok';

const ICON: Record<NotifySeverity, string> = {
  critical: '🔴',
  warning: '🟠',
  info: '🔵',
  ok: '✅',
};

/** Batas panjang satu pesan Telegram. */
const TELEGRAM_LIMIT = 4096;

/**
 * Kirim notifikasi ke HP kapten lewat bot Telegram.
 *
 * Alasan dibuat (audit 4 Okt 2026): NotaBe mati 7 jam pada 12 September dan
 * tidak ada yang tahu sampai sebulan kemudian. Watcher sudah mendeteksinya,
 * tapi alert cuma diam di dashboard yang jarang dibuka.
 *
 * Prinsip:
 * - TIDAK PERNAH melempar error. Gagal kirim Telegram tidak boleh menggagalkan
 *   watcher, laporan malam, atau tool agent yang memanggilnya.
 * - Tanpa TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID → diam (no-op), cukup log.
 * - Hanya dikirim ke satu chat_id yang dikonfigurasi. Orang lain yang menemukan
 *   bot dan mengiriminya pesan tidak akan menerima apa pun.
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);
  private warnedMissingConfig = false;

  get configured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  }

  /** Notifikasi pendek: ikon + judul tebal + isi. */
  async alert(severity: NotifySeverity, title: string, body?: string): Promise<boolean> {
    const text = `${ICON[severity]} <b>${this.escape(title)}</b>${body ? `\n${this.escape(body)}` : ''}`;
    return this.send(text);
  }

  /**
   * Teks panjang berformat markdown sederhana dari AI (mis. Laporan Malam).
   * Dipecah otomatis kalau melebihi batas 4096 karakter Telegram.
   */
  async report(title: string, markdown: string): Promise<boolean> {
    const body = this.markdownToHtml(markdown);
    const chunks = this.split(`📊 <b>${this.escape(title)}</b>\n\n${body}`);
    let ok = true;
    for (const chunk of chunks) ok = (await this.send(chunk)) && ok;
    return ok;
  }

  /** Kirim apa adanya (sudah HTML). Dipakai juga oleh endpoint uji. */
  async send(html: string): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      if (!this.warnedMissingConfig) {
        this.logger.warn('Notifikasi Telegram nonaktif: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diisi');
        this.warnedMissingConfig = true;
      }
      return false;
    }

    try {
      const first = await this.post(token, chatId, html, 'HTML');
      if (first.ok) return true;

      // Format HTML ditolak (mis. tag tidak seimbang dari teks AI) → kirim
      // ulang sebagai teks polos supaya pesannya tetap sampai.
      if (first.status === 400) {
        const plain = html.replace(/<[^>]+>/g, '');
        const second = await this.post(token, chatId, plain);
        if (second.ok) return true;
        this.logger.warn(`Telegram menolak pesan: HTTP ${second.status} ${second.body}`);
        return false;
      }

      this.logger.warn(`Telegram menolak pesan: HTTP ${first.status} ${first.body}`);
      return false;
    } catch (err) {
      this.logger.warn(`Gagal menghubungi Telegram: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }

  /**
   * Bantu mencari chat_id: baca pesan terakhir yang masuk ke bot. Kapten
   * cukup mengirim /start ke bot, lalu endpoint ini menampilkan chat_id-nya.
   */
  async discoverChats(): Promise<Array<{ chat_id: number; name: string; type: string; last_text: string | null }>> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN belum diisi di environment');

    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: Array<{ message?: { text?: string; chat: { id: number; type: string; first_name?: string; title?: string; username?: string } } }>;
    };
    if (!json.ok) throw new Error(`Telegram: ${json.description ?? 'token ditolak'}`);

    const seen = new Map<number, { chat_id: number; name: string; type: string; last_text: string | null }>();
    for (const u of json.result ?? []) {
      const chat = u.message?.chat;
      if (!chat) continue;
      seen.set(chat.id, {
        chat_id: chat.id,
        name: chat.title ?? chat.first_name ?? chat.username ?? '(tanpa nama)',
        type: chat.type,
        last_text: u.message?.text ?? null,
      });
    }
    return [...seen.values()];
  }

  // ── helpers ───────────────────────────────────────────────────

  private async post(token: string, chatId: string, text: string, parseMode?: 'HTML') {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    return { ok: res.ok, status: res.status, body: res.ok ? '' : (await res.text()).slice(0, 200) };
  }

  private escape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Markdown sederhana keluaran AI → HTML yang diterima Telegram. */
  private markdownToHtml(md: string): string {
    return this.escape(md)
      .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^\s*[*-]\s+/gm, '• ');
  }

  /** Pecah di batas baris supaya tag HTML tidak terpotong di tengah. */
  private split(text: string): string[] {
    if (text.length <= TELEGRAM_LIMIT) return [text];
    const chunks: string[] = [];
    let current = '';
    for (const line of text.split('\n')) {
      if ((current + '\n' + line).length > TELEGRAM_LIMIT - 20) {
        if (current) chunks.push(current);
        current = line.slice(0, TELEGRAM_LIMIT - 20);
      } else {
        current = current ? `${current}\n${line}` : line;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }
}
