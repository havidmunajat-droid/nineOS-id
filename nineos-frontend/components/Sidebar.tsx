'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const platforms = [
  { slug: 'matcha', label: 'Matcha', ready: true },
  { slug: 'notabe', label: 'NotaBe', ready: true },
  { slug: 'krama', label: 'Krama', ready: false },
  { slug: 'nine-studio', label: 'Nine Studio', ready: false },
];

const modules = [
  { href: '/helpdesk', label: 'HelpDesk' },
  { href: '/social', label: 'Social Media' },
  { href: '/automation', label: 'Automation' },
];

export default function Sidebar() {
  const path = usePathname();

  const navItem = (href: string, label: string) => {
    const active = path === href || path.startsWith(href + '/');
    return (
      <Link
        key={href}
        href={href}
        className={`flex h-8 items-center rounded-md px-2.5 text-[13px] transition-colors ${
          active
            ? 'bg-[var(--brand-red-subtle)] font-semibold text-[var(--brand-red)]'
            : 'font-normal text-[var(--text-primary)] hover:bg-white/5'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col gap-5 overflow-y-auto bg-[var(--bg-surface)] px-5 py-6">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-sm bg-[var(--brand-red)]" />
        <span className="text-base font-bold text-[var(--text-primary)]">NineOS</span>
      </div>

      <div className="h-px bg-[var(--border)]" />

      {/* Platforms */}
      <div className="flex flex-col gap-0.5">
        {navItem('/', 'Dashboard')}
        {platforms.map(p => (
          <Link
            key={p.slug}
            href={`/platforms/${p.slug}`}
            className={`flex h-8 items-center gap-2 rounded-md pl-6 pr-2.5 text-[13px] transition-colors ${
              path === `/platforms/${p.slug}`
                ? 'bg-[var(--brand-red-subtle)] text-[var(--brand-red)]'
                : p.ready
                ? 'text-[var(--text-primary)] hover:bg-white/5'
                : 'text-[var(--text-muted)]'
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ background: p.ready ? 'var(--status-success)' : 'var(--text-muted)' }}
            />
            {p.label}
          </Link>
        ))}
      </div>

      <div className="h-px bg-[var(--border)]" />

      {/* Modules */}
      <div className="flex flex-col gap-0.5">
        {modules.map(m => navItem(m.href, m.label))}
      </div>

      <div className="h-px bg-[var(--border)]" />

      {navItem('/virtual-office', 'Virtual Office')}

      {/* Spacer */}
      <div className="flex-1" />

      <div className="h-px bg-[var(--border)]" />
      <Link
        href="/settings"
        className="flex h-8 items-center rounded-md px-2.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        Settings
      </Link>
    </aside>
  );
}
