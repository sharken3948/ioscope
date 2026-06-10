'use client'

import { useState } from 'react'
import { Search, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BrandLogo } from '@/components/BrandLogo'
import { Sidebar } from '@/components/Sidebar'
import { ChainSelector } from '@/components/ChainSelector'
import { RiskGauge } from '@/components/RiskGauge'
import type { Chain } from '@/lib/blockscout'

interface AnalysisResult {
  addressInfo: { tx_count: number; balance: string; is_contract: boolean }
  metrics: {
    totalVolumeIn: string
    totalVolumeOut: string
    firstActivity: string | null
    lastActivity: string | null
    uniqueInteractions: number
    txFrequencyPerDay: number
  }
  aiAnalysis: {
    riskScore: number
    botProbability: number
    classification: string
    explanation: string
  }
}

interface AddressState {
  address: string
  chain: Chain
  loading: boolean
  data: AnalysisResult | null
  error: string | null
}

function formatEth(wei: string) {
  const n = Number(BigInt(wei)) / 1e18
  if (n === 0) return '0'
  if (n > 1e6) return `${(n / 1e6).toFixed(2)}M`
  return n.toFixed(4)
}

function walletAge(first: string | null) {
  if (!first) return '—'
  const days = Math.floor((Date.now() - new Date(first).getTime()) / 86400000)
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${(days / 365).toFixed(1)}yr`
}

type Winner = 'left' | 'right' | 'tie'

function CompareRow({
  label,
  leftVal,
  rightVal,
  winner,
  raw,
}: {
  label: string
  leftVal: string
  rightVal: string
  winner: Winner
  raw?: [number, number]
}) {
  const leftWins = winner === 'left'
  const rightWins = winner === 'right'

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td className="py-3 px-4 text-center">
        <span
          className="font-semibold text-sm"
          style={{ color: leftWins ? 'var(--accent)' : 'var(--text)', opacity: leftWins ? 1 : 0.7 }}
        >
          {leftVal}
        </span>
        {leftWins && <span className="ml-1 text-xs" style={{ color: 'var(--accent)' }}>✓</span>}
      </td>
      <td className="py-3 px-4 text-center text-xs font-medium" style={{ color: 'var(--text)', opacity: 0.4 }}>
        {label}
      </td>
      <td className="py-3 px-4 text-center">
        <span
          className="font-semibold text-sm"
          style={{ color: rightWins ? 'var(--accent)' : 'var(--text)', opacity: rightWins ? 1 : 0.7 }}
        >
          {rightVal}
        </span>
        {rightWins && <span className="ml-1 text-xs" style={{ color: 'var(--accent)' }}>✓</span>}
      </td>
    </tr>
  )
}

function AddressInput({
  label,
  state,
  onAddressChange,
  onChainChange,
  onAnalyze,
}: {
  label: string
  state: AddressState
  onAddressChange: (v: string) => void
  onChainChange: (c: Chain) => void
  onAnalyze: () => void
}) {
  return (
    <div
      className="flex-1 rounded-xl border p-4 flex flex-col gap-3 min-w-0"
      style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
    >
      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text)', opacity: 0.4 }}>
        {label}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={14} style={{ color: 'var(--text)', opacity: 0.35 }} />
        <input
          type="text"
          placeholder="0x..."
          value={state.address}
          onChange={(e) => onAddressChange(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-lg text-xs border outline-none font-mono"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
        />
      </div>
      <ChainSelector value={state.chain} onChange={onChainChange} />
      <button
        onClick={onAnalyze}
        disabled={!state.address.trim() || state.loading}
        className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
        style={{ background: 'var(--accent)', color: '#0d1117' }}
      >
        {state.loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        Analyze
      </button>

      {state.error && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: '#ef444411', color: '#ef4444' }}>
          {state.error}
        </div>
      )}

      {state.data && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <RiskGauge score={state.data.aiAnalysis.riskScore} />
          <div className="text-xs text-center" style={{ color: 'var(--text)', opacity: 0.5 }}>
            Bot probability: {state.data.aiAnalysis.botProbability}%
          </div>
          <div
            className="text-xs px-2.5 py-1 rounded-full font-medium capitalize"
            style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
          >
            {state.data.aiAnalysis.classification.replace('_', ' ')}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ComparePage() {
  const [left, setLeft] = useState<AddressState>({ address: '', chain: 'arc', loading: false, data: null, error: null })
  const [right, setRight] = useState<AddressState>({ address: '', chain: 'arc', loading: false, data: null, error: null })

  async function analyze(side: 'left' | 'right') {
    const state = side === 'left' ? left : right
    const setState = side === 'left' ? setLeft : setRight

    if (!state.address.trim()) return
    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: state.address, chain: state.chain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setState((s) => ({ ...s, loading: false, data: data as AnalysisResult }))
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Unknown error'
      setState((s) => ({ ...s, loading: false, error: err }))
    }
  }

  const lD = left.data
  const rD = right.data
  const bothReady = !!lD && !!rD

  function winner(leftNum: number, rightNum: number, higherIsBetter = true): Winner {
    if (leftNum === rightNum) return 'tie'
    if (higherIsBetter) return leftNum > rightNum ? 'left' : 'right'
    return leftNum < rightNum ? 'left' : 'right'
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
            <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Compare Addresses</h1>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 p-4 md:p-6 flex flex-col gap-6">
          {/* Inputs */}
          <div className="flex flex-col md:flex-row gap-4">
            <AddressInput
              label="Address A"
              state={left}
              onAddressChange={(v) => setLeft((s) => ({ ...s, address: v }))}
              onChainChange={(c) => setLeft((s) => ({ ...s, chain: c }))}
              onAnalyze={() => analyze('left')}
            />
            <div className="flex items-center justify-center text-xl font-bold" style={{ color: 'var(--text)', opacity: 0.3 }}>
              vs
            </div>
            <AddressInput
              label="Address B"
              state={right}
              onAddressChange={(v) => setRight((s) => ({ ...s, address: v }))}
              onChainChange={(c) => setRight((s) => ({ ...s, chain: c }))}
              onAnalyze={() => analyze('right')}
            />
          </div>

          {/* Comparison table */}
          {bothReady && (
            <div
              className="rounded-xl border overflow-hidden"
              style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text)', opacity: 0.4 }}>
                  Side by Side Comparison
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="py-2 px-4 text-center font-medium text-xs" style={{ color: 'var(--text)', opacity: 0.7 }}>
                      {left.address.slice(0, 8)}…
                    </th>
                    <th className="py-2 px-4 text-center font-medium text-xs" style={{ color: 'var(--text)', opacity: 0.35 }}>
                      Metric
                    </th>
                    <th className="py-2 px-4 text-center font-medium text-xs" style={{ color: 'var(--text)', opacity: 0.7 }}>
                      {right.address.slice(0, 8)}…
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <CompareRow
                    label="Risk Score"
                    leftVal={`${lD.aiAnalysis.riskScore}/100`}
                    rightVal={`${rD.aiAnalysis.riskScore}/100`}
                    winner={winner(lD.aiAnalysis.riskScore, rD.aiAnalysis.riskScore, false)}
                  />
                  <CompareRow
                    label="Bot Probability"
                    leftVal={`${lD.aiAnalysis.botProbability}%`}
                    rightVal={`${rD.aiAnalysis.botProbability}%`}
                    winner={winner(lD.aiAnalysis.botProbability, rD.aiAnalysis.botProbability, false)}
                  />
                  <CompareRow
                    label="Total Transactions"
                    leftVal={lD.addressInfo.tx_count.toLocaleString()}
                    rightVal={rD.addressInfo.tx_count.toLocaleString()}
                    winner={winner(lD.addressInfo.tx_count, rD.addressInfo.tx_count)}
                  />
                  <CompareRow
                    label="Unique Interactions"
                    leftVal={lD.metrics.uniqueInteractions.toLocaleString()}
                    rightVal={rD.metrics.uniqueInteractions.toLocaleString()}
                    winner={winner(lD.metrics.uniqueInteractions, rD.metrics.uniqueInteractions)}
                  />
                  <CompareRow
                    label="Balance (ETH)"
                    leftVal={formatEth(lD.addressInfo.balance)}
                    rightVal={formatEth(rD.addressInfo.balance)}
                    winner={winner(Number(lD.addressInfo.balance), Number(rD.addressInfo.balance))}
                  />
                  <CompareRow
                    label="Volume Out (ETH)"
                    leftVal={formatEth(lD.metrics.totalVolumeOut)}
                    rightVal={formatEth(rD.metrics.totalVolumeOut)}
                    winner={winner(Number(lD.metrics.totalVolumeOut), Number(rD.metrics.totalVolumeOut))}
                  />
                  <CompareRow
                    label="TX Frequency / day"
                    leftVal={lD.metrics.txFrequencyPerDay.toFixed(2)}
                    rightVal={rD.metrics.txFrequencyPerDay.toFixed(2)}
                    winner={winner(lD.metrics.txFrequencyPerDay, rD.metrics.txFrequencyPerDay)}
                  />
                  <CompareRow
                    label="Wallet Age"
                    leftVal={walletAge(lD.metrics.firstActivity)}
                    rightVal={walletAge(rD.metrics.firstActivity)}
                    winner={
                      lD.metrics.firstActivity && rD.metrics.firstActivity
                        ? winner(new Date(lD.metrics.firstActivity).getTime(), new Date(rD.metrics.firstActivity).getTime(), false)
                        : 'tie'
                    }
                  />
                  <CompareRow
                    label="Classification"
                    leftVal={lD.aiAnalysis.classification.replace('_', ' ')}
                    rightVal={rD.aiAnalysis.classification.replace('_', ' ')}
                    winner="tie"
                  />
                </tbody>
              </table>

              {/* AI summaries */}
              <div className="grid md:grid-cols-2 gap-4 p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg)' }}>
                  <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text)', opacity: 0.5 }}>Address A — AI Summary</div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text)', opacity: 0.7 }}>
                    {lD.aiAnalysis.explanation}
                  </p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg)' }}>
                  <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text)', opacity: 0.5 }}>Address B — AI Summary</div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text)', opacity: 0.7 }}>
                    {rD.aiAnalysis.explanation}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!bothReady && (lD || rD) && (
            <div
              className="p-4 rounded-xl border text-center text-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text)', opacity: 0.4 }}
            >
              Analyze both addresses to see the comparison table
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
