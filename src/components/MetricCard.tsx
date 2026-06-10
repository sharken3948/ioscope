interface MetricCardProps {
  label: string
  value: string | number
  sub?: string
  icon?: React.ReactNode
}

export function MetricCard({ label, value, sub, icon }: MetricCardProps) {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--sidebar)', borderColor: 'var(--border)', boxShadow: 'var(--card-shadow)' }}>
      <div className="flex items-center justify-between">
        <span
          className="uppercase"
          style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em' }}
        >
          {label}
        </span>
        {icon && <span style={{ color: 'var(--accent)' }}>{icon}</span>}
      </div>
      <div className="mt-1" style={{ color: 'var(--text)', fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      {sub && <div className="mt-0.5" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{sub}</div>}
    </div>
  )
}
