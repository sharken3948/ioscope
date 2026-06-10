interface MetricCardProps {
  label: string
  value: string | number
  sub?: string
  icon?: React.ReactNode
}

export function MetricCard({ label, value, sub, icon }: MetricCardProps) {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-1" style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text)', opacity: 0.5 }}>{label}</span>
        {icon && <span style={{ color: 'var(--accent)' }}>{icon}</span>}
      </div>
      <div className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--text)', opacity: 0.4 }}>{sub}</div>}
    </div>
  )
}
