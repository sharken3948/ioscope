'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, RefreshCw, Eye, AlertCircle, Clock } from 'lucide-react'
import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BrandLogo } from '@/components/BrandLogo'
import { Sidebar } from '@/components/Sidebar'
import type { Chain } from '@/lib/blockscout'

interface WatchlistEntry {
  address: string
  label: string
  chain: Chain
  riskScore: number | null
  lastChecked: string | null
}

function RiskBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs opacity-40" style={{ color: 'var(--text)' }}>—</span>
  const color = score <= 33 ? '#4ade80' : score <= 66 ? '#facc15' : '#ef4444'
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color, background: `${color}22` }}>
      {score}
    </span>
  )
}

const CHAINS: Chain[] = ['arc', 'ethereum', 'base', 'soneium']
const CHAIN_LABELS: Record<Chain, string> = {
  arc: 'ARC',
  ethereum: 'ETH',
  base: 'Base',
  soneium: 'Soneium',
}

export default function WatchlistPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<WatchlistEntry[]>([])
  const [showForm, setShowForm] = useState(false)
  const [newAddress, setNewAddress] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newChain, setNewChain] = useState<Chain>('arc')

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ioscope_watchlist')
      if (stored) setEntries(JSON.parse(stored) as WatchlistEntry[])
    } catch { /* ignore */ }
  }, [])

  function save(list: WatchlistEntry[]) {
    setEntries(list)
    localStorage.setItem('ioscope_watchlist', JSON.stringify(list))
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newAddress.trim()
    if (!trimmed) return
    const entry: WatchlistEntry = {
      address: trimmed,
      label: newLabel.trim() || trimmed.slice(0, 10) + '…',
      chain: newChain,
      riskScore: null,
      lastChecked: null,
    }
    save([...entries, entry])
    setNewAddress('')
    setNewLabel('')
    setShowForm(false)
  }

  function handleRemove(address: string) {
    save(entries.filter((e) => e.address !== address))
  }

  async function handleReanalyze(entry: WatchlistEntry) {
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: entry.address, chain: entry.chain }),
      })
      const data = await res.json()
      if (res.ok && data.aiAnalysis) {
        save(
          entries.map((e) =>
            e.address === entry.address
              ? { ...e, riskScore: data.aiAnalysis.riskScore, lastChecked: new Date().toISOString() }
              : e,
          ),
        )
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center justify-between px-6 py-3 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--sidebar)' }}
        >
          <div className="flex items-center gap-3">
            <div className="md:hidden"><BrandLogo size="sm" /></div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Watchlist</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--accent)', color: '#0d1117' }}
            >
              <Plus size={13} /> Add Address
            </button>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          {showForm && (
            <form
              onSubmit={handleAdd}
              className="mb-6 p-4 rounded-xl border"
              style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
            >
              <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Add to Watchlist</div>
              <div className="flex flex-col md:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Address (0x...)"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm border outline-none font-mono"
                  style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  required
                />
                <input
                  type="text"
                  placeholder="Label (optional)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-32 px-3 py-2 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
                <select
                  value={newChain}
                  onChange={(e) => setNewChain(e.target.value as Chain)}
                  className="px-3 py-2 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  {CHAINS.map((c) => (
                    <option key={c} value={c}>{CHAIN_LABELS[c]}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--accent)', color: '#0d1117' }}
                >
                  Add
                </button>
              </div>
            </form>
          )}

          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <AlertCircle size={32} style={{ color: 'var(--text)', opacity: 0.2 }} />
              <div className="text-sm" style={{ color: 'var(--text)', opacity: 0.4 }}>No addresses in watchlist yet</div>
              <button
                onClick={() => setShowForm(true)}
                className="text-xs px-4 py-2 rounded-lg font-semibold"
                style={{ background: 'var(--accent)', color: '#0d1117' }}
              >
                Add your first address
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((entry) => (
                <div
                  key={entry.address}
                  className="flex items-center gap-3 p-4 rounded-xl border"
                  style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{entry.label}</span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{ background: 'var(--border)', color: 'var(--text)', opacity: 0.7 }}
                      >
                        {CHAIN_LABELS[entry.chain]}
                      </span>
                    </div>
                    <div className="font-mono text-xs mt-0.5 truncate" style={{ color: 'var(--text)', opacity: 0.4 }}>
                      {entry.address}
                    </div>
                    {entry.lastChecked && (
                      <div className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--text)', opacity: 0.35 }}>
                        <Clock size={10} />
                        {new Date(entry.lastChecked).toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <div className="text-center min-w-[40px]">
                      <div className="text-xs mb-0.5" style={{ color: 'var(--text)', opacity: 0.35 }}>Risk</div>
                      <RiskBadge score={entry.riskScore} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleReanalyze(entry)}
                      className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--accent)' }}
                      title="Re-analyze"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <Link
                      href={`/address/${entry.address}?chain=${entry.chain}`}
                      className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--text)' }}
                      title="View analysis"
                    >
                      <Eye size={14} />
                    </Link>
                    <button
                      onClick={() => handleRemove(entry.address)}
                      className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                      style={{ color: '#ef4444' }}
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
