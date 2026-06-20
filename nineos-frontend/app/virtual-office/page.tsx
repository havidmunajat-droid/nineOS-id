'use client';
import { useEffect, useRef, useState } from 'react';
import TopBar from '@/components/TopBar';
import api from '@/lib/api';

interface Executive {
  id: string; role_code: string; display_name: string; status: string;
  scope_description?: string;
}
interface Message {
  id: string; sender_type: 'founder' | 'executive'; message_text: string;
  speaker_executive_id?: string; created_at: string;
}
interface Session {
  id: string; title: string; status: string;
}

const ROLE_ICONS: Record<string, string> = {
  CEO: 'C', CFO: 'F', CTO: 'T', CMO: 'M', COO: 'O', LEGAL: 'L',
};

export default function VirtualOfficePage() {
  const [executives, setExecutives] = useState<Executive[]>([]);
  const [selected, setSelected] = useState<Executive | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aiProvider, setAiProvider] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      api.get('/virtual-office/executives').then(r => r.data.data ?? []).catch(() => []),
      api.get('/virtual-office/ai/status').then(r => r.data).catch(() => ({})),
    ]).then(([execs, aiStatus]) => {
      setExecutives(execs);
      setAiProvider(aiStatus.provider ?? 'unknown');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectExecutive = async (exec: Executive) => {
    if (exec.status !== 'ready') return;
    setSelected(exec);
    setSession(null);
    setMessages([]);
    // Create new session
    try {
      const r = await api.post('/virtual-office/sessions', {
        mode: 'one_on_one',
        title: `Chat dengan ${exec.display_name}`,
        participant_executive_ids: [exec.id],
      });
      setSession(r.data.data);
    } catch (e) { console.error(e); }
  };

  const sendMessage = async () => {
    if (!input.trim() || !session || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    const optimistic: Message = {
      id: `tmp-${Date.now()}`, sender_type: 'founder', message_text: text, created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const r = await api.post(`/virtual-office/sessions/${session.id}/messages`, {
        message_text: text,
        sender_type: 'founder',
      });
      const replies: Message[] = r.data.data ?? [];
      setMessages(prev => [
        ...prev.filter(m => m.id !== optimistic.id),
        { ...optimistic, id: r.data.founder_message_id ?? optimistic.id },
        ...replies,
      ]);
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const getExecName = (id?: string) => executives.find(e => e.id === id)?.display_name ?? 'AI';

  return (
    <div className="flex flex-col gap-6 max-w-[1116px]">
      <TopBar
        title="Virtual Office"
        subtitle="Konsultasi dengan C-Level AI"
        actions={
          aiProvider ? (
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-success)]" />
              <span className="text-[11px] text-[var(--text-muted)]">{aiProvider}</span>
            </div>
          ) : undefined
        }
      />

      <div className="flex h-[720px] rounded-xl border border-[var(--border)] overflow-hidden">
        {/* Executive selector */}
        <div className="w-[280px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)] flex flex-col">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">C-Level AI</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="h-[72px] animate-pulse rounded-lg bg-white/5 mb-1" />
              ))
            ) : (
              executives.map(exec => {
                const isReady = exec.status === 'ready';
                const isActive = selected?.id === exec.id;
                return (
                  <button
                    key={exec.id}
                    onClick={() => selectExecutive(exec)}
                    disabled={!isReady}
                    className={`w-full rounded-lg p-3 text-left transition-colors mb-0.5 ${
                      isActive
                        ? 'bg-[var(--brand-red-subtle)] border border-[var(--brand-red)]/30'
                        : isReady
                        ? 'hover:bg-white/5'
                        : 'opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ${
                        isActive ? 'bg-[var(--brand-red)] text-white' : 'bg-[var(--bg-elevated,#222)] text-[var(--text-primary)]'
                      }`}>
                        {ROLE_ICONS[exec.role_code] ?? exec.role_code[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{exec.display_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ background: isReady ? 'var(--status-success)' : 'var(--text-muted)' }}
                          />
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {isReady ? 'Tersedia' : 'Belum siap'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {exec.scope_description && (
                      <p className="mt-1.5 pl-12 text-[11px] text-[var(--text-muted)] leading-relaxed truncate">
                        {exec.scope_description}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex flex-1 flex-col bg-[var(--bg-base)]">
          {selected && session ? (
            <>
              {/* Header */}
              <div className="border-b border-[var(--border)] px-5 py-3.5 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-red)] text-[12px] font-bold text-white">
                  {ROLE_ICONS[selected.role_code]}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[var(--text-primary)]">{selected.display_name}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{selected.role_code} · AI aktif</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                {messages.length === 0 && (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="text-center">
                      <p className="text-[13px] text-[var(--text-muted)]">
                        Mulai percakapan dengan {selected.display_name}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1">
                        AI akan merespons berdasarkan data operasional real-time
                      </p>
                    </div>
                  </div>
                )}
                {messages.map(m => {
                  const isFounder = m.sender_type === 'founder';
                  return (
                    <div key={m.id} className={`flex items-end gap-2.5 ${isFounder ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        isFounder ? 'bg-[var(--brand-red)] text-white' : 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
                      }`}>
                        {isFounder ? 'F' : ROLE_ICONS[selected.role_code]}
                      </div>
                      <div
                        className={`max-w-[70%] rounded-xl px-4 py-2.5 text-[13px] leading-relaxed ${
                          isFounder
                            ? 'bg-[var(--brand-red)] text-white rounded-br-sm'
                            : 'bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-bl-sm'
                        }`}
                      >
                        {!isFounder && (
                          <p className="text-[10px] font-semibold mb-1 opacity-70">
                            {getExecName(m.speaker_executive_id)}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap">{m.message_text}</p>
                      </div>
                    </div>
                  );
                })}
                {sending && (
                  <div className="flex items-end gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[11px] font-bold text-[var(--text-primary)]">
                      {ROLE_ICONS[selected.role_code]}
                    </div>
                    <div className="rounded-xl rounded-bl-sm bg-[var(--bg-surface)] px-4 py-3">
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="border-t border-[var(--border)] p-4 flex gap-3">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
                  placeholder={`Tanya ${selected.display_name}...`}
                  disabled={sending}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand-red)] disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-red)] text-white hover:bg-[var(--brand-red-hover)] transition-colors disabled:opacity-50"
                >
                  →
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <p className="text-[13px] text-[var(--text-muted)]">Pilih C-Level untuk memulai sesi</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-1">CEO, CFO, CTO, CMO tersedia</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
