'use client';
import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import api from '@/lib/api';

interface Conversation {
  id: string; customer_name: string | null; customer_identifier: string;
  channel_type: string; status: string; last_message_at: string;
  platform?: { slug: string; name: string };
}
interface Message {
  id: string; sender_type: string; message_text: string;
  ai_confidence_score?: number; created_at: string;
}

const statusBadge: Record<string, string> = {
  open: 'text-[var(--status-success)] bg-green-500/10',
  escalated: 'text-[var(--status-warning)] bg-yellow-500/10',
  closed: 'text-[var(--text-muted)] bg-white/5',
};

export default function HelpdeskPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const PLATFORMS = ['matcha', 'notabe'];

  useEffect(() => {
    Promise.all(PLATFORMS.map(slug =>
      api.get(`/platforms/${slug}/helpdesk/conversations`)
        .then(r => (r.data.data ?? []).map((c: Conversation) => ({ ...c, platform: { slug, name: slug === 'matcha' ? 'Matcha' : 'NotaBe' } })))
        .catch(() => [])
    )).then(results => {
      const all = results.flat().sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
      setConversations(all);
    }).finally(() => setLoading(false));
  }, []);

  const openConversation = async (c: Conversation) => {
    setSelected(c);
    try {
      const r = await api.get(`/platforms/${c.platform?.slug}/helpdesk/conversations/${c.id}`);
      setMessages(r.data.messages ?? []);
    } catch { setMessages([]); }
  };

  const filtered = conversations.filter(c =>
    (c.customer_name ?? c.customer_identifier).toLowerCase().includes(search.toLowerCase())
  );

  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins}m lalu`;
    if (mins < 1440) return `${Math.floor(mins / 60)}j lalu`;
    return `${Math.floor(mins / 1440)}h lalu`;
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1116px]">
      <TopBar title="HelpDesk" subtitle="Automasi tanya jawab pelanggan" />

      <div className="flex h-[756px] rounded-xl border border-[var(--border)] overflow-hidden">
        {/* Conversation List */}
        <div className="w-[320px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)] flex flex-col">
          <div className="p-4">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari percakapan..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand-red)]"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-[13px] text-[var(--text-muted)]">Memuat...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">Belum ada percakapan</div>
            ) : (
              filtered.map((c, i) => (
                <div key={c.id}>
                  <button
                    onClick={() => openConversation(c)}
                    className={`w-full px-4 py-3 text-left hover:bg-white/5 transition-colors ${selected?.id === c.id ? 'bg-[var(--brand-red-subtle)]' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">
                        {c.customer_name ?? c.customer_identifier}
                      </span>
                      {c.status === 'open' || c.status === 'escalated' ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-success)]" />
                      ) : null}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mb-1">
                      {c.channel_type} · {c.platform?.name}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {timeAgo(c.last_message_at)}
                    </p>
                  </button>
                  {i < filtered.length - 1 && <div className="mx-4 h-px bg-[var(--border)]" />}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat View */}
        <div className="flex flex-1 flex-col bg-[var(--bg-base)]">
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
                <span className="text-[16px] font-semibold text-[var(--text-primary)]">
                  {selected.customer_name ?? selected.customer_identifier}
                </span>
                <span className="text-[13px] text-[var(--text-muted)]">
                  {selected.channel_type} · {selected.platform?.name}
                </span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge[selected.status] ?? ''}`}>
                  {selected.status}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
                {messages.length === 0 ? (
                  <p className="text-center text-[13px] text-[var(--text-muted)] mt-8">Belum ada pesan</p>
                ) : (
                  messages.map(m => (
                    <div key={m.id} className={`flex ${m.sender_type === 'customer' ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[65%] rounded-xl px-4 py-2.5 text-[13px] ${
                          m.sender_type === 'customer'
                            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
                            : 'bg-[var(--brand-red)] text-white'
                        }`}
                      >
                        {m.message_text}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-[var(--border)] p-4 flex gap-3">
                <input
                  placeholder="Tulis balasan..."
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand-red)]"
                />
                <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--brand-red)] text-white hover:bg-[var(--brand-red-hover)] transition-colors">
                  →
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[13px] text-[var(--text-muted)]">Pilih percakapan untuk memulai</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
