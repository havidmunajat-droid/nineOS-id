interface TopBarProps {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export default function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <div className="flex items-center justify-between pb-6">
      <div>
        <h1 className="text-[28px] font-bold text-[var(--text-primary)]">{title}</h1>
        <p className="text-[13px] text-[var(--text-muted)]">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-red)] text-[12px] font-bold text-white">
            F
          </div>
          <span className="text-[13px] font-medium text-[var(--text-primary)]">Founder</span>
        </div>
      </div>
    </div>
  );
}
