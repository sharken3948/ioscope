'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import {
  Download,
  ArrowLeft,
  Activity,
  Wallet,
  Zap,
  Fuel,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Shield,
  Flame,
  Code2,
} from 'lucide-react'
import { MetricCard } from '@/components/MetricCard'
import { RiskGauge } from '@/components/RiskGauge'
import { DonutChart } from '@/components/DonutChart'
import { TransactionTable } from '@/components/TransactionTable'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BrandLogo } from '@/components/BrandLogo'
import { generateReport } from '@/lib/pdf'
import type { Chain } from '@/lib/blockscout'

interface AnalysisResult {
  addressInfo: {
    hash: string
    is_contract: boolean
    name: string | null
    balance: string
    tx_count: number
    token_transfers_count: number
    is_scam: boolean
    is_verified: boolean
    creation_tx_hash: string | null
    ens_domain_name: string | null
    public_tags: string[]
  }
  transactions: Array<{
    hash: string
    method: string | null
    value: string
    timestamp: string | null
    status: string | null
    from: { hash: string }
    to: { hash: string } | null
  }>
  metrics: {
    txCount: number
    totalVolumeIn: string
    tokenVolumeOut: string
    volumeSymbol: string
    firstActivity: string | null
    lastActivity: string | null
    txFrequencyPerDay: number
    activeDaySpread: number
    activeWeeks: number
    activeMonths: number
    longestActiveStreak: number
    uniqueContracts: number
    uniqueMethods: number
    deployedContractCount: number
    totalPortfolioUSD: number
    peakHours: number[]
    usdcBalance: string | null
    gasUsed: number | null
    gasSpent: number | null
    gasToken: string
  }
  detectedPatterns: {
    mev: boolean
    honeypot: boolean
    highVolumeShortAge: boolean
    repeatedCalls: boolean
    bridge: boolean
  }
  primaryBalance: { value: string; symbol: string; label: string }
  riskyContracts: Array<{ address: string; name: string | null }>
  contractInteractions: Array<{
    address: string
    name: string | null
    callCount: number
    topMethod: string | null
    totalValueSent: string
  }>
  topContracts: Array<{ address: string; name: string | null; callCount: number }>
  topMethods: Array<{ method: string; count: number }>
  riskScore: number
  botProbability: number
  riskFactors: Array<{ label: string; impact: string }>
  advice: string[]
  aiAnalysis: {
    patterns: string[]
    explanation: string
    classification: string
    userType: string
    txTypeBreakdown: Record<string, number>
    activityPattern: string
  }
}

const CHAIN_LABELS: Record<Chain, string> = {
  arc: 'ARC Testnet',
  base: 'Base Mainnet',
  soneium: 'Soneium Mainnet',
}

const EXPLORER_BASES: Record<Chain, string> = {
  arc: 'https://testnet.arcscan.app',
  base: 'https://base.blockscout.com',
  soneium: 'https://soneium.blockscout.com',
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    High: { color: '#ef4444', bg: '#ef444422' },
    Medium: { color: '#facc15', bg: '#facc1522' },
    Low: { color: '#4ade80', bg: '#4ade8022' },
    Unknown: { color: 'var(--text-muted)', bg: '#9ca3af22' },
  }
  const s = map[level] ?? map.Unknown
  return (
    <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ color: s.color, background: s.bg }}>
      {level}
    </span>
  )
}

function PublicTagBadge({ tag }: { tag: string }) {
  const lower = tag.toLowerCase()
  const isDanger = ['bot', 'mev', 'scam', 'hack', 'exploit'].some((k) => lower.includes(k))
  const isSafe = ['foundation', 'team', 'verified', 'safe'].some((k) => lower.includes(k))

  if (isDanger) {
    return (
      <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444' }}>
        {tag}
      </span>
    )
  }
  if (isSafe) {
    return (
      <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}>
        {tag}
      </span>
    )
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: '#60a5fa22', color: '#60a5fa', border: '1px solid #60a5fa44' }}>
      {tag}
    </span>
  )
}

function PatternRow({ label, detected }: { label: string; detected: boolean }) {
  return (
    <div
      className="flex items-center justify-between py-2.5"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      {detected ? (
        <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#ef4444' }}>
          <AlertCircle size={12} /> Detected
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <CheckCircle size={12} /> Clear
        </span>
      )}
    </div>
  )
}

const WEI_PER_ETH = BigInt('1000000000000000000')

function formatEth(weiStr: string | null | undefined): string {
  if (!weiStr || weiStr === '0') return '0 ETH'
  try {
    const wei = BigInt(weiStr)
    const ethWhole = wei / WEI_PER_ETH
    const remainder = wei % WEI_PER_ETH
    const fracStr = remainder.toString().padStart(18, '0').slice(0, 6)
    const eth = Number(`${ethWhole}.${fracStr}`)
    if (eth === 0) return '0 ETH'
    if (eth < 0.0001) return '<0.0001 ETH'
    if (eth > 1e9) return `${(eth / 1e9).toFixed(2)}B ETH`
    if (eth > 1e6) return `${(eth / 1e6).toFixed(2)}M ETH`
    if (eth > 1000) return `${eth.toFixed(2)} ETH`
    return `${eth.toFixed(4)} ETH`
  } catch {
    return '0 ETH'
  }
}

function formatVolume(raw: string | null | undefined, symbol: string): string {
  if (!raw || raw === '0') return `0 ${symbol}`
  try {
    if (symbol === 'ETH') return formatEth(raw)
    return `${Math.floor(Number(raw)).toLocaleString('en-US')} ${symbol}`
  } catch {
    return `0 ${symbol}`
  }
}

function formatDate(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function DashboardInner() {
  const params = useParams<{ address: string }>()
  const address = params.address
  const searchParams = useSearchParams()
  const router = useRouter()
  const chain = (searchParams.get('chain') ?? 'arc') as Chain

  const [data, setData] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scopeAddress, setScopeAddress] = useState('')

  function runAnalysis() {
    setLoading(true)
    setError(null)
    setData(null)

    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, chain }),
    })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error((json as { error: string }).error ?? 'Analysis failed')
        setData(json as AnalysisResult)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (address) runAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chain])

  function handleDownload() {
    if (!data) return
    generateReport({
      address,
      chain,
      addressInfo: {
        balance: data.addressInfo.balance,
        is_contract: data.addressInfo.is_contract,
        name: data.addressInfo.name,
        is_scam: data.addressInfo.is_scam,
        is_verified: data.addressInfo.is_verified,
        ens_domain_name: data.addressInfo.ens_domain_name,
        public_tags: data.addressInfo.public_tags,
      },
      metrics: {
        txCount: data.metrics.txCount,
        firstActivity: data.metrics.firstActivity,
        lastActivity: data.metrics.lastActivity,
        uniqueContracts: data.metrics.uniqueContracts,
        txFrequencyPerDay: data.metrics.txFrequencyPerDay,
        totalVolumeIn: data.metrics.totalVolumeIn,
        tokenVolumeOut: data.metrics.tokenVolumeOut,
        volumeSymbol: data.metrics.volumeSymbol,
        activeDaySpread: data.metrics.activeDaySpread,
        activeMonths: data.metrics.activeMonths,
        longestActiveStreak: data.metrics.longestActiveStreak,
        deployedContractCount: data.metrics.deployedContractCount,
        gasSpent: data.metrics.gasSpent,
        peakHours: data.metrics.peakHours,
        usdcBalance: data.metrics.usdcBalance,
        gasToken: data.metrics.gasToken,
      },
      riskScore: data.riskScore,
      botProbability: data.botProbability,
      riskFactors: data.riskFactors,
      advice: data.advice,
      aiAnalysis: data.aiAnalysis,
      detectedPatterns: data.detectedPatterns,
      riskyContracts: data.riskyContracts,
      contractInteractions: data.contractInteractions,
      topContracts: data.topContracts,
      topMethods: data.topMethods,
      transactions: data.transactions.map((tx) => ({
        hash: tx.hash,
        from: tx.from.hash,
        to: tx.to?.hash ?? null,
        value: tx.value,
        method: tx.method,
        timestamp: tx.timestamp,
        status: tx.status ?? 'pending',
      })),
    })
  }

  function handleScopeAnother(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = scopeAddress.trim()
    if (!trimmed.startsWith('0x') || trimmed.length !== 42) return
    router.push(`/address/${trimmed}?chain=arc`)
  }

  const explorerBase = EXPLORER_BASES[chain]
  const dp = data?.detectedPatterns

  const daysSinceActive = data?.metrics.lastActivity
    ? Math.floor((Date.now() - new Date(data.metrics.lastActivity).getTime()) / 86400000)
    : null
  const lastActiveText =
    daysSinceActive === null ? 'Unknown'
    : daysSinceActive === 0 ? 'Today'
    : daysSinceActive === 1 ? 'Yesterday'
    : daysSinceActive < 30 ? `${daysSinceActive} days ago`
    : daysSinceActive < 365 ? `${Math.floor(daysSinceActive / 30)} months ago`
    : `${Math.floor(daysSinceActive / 365)} years ago`

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="flex items-center px-4 md:px-6 py-3 border-b gap-4"
          style={{ borderColor: 'var(--border)', background: 'var(--sidebar)' }}
        >
          {/* Left: logo + back */}
          <div className="flex items-center gap-2 shrink-0">
            <BrandLogo />
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text)' }}
            >
              <ArrowLeft size={16} />
            </button>
          </div>

          {/* Center: address info + scope form */}
          <div className="flex-1 min-w-0">
            {data?.addressInfo.ens_domain_name && (
              <div className="text-base font-bold mb-0.5" style={{ color: 'var(--text)' }}>
                {data.addressInfo.ens_domain_name}
              </div>
            )}
            <div className="flex items-center flex-wrap gap-2">
              <div className="flex flex-col items-start gap-1 md:flex-row md:items-center md:gap-3 shrink-0">
                <span
                  className="text-sm md:text-[15px]"
                  style={{
                    color: data?.addressInfo.ens_domain_name ? 'var(--text-muted)' : 'var(--text)',
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                    fontWeight: 600,
                    letterSpacing: '0.03em',
                  }}
                  title={address}
                >
                  <span className="md:hidden">{address.slice(0, 10)}…{address.slice(-8)}</span>
                  <span className="hidden md:inline">{address}</span>
                </span>
                <span
                  className="flex items-center gap-1.5 md:gap-2.5 px-2.5 md:px-4 py-1 md:py-1.5 rounded-lg font-bold text-sm md:text-[18px]"
                  style={{ background: 'var(--accent)28', color: 'var(--accent)', letterSpacing: '0.01em', border: '1.5px solid var(--accent)55' }}
                >
                  <span
                    className="inline-block rounded-full shrink-0 w-2 h-2 md:w-3 md:h-3"
                    style={{
                      background: 'var(--accent)',
                      boxShadow: '0 0 8px var(--accent)',
                      animation: 'arc-pulse 2s ease-in-out infinite',
                    }}
                  />
                  {CHAIN_LABELS[chain]}
                </span>
              </div>
              {data?.addressInfo.is_scam && (
                <span
                  className="text-xs px-2 py-0.5 rounded font-semibold shrink-0"
                  style={{ background: '#ef444422', color: '#ef4444' }}
                >
                  ⚠ Scam
                </span>
              )}
              {data?.addressInfo.is_contract && (
                <span
                  className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{ background: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  Contract
                </span>
              )}
              {data?.addressInfo.public_tags.map((tag) => (
                <PublicTagBadge key={tag} tag={tag} />
              ))}
            </div>
            {data && (
              <div
                className="text-xs mt-0.5 flex items-center gap-1"
                style={{ color: 'var(--text-muted)' }}
              >
                <Clock size={10} />
                {formatDate(data.metrics.firstActivity)} → {formatDate(data.metrics.lastActivity)}
              </div>
            )}
            <form onSubmit={handleScopeAnother} className="hidden md:flex items-center gap-2 mt-2">
              <input
                type="text"
                value={scopeAddress}
                onChange={(e) => setScopeAddress(e.target.value)}
                placeholder="0x... wallet or contract address"
                className="px-3 py-2 rounded-lg border font-mono outline-none"
                style={{
                  background: 'var(--sidebar)',
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  width: '100%',
                  maxWidth: '500px',
                }}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!scopeAddress.trim()}
                className="px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 shrink-0"
                style={{ background: 'var(--accent)', color: '#0d1117' }}
              >
                Scope
              </button>
            </form>
          </div>

          {/* Right: explorer + download + toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`${explorerBase}/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="hidden md:flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text)' }}
            >
              <ExternalLink size={12} /> Explorer
            </a>
            <button
              onClick={handleDownload}
              disabled={!data || loading}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-40 hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--sidebar)' }}
            >
              <Download size={13} />
              Download Report
            </button>
            <ThemeToggle />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <div className="text-center">
                <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Analyzing address…
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Fetching on-chain data and running AI risk scoring
                </div>
              </div>
            </div>
          )}

          {error && (
            <div
              className="flex items-start gap-3 p-4 rounded-xl border"
              style={{ borderColor: '#ef444444', background: '#ef444411', color: '#ef4444' }}
            >
              <XCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm">Analysis Failed</div>
                <div className="text-xs mt-0.5 opacity-80">{error}</div>
                <button onClick={runAnalysis} className="mt-2 text-xs underline opacity-70 hover:opacity-100">
                  Retry
                </button>
              </div>
            </div>
          )}

          {data && !loading && (
            <div className="flex flex-col gap-5">
              {/* Overview metric cards */}
              <section id="overview">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  <MetricCard
                    label="Total TX"
                    value={data.metrics.txCount.toLocaleString()}
                    icon={<Activity size={14} />}
                  />
                  <MetricCard
                    label="Contracts"
                    value={data.metrics.uniqueContracts.toLocaleString()}
                    sub="unique contracts interacted"
                    icon={<Zap size={14} />}
                  />
                  <MetricCard
                    label="First Transaction"
                    value={formatDate(data.metrics.firstActivity)}
                    icon={<Clock size={14} />}
                  />
                  <MetricCard
                    label={data.primaryBalance.label}
                    value={
                      data.metrics.usdcBalance != null
                        ? data.metrics.usdcBalance
                        : formatEth(data.primaryBalance.value)
                    }
                    icon={<Wallet size={14} />}
                  />
                  <MetricCard
                    label="TX Volume Out"
                    value={formatVolume(data.metrics.tokenVolumeOut, data.metrics.volumeSymbol)}
                    sub={`${data.metrics.txFrequencyPerDay.toFixed(1)} tx/day`}
                    icon={<TrendingUp size={14} />}
                  />
                  <MetricCard
                    label="Active Days"
                    value={data.metrics.activeDaySpread.toLocaleString()}
                    sub={`${data.metrics.activeMonths} active months`}
                    icon={<Activity size={14} />}
                  />
                  <MetricCard
                    label="Gas Spent"
                    value={data.metrics.gasSpent?.toFixed(data.metrics.gasToken === 'ETH' ? 4 : 2) ?? '—'}
                    sub={data.metrics.gasToken}
                    icon={<Fuel size={14} />}
                  />
                  <MetricCard
                    label="Longest Streak"
                    value={`${data.metrics.longestActiveStreak} days`}
                    icon={<Flame size={14} />}
                  />
                  <MetricCard
                    label="Deployed Contracts"
                    value={(data.metrics.deployedContractCount ?? 0).toLocaleString()}
                    icon={<Code2 size={14} />}
                  />
                  <MetricCard
                    label="Last Active"
                    value={lastActiveText}
                    icon={<Clock size={14} />}
                  />
                </div>
              </section>

              {/* Top Contracts + Top Methods */}
              {(data.topContracts.length > 0 || data.topMethods.length > 0) && (
                <section id="top-activity">
                  <div className="grid md:grid-cols-2 gap-4">
                    {data.topContracts.length > 0 && (
                      <div
                        className="rounded-xl border p-5"
                        style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                      >
                        <div
                          className="text-xs font-semibold uppercase tracking-wider mb-3"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Top Contracts
                        </div>
                        <div className="flex flex-col gap-2">
                          {data.topContracts.map((c) => (
                            <div key={c.address} className="flex items-center justify-between gap-2">
                              <a
                                href={`${explorerBase}/address/${c.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs hover:underline truncate"
                                style={{ color: 'var(--accent)' }}
                              >
                                {c.name ?? `${c.address.slice(0, 6)}…${c.address.slice(-4)}`}
                              </a>
                              <span
                                className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full"
                                style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                              >
                                {c.callCount}×
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {data.topMethods.length > 0 && (
                      <div
                        className="rounded-xl border p-5"
                        style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                      >
                        <div
                          className="text-xs font-semibold uppercase tracking-wider mb-3"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Top Methods
                        </div>
                        <div className="flex flex-col gap-2">
                          {data.topMethods.map((m) => (
                            <div key={m.method} className="flex items-center justify-between gap-3">
                              <span
                                className="font-mono text-xs truncate"
                                style={{ color: 'var(--text)', opacity: 0.8 }}
                              >
                                {m.method}
                              </span>
                              <span
                                className="text-xs tabular-nums shrink-0"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {m.count}×
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Classification + Risk */}
              <section className="grid md:grid-cols-2 gap-4">
                {/* User Classification */}
                <div
                  className="rounded-xl border p-5 flex flex-col gap-3"
                  style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                >
                  <div
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    User Classification
                  </div>

                  <div className="flex items-center justify-between px-1">
                    <div>
                      <span className="text-xl font-bold" style={{ color: '#ef4444' }}>
                        {data.botProbability}%
                      </span>
                      <span className="text-xs ml-1.5" style={{ color: 'var(--text-muted)' }}>Bot</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-bold" style={{ color: '#4ade80' }}>
                        {100 - data.botProbability}%
                      </span>
                      <span className="text-xs ml-1.5" style={{ color: 'var(--text-muted)' }}>Real User</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center">
                    <DonutChart
                      botProbability={data.botProbability}
                      classification={data.aiAnalysis.classification}
                      patterns={[]}
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-semibold"
                      style={{ background: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44' }}
                    >
                      {data.aiAnalysis.userType}
                    </span>
                    {data.aiAnalysis.activityPattern && data.aiAnalysis.activityPattern.includes(' ') && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {data.aiAnalysis.activityPattern}
                      </span>
                    )}
                  </div>

                  {Object.keys(data.aiAnalysis.txTypeBreakdown).length > 0 && (
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {Object.entries(data.aiAnalysis.txTypeBreakdown)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([k, v]) => `${k} ${v}%`)
                        .join(' · ')}
                    </div>
                  )}

                  {data.advice.length > 0 && (
                    <div className="flex flex-col gap-1 mt-1 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                      {data.advice.map((a, i) => (
                        <div key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          {a}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Risk Score */}
                <div
                  id="risk"
                  className="rounded-xl border p-5 flex flex-col gap-3"
                  style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                >
                  <div
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Risk Score
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <RiskGauge score={data.riskScore} />
                    <div
                      className="text-3xl font-bold tabular-nums"
                      style={{
                        color:
                          data.riskScore >= 60
                            ? '#ef4444'
                            : data.riskScore >= 30
                            ? '#facc15'
                            : '#4ade80',
                      }}
                    >
                      {data.riskScore}/100
                    </div>
                  </div>

                  {data.riskFactors.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {data.riskFactors.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="shrink-0 text-[10px]">
                            {f.impact === 'negative' ? '🔴' : f.impact === 'neutral' ? '🟡' : '🟢'}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>{f.label}</span>
                          <span
                            className="ml-auto font-semibold tabular-nums shrink-0"
                            style={{
                              color: f.impact === 'negative' ? '#ef4444' : f.impact === 'neutral' ? '#facc15' : '#4ade80',
                            }}
                          >
                            {f.impact}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-1 mt-auto pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {data.aiAnalysis.explanation}
                    </p>
                  </div>
                </div>
              </section>

              {/* Contract metadata */}
              {(data.addressInfo.is_contract || data.addressInfo.name) && (
                <section
                  className="rounded-xl border p-4 flex items-center gap-3"
                  style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                >
                  <Shield size={16} style={{ color: 'var(--accent)' }} />
                  <div className="text-sm" style={{ color: 'var(--text)' }}>
                    {data.addressInfo.name && (
                      <span className="font-semibold mr-2">{data.addressInfo.name}</span>
                    )}
                    {data.addressInfo.is_contract && (
                      <span className="opacity-60">
                        Smart contract
                        {data.addressInfo.is_verified ? ' · ✓ Verified' : ' · Unverified'}
                      </span>
                    )}
                  </div>
                </section>
              )}

              {/* Risky contracts */}
              <section id="interactions">
                <div
                  className="rounded-xl border p-5"
                  style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                >
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-3"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Risky Contract Interactions
                  </div>
                  {data.riskyContracts.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {data.riskyContracts.map((c) => (
                        <div
                          key={c.address}
                          className="flex items-center justify-between p-3 rounded-lg"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                        >
                          <div>
                            <div className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                              {c.address.slice(0, 6)}…{c.address.slice(-4)}
                            </div>
                            {c.name && (
                              <div className="text-xs font-medium mt-0.5" style={{ color: 'var(--text)' }}>
                                {c.name}
                              </div>
                            )}
                          </div>
                          <RiskBadge level="High" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 py-1 text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <CheckCircle size={14} style={{ color: '#4ade80' }} />
                      No risky contract interactions detected
                    </div>
                  )}
                </div>
              </section>

              {/* Contract interactions */}
              <section id="contract-interactions">
                <div
                  className="rounded-xl border p-5"
                  style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                >
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-3"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Contract Interactions
                  </div>
                  {data.contractInteractions.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {data.contractInteractions.map((c) => (
                        <div
                          key={c.address}
                          className="flex items-center justify-between gap-3 p-3 rounded-lg"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <a
                                href={`${explorerBase}/address/${c.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs hover:underline"
                                style={{ color: 'var(--accent)' }}
                              >
                                {c.address.slice(0, 6)}…{c.address.slice(-4)}
                              </a>
                              {c.name && (
                                <span className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                                  {c.name}
                                </span>
                              )}
                            </div>
                            {c.topMethod && (
                              <div
                                className="text-xs mt-1 font-mono truncate"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {c.topMethod}
                              </div>
                            )}
                          </div>
                          <span
                            className="text-xs font-bold px-2 py-1 rounded-full shrink-0"
                            style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                          >
                            {c.callCount}×
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 py-1 text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <CheckCircle size={14} style={{ color: '#4ade80' }} />
                      No contract interactions in recent transactions
                    </div>
                  )}
                </div>
              </section>

              {/* Behavior patterns */}
              <section id="behavior">
                <div
                  className="rounded-xl border p-5"
                  style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                >
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Suspicious Behavior Patterns
                  </div>
                  {dp && (
                    <div>
                      <PatternRow label="MEV / Frontrunning" detected={dp.mev} />
                      <PatternRow label="Honeypot Interaction" detected={dp.honeypot} />
                      <PatternRow label="Bridge Usage" detected={dp.bridge} />
                      <PatternRow label="High Volume Short Age" detected={dp.highVolumeShortAge} />
                      <PatternRow label="Repeated Contract Calls" detected={dp.repeatedCalls} />
                    </div>
                  )}

                  {/* Peak hours */}
                  {data.metrics.peakHours.length > 0 && (
                    <div
                      className="mt-3 pt-3 text-xs"
                      style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
                    >
                      Most active at:{' '}
                      <span className="font-semibold" style={{ opacity: 1 }}>
                        {data.metrics.peakHours.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ')} UTC
                      </span>
                    </div>
                  )}

                  {data.aiAnalysis.patterns.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {data.aiAnalysis.patterns.map((p, i) => (
                        <span
                          key={i}
                          className="text-xs px-2.5 py-1 rounded-full border"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Transactions */}
              <section id="transactions">
                <div
                  className="rounded-xl border p-5"
                  style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Recent Transactions
                      <span
                        className="ml-2 font-normal normal-case"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        ({Math.min(data.transactions.length, 20)} of{' '}
                        {data.addressInfo.tx_count.toLocaleString()})
                      </span>
                    </div>
                    <a
                      href={`${explorerBase}/address/${address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--accent)' }}
                    >
                      View all <ExternalLink size={11} />
                    </a>
                  </div>
                  <TransactionTable
                    transactions={data.transactions}
                    address={address}
                    explorerBase={explorerBase}
                  />
                </div>
              </section>

              {/* Mobile download */}
              <button
                onClick={handleDownload}
                className="md:hidden flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm border"
                style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--sidebar)' }}
              >
                <Download size={15} />
                Download PDF Report
              </button>
            </div>
          )}

        </main>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  )
}
