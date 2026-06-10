'use client'

import type { Chain } from '@/lib/blockscout'

const CHAINS: { id: Chain; name: string; icon: string }[] = [
  { id: 'arc', name: 'ARC Testnet', icon: '🔵' },
  { id: 'ethereum', name: 'Ethereum', icon: '⟠' },
  { id: 'base', name: 'Base', icon: '🔷' },
  { id: 'soneium', name: 'Soneium', icon: '🌐' },
]

interface ChainSelectorProps {
  value: Chain
  onChange: (chain: Chain) => void
}

export function ChainSelector({ value, onChange }: ChainSelectorProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {CHAINS.map((c) => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border"
          style={
            value === c.id
              ? { background: 'var(--accent)', color: '#0d1117', borderColor: 'var(--accent)', fontWeight: 700 }
              : { background: 'transparent', color: 'var(--text)', borderColor: 'var(--border)', opacity: 0.7 }
          }
        >
          <span>{c.icon}</span>
          <span>{c.name}</span>
        </button>
      ))}
    </div>
  )
}
