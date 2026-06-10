'use client'

import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Chain } from '@/lib/blockscout'

const CHAIN_GROUPS = [
  {
    label: 'Testnet',
    items: [
      { id: 'arc' as Chain, name: 'ARC Testnet', disabled: false },
    ],
  },
  {
    label: 'Mainnet',
    items: [
      { id: 'ethereum' as Chain, name: 'Ethereum', disabled: true },
      { id: 'base' as Chain, name: 'Base', disabled: true },
      { id: 'soneium' as Chain, name: 'Soneium', disabled: true },
    ],
  },
]

const ALL_CHAINS = CHAIN_GROUPS.flatMap((g) => g.items)

interface Props {
  value: Chain
  onChange: (chain: Chain) => void
}

export function ChainDropdown({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const selected = ALL_CHAINS.find((c) => c.id === value)

  return (
    <div ref={ref} className="relative shrink-0 self-stretch flex items-center">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-3 pr-2.5 h-full text-xs font-bold outline-none border-r"
        style={{ background: 'transparent', color: 'var(--text)', borderColor: 'var(--border)' }}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e88' }}
        />
        <span>{selected?.name ?? 'Select chain'}</span>
        <ChevronDown
          size={12}
          style={{
            opacity: 0.45,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute left-0 top-full mt-2 rounded-xl border z-50 py-1.5 min-w-[190px]"
          style={{
            background: '#0d1117',
            borderColor: '#1f2937',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
            animation: 'chain-dropdown-in 0.14s ease',
          }}
        >
          {CHAIN_GROUPS.map((group) => (
            <div key={group.label}>
              <div
                className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: '#4b5563' }}
              >
                {group.label}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => { onChange(item.id); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left rounded-lg mx-auto transition-colors"
                  style={{
                    color: item.disabled ? '#4b5563' : value === item.id ? '#22c55e' : '#d1d5db',
                    background: 'transparent',
                    cursor: item.disabled ? 'default' : 'pointer',
                    width: 'calc(100% - 8px)',
                    marginLeft: '4px',
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled) e.currentTarget.style.background = '#1f2937'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: item.disabled ? '#374151' : '#22c55e',
                      boxShadow: item.disabled ? 'none' : '0 0 5px #22c55e66',
                    }}
                  />
                  <span className="flex-1">{item.name}</span>
                  {item.disabled ? (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: '#1f2937', color: 'var(--text-muted)', letterSpacing: '0.06em' }}
                    >
                      SOON
                    </span>
                  ) : value === item.id ? (
                    <Check size={11} style={{ color: '#22c55e' }} />
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
