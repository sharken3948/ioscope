'use client'

export function ChainDropdown() {
  return (
    <div className="flex items-center gap-2 pl-3 pr-2.5 self-stretch border-r text-xs font-bold shrink-0" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e88' }}
      />
      <span>ARC Testnet</span>
    </div>
  )
}
