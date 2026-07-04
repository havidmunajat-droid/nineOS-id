'use client';
import { useEffect, useRef, useState } from 'react';
import TopBar from '@/components/TopBar';
import api from '@/lib/api';

// Kontrak backend:
// executives → { role_code, display_name, scope, status: 'active'|'not_ready' }
// createSession → { session_id, title, status, participants: [{role_code, display_name}] }
// sendMessage → { session_id, replies: [{role_code, display_name, message}] }
// getSession → { id, title, status, messages: [{id, sender_type, speaker:{role_code,name}, message, created_at}] }

interface Executive {
  role_code: string; display_name: string; status: string; scope?: string;
}
interface Message {
  id: string;
  sender_type: 'founder' | 'executive';
  message_text: string;
  speaker_name?: string;
  speaker_role?: string;
  created_at: string;
}
interface MeetingItem {
  id: string; title: string; status: string;
  scheduled_at: string | null; created_at: string;
}
interface ActiveSession {
  id: string; title: string; mode: 'chat' | 'meeting';
}

const ROLE_ICONS: Record<string, string> = {
  CEO: 'C', CFO: 'F', CTO: 'T', CMO: 'M', COO: 'O', LEGAL: 'L',
};

// 22:00 WIB hari ini; kalau sudah lewat → besok
function tonight2200WIB(): Date {
  const WIB = 7 * 60 * 60 * 1000;
  const wibNow = new Date(Date.now() + WIB);
  const d = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate(), 15, 0, 0));
  if (Date.now() > d.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function isTodayWIB(isoStr: string): boolean {
  const WIB = 7 * 60 * 60 * 1000;
  const d = new Date(new Date(isoStr).getTime() + WIB);
  const today = new Date(Date.now() + WIB);
  return d.getUTCFullYear() === today.getUTCFullYear() &&
    d.getUTCMonth() === today.getUTCMonth() &&
    d.getUTCDate() === today.getUTCDate();
}

export default function VirtualOfficePage() {
  const [executives, setExecutives] = useState<Executive[]>([]);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selected, setSelected] = useState<Executive | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aiProvider, setAiProvider] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'chat' | 'meeting'>('chat');
  const [scheduling, setScheduling] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      api.get('/virtual-office/executives').then(r => r.data.data ?? []).catch(() => []),
      api.get('/virtual-office/ai/status').then(r => r.data).catch(() => ({})),
      api.get('/virtual-office/sessions?mode=meeting').then(r => r.data.data ?? []).catch(() => []),
    ]).then(([execs, aiStatus, mtgs]) => {
      setExecutives(execs);
      setAiProvider(aiStatus.provider ?? 'unknown');
      setMeetings(mtgs.slice(0, 20));
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const selectExecutive = async (exec: Executive) => {
    if (exec.status !== 'active') return;
    setSelected(exec);
    setActiveSession(null);
    setMessages([]);
    try {
      const r = await api.post('/virtual-office/sessions', {
        mode: 'chat',
        title: `Chat dengan ${exec.display_name}`,
        participant_roles: [exec.role_code],
      });
      setActiveSession({ id: r.data.session_id, title: r.data.title ?? '', mode: 'chat' });
    } catch (e) { console.error(e); }
  };

  const scheduleMeeting = async () => {
    const activeRoles = executives.filter(e => e.status === 'active').map(e => e.role_code);
    if (!activeRoles.length) return;
    setScheduling(true);
    try {
      const at = tonight2200WIB();
      const dateStr = at.toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta',
      });
      const r = await api.post('/virtual-office/sessions', {
        mode: 'meeting',
        title: `Daily Meeting — ${dateStr}`,
        participant_roles: activeRoles,
        scheduled_at: at.toISOString(),
      });
      setMeetings(prev => [{
        id: r.data.session_id,
        title: r.data.title ?? '',
        status: r.data.status,
        scheduled_at: at.toISOString(),
        created_at: new Date().toISOString(),
      }, ...prev]);
    } catch (e) { console.error(e); }
    finally { setScheduling(false); }
  };

  const enterMeeting = async (mtg: MeetingItem) => {
    setSelected(null);
    setMessages([]);
    setActiveSession({ id: mtg.id, title: mtg.title, mode: 'meeting' });
    try {
      const r = await api.get(`/virtual-office/sessions/${mtg.id}`);
      setMessages((r.data.messages ?? []).map((m: {
        id: string; sender_type: string;
        speaker?: { role_code: string; name: string };
        message: string; created_at: string;
      }) => ({
        id: m.id,
        sender_type: m.sender_type as 'founder' | 'executive',
        message_text: m.message,
        speaker_name: m.speaker?.name,
        speaker_role: m.speaker?.role_code,
        created_at: m.created_at,
      })));
    } catch (e) { console.error(e); }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeSession || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    const optimistic: Message = {
      id: `tmp-${Date.now()}`, sender_type: 'founder', message_text: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const r = await api.post(`/virtual-office/sessions/${activeSession.id}/messages`, { message_text: text });
      const replies: Message[] = (r.data.replies ?? []).map(
        (rep: { role_code: string; display_name: string; message: string }, i: number) => ({
          id: `${activeSession.id}-${Date.now()}-${i}`,
          sender_type: 'executive' as const,
          message_text: rep.message,
          speaker_name: rep.display_name,
          speaker_role: rep.role_code,
          created_at: new Date().toISOString(),
        }),
      );
      setMessages(prev => [...prev, ...replies]);
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    } finally { setSending(false); }
  };

  const todayMeeting = meetings.find(m => m.scheduled_at && isTodayWIB(m.scheduled_at));
  const activeExecs = executives.filter(e => e.status === 'active');

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
        {/* Left panel */}
        <div className="w-[280px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)] flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-[var(--border)]">
            {(['chat', 'meeting'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-[12px] font-semibold uppercase tracking-wider transition-colors ${
                  tab === t
                    ? 'text-[var(--brand-red)] border-b-2 border-[var(--brand-red)] -mb-px'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t === 'chat' ? 'Chat 1-on-1' : 'Daily Meeting'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {tab === 'chat' ? (
              loading ? (
                [...Array(4)].map((_, i) => (
                  <div key={i} className="h-[72px] animate-pulse rounded-lg bg-white/5 mb-1" />
                ))
              ) : (
                executives.map(exec => {
                  const isReady = exec.status === 'active';
                  const isActive = activeSession?.mode === 'chat' && selected?.role_code === exec.role_code;
                  return (
                    <button
                      key={exec.role_code}
                      onClick={() => selectExecutive(exec)}
                      disabled={!isReady}
                      className={`w-full rounded-lg p-3 text-left transition-colors mb-0.5 ${
                        isActive
                          ? 'bg-[var(--brand-red-subtle)] border border-[var(--brand-red)]/30'
                          : isReady ? 'hover:bg-white/5' : 'opacity-40 cursor-not-allowed'
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
                            <span className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ background: isReady ? 'var(--status-success)' : 'var(--text-muted)' }} />
                            <span className="text-[11px] text-[var(--text-muted)]">
                              {isReady ? 'Tersedia' : 'Belum siap'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {exec.scope && (
                        <p className="mt-1.5 pl-12 text-[11px] text-[var(--text-muted)] leading-relaxed truncate">{exec.scope}</p>
                      )}
                    </button>
                  );
                })
              )
            ) : (
              /* Meeting tab */
              <div className="flex flex-col gap-2 p-1">
                <button
                  onClick={scheduleMeeting}
                  disabled={scheduling || !!todayMeeting}
                  className={`w-full rounded-lg border py-2.5 px-3 text-[12px] font-semibold transition-colors ${
                    todayMeeting
                      ? 'border-[var(--status-success)]/30 bg-[color-mix(in_srgb,var(--status-success)_10%,transparent)] text-[var(--status-success)] cursor-default'
                      : 'border-[var(--brand-red)]/30 bg-[var(--brand-red-subtle)] text-[var(--brand-red)] hover:bg-[color-mix(in_srgb,var(--brand-red)_20%,transparent)] disabled:opacity-60'
                  }`}
                >
                  {todayMeeting ? '✓ Meeting Malam Ini Terjadwal' : scheduling ? 'Menjadwalkan...' : '+ Jadwalkan Meeting 22:00'}
                </button>

                {!loading && meetings.length === 0 && (
                  <p className="text-center text-[12px] text-[var(--text-muted)] py-6">Belum ada meeting terjadwal</p>
                )}

                {meetings.map(mtg => {
                  const isActive = activeSession?.id === mtg.id;
                  const scheduledLabel = mtg.scheduled_at
                    ? new Date(mtg.scheduled_at).toLocaleDateString('id-ID', {
                        weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta',
                      })
                    : null;
                  return (
                    <button
                      key={mtg.id}
                      onClick={() => enterMeeting(mtg)}
                      className={`w-full rounded-lg p-3 text-left transition-colors ${
                        isActive
                          ? 'bg-[var(--brand-red-subtle)] border border-[var(--brand-red)]/30'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <p className="text-[12px] font-medium text-[var(--text-primary)] leading-snug">{mtg.title}</p>
                      {scheduledLabel && (
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">📅 {scheduledLabel} · 22:00 WIB</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Chat / Meeting area */}
        <div className="flex flex-1 flex-col bg-[var(--bg-base)]">
          {activeSession ? (
            <>
              {/* Header */}
              <div className="border-b border-[var(--border)] px-5 py-3.5 flex items-center gap-3">
                {activeSession.mode === 'chat' && selected ? (
                  <>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-red)] text-[12px] font-bold text-white">
                      {ROLE_ICONS[selected.role_code] ?? selected.role_code[0]}
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{selected.display_name}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{selected.role_code} · AI aktif</p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Stacked avatars for meeting */}
                    <div className="flex items-center -space-x-1.5">
                      {activeExecs.slice(0, 5).map(e => (
                        <div key={e.role_code}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-[11px] font-bold text-[var(--text-primary)]">
                          {ROLE_ICONS[e.role_code] ?? e.role_code[0]}
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{activeSession.title}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {activeExecs.length} C-Level hadir · Daily Meeting
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                {messages.length === 0 && (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="text-center">
                      {activeSession.mode === 'meeting' ? (
                        <>
                          <p className="text-[13px] text-[var(--text-muted)]">Meeting siap dimulai</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-1">
                            Sampaikan agenda — semua C-Level akan merespons
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-[13px] text-[var(--text-muted)]">
                            Mulai percakapan dengan {selected?.display_name}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-1">
                            AI merespons berdasarkan data operasional real-time
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {messages.map(m => {
                  const isFounder = m.sender_type === 'founder';
                  const execIcon = m.speaker_role
                    ? (ROLE_ICONS[m.speaker_role] ?? m.speaker_role[0])
                    : (selected ? ROLE_ICONS[selected.role_code] : '?');
                  return (
                    <div key={m.id} className={`flex items-end gap-2.5 ${isFounder ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        isFounder ? 'bg-[var(--brand-red)] text-white' : 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
                      }`}>
                        {isFounder ? 'F' : execIcon}
                      </div>
                      <div className={`max-w-[70%] rounded-xl px-4 py-2.5 text-[13px] leading-relaxed ${
                        isFounder
                          ? 'bg-[var(--brand-red)] text-white rounded-br-sm'
                          : 'bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-bl-sm'
                      }`}>
                        {!isFounder && (
                          <p className="text-[10px] font-semibold mb-1 opacity-70">
                            {m.speaker_name ?? selected?.display_name}
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
                      {activeSession.mode === 'meeting' ? '⚡' : (selected ? ROLE_ICONS[selected.role_code] : '?')}
                    </div>
                    <div className="rounded-xl rounded-bl-sm bg-[var(--bg-surface)] px-4 py-3">
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }} />
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
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder={
                    activeSession.mode === 'meeting'
                      ? 'Sampaikan agenda atau keputusan yang perlu dibahas...'
                      : `Tanya ${selected?.display_name}...`
                  }
                  disabled={sending}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand-red)] disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-red)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  →
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                {tab === 'chat' ? (
                  <>
                    <p className="text-[13px] text-[var(--text-muted)]">Pilih C-Level untuk memulai sesi</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">CEO, CFO, CTO, CMO tersedia</p>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-[var(--text-muted)]">Jadwalkan meeting atau pilih dari daftar</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">Daily Meeting 22:00 WIB dengan semua C-Level aktif</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
