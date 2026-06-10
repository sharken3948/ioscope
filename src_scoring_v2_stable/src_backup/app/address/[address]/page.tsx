'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import {
  Download,
  ArrowLeft,
  Activity,
  Wallet,
  Zap,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Shield,
} from 'lucide-react'
import { Sidebar } from '@/components/Sidebar'
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
    totalVolumeIn: string
    totalVolumeOut: string
    volumeSymbol: string
    netVolume: string
    avgTxSize: string
    largestTx: string
    firstActivity: string | null
    lastActivity: string | null
    uniqueInteractions: number
    txFrequencyPerDay: number
    activeDays: number | null
    activeWeeks: number | null
    activeMonths: number | null
    totalGasUSD: string | null
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
  aiAnalysis: {
    riskScore: number
    botProbability: number
    patterns: string[]
    explanation: string
    classification: string
  }
}

const CHAIN_LABELS: Record<Chain, string> = {
  arc: 'ARC Testnet',
  ethereum: 'Ethereum',
  base: 'Base',
  soneium: 'Soneium',
}

const EXPLORER_BASES: Record<Chain, string> = {
  arc: 'https://testnet.arcscan.app',
  ethereum: 'https://eth.blockscout.com',
  base: 'https://base.blockscout.com',
  soneium: 'https://soneium.blockscout.com',
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    High: { color: '#ef4444', bg: '#ef444422' },
    Medium: { color: '#facc15', bg: '#facc1522' },
    Low: { color: '#4ade80', bg: '#4ade8022' },
    Unknown: { color: '#9ca3af', bg: '#9ca3af22' },
  }
  const s = map[level] ?? map.Unknown
  return (
    <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ color: s.color, background: s.bg }}>
      {level}
    </span>
  )
}

function PatternRow({ label, detected }: { label: string; detected: boolean }) {
  return (
    <div
      className="flex items-center justify-between py-2.5"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <span className="text-sm" style={{ color: 'var(--text)', opacity: 0.75 }}>
        {label}
      </span>
      {detected ? (
        <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#ef4444' }}>
          <AlertCircle size={12} /> Detected
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text)', opacity: 0.35 }}>
          <CheckCircle size={12} /> Clear
        </span>
      )}
    </div>
  )
}

const WEI_PER_ETH = BigInt('1000000000000000000')

/** Convert a wei string to a human-readable ETH value using BigInt division to preserve precision */
function formatEth(weiStr: string | null | undefined): string {
  if (!weiStr || weiStr === '0') return '0 ETH'
  try {
    const wei = BigInt(weiStr)
    const ethWhole = wei / WEI_PER_ETH
    const remainder = wei % WEI_PER_ETH
    // Build a precise decimal without floating-point rounding of the integer part
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

/** Format a pre-divided whole-unit volume (USDC or ETH integer) with comma separator. */
function formatVolume(raw: string | null | undefined, symbol: string): string {
  if (!raw || raw === '0') return `0 ${symbol}`
  try {
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
      chain: CHAIN_LABELS[chain],
      txCount: data.addressInfo.tx_count,
      balance: data.addressInfo.balance,
      firstActivity: data.metrics.firstActivity,
      lastActivity: data.metrics.lastActivity,
      uniqueInteractions: data.metrics.uniqueInteractions,
      txFrequencyPerDay: data.metrics.txFrequencyPerDay,
      totalVolumeIn: data.metrics.totalVolumeIn,
      totalVolumeOut: data.metrics.totalVolumeOut,
      riskScore: data.aiAnalysis.riskScore,
      botProbability: data.aiAnalysis.botProbability,
      patterns: data.aiAnalysis.patterns,
      explanation: data.aiAnalysis.explanation,
      classification: data.aiAnalysis.classification,
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

  const explorerBase = EXPLORER_BASES[chain]
  const dp = data?.detectedPatterns

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-4 md:px-6 py-3 border-b gap-3"
          style={{ borderColor: 'var(--border)', background: 'var(--sidebar)' }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="md:hidden shrink-0">
              <BrandLogo size="sm" />
            </div>
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-lg hover:opacity-70 transition-opacity shrink-0"
              style={{ color: 'var(--text)' }}
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="font-mono text-xs md:text-sm font-semibold truncate max-w-[160px] sm:max-w-xs"
                  style={{ color: 'var(--text)' }}
                  title={address}
                >
                  {address}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded font-semibold shrink-0"
                  style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                >
                  {CHAIN_LABELS[chain]}
                </span>
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
                    style={{ background: 'var(--border)', color: 'var(--text)', opacity: 0.7 }}
                  >
                    Contract
                  </span>
                )}
              </div>
              {data && (
                <div
                  className="text-xs mt-0.5 flex items-center gap-1"
                  style={{ color: 'var(--text)', opacity: 0.4 }}
                >
                  <Clock size={10} />
                  {formatDate(data.metrics.firstActivity)} → {formatDate(data.metrics.lastActivity)}
                </div>
              )}
            </div>
          </div>

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
                <div className="text-xs mt-1" style={{ color: 'var(--text)', opacity: 0.4 }}>
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
              {/* Metric cards */}
              <section id="overview">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <MetricCard
                    label="Total TX"
                    value={data.addressInfo.tx_count.toLocaleString()}
                    icon={<Activity size={14} />}
                  />
                  <MetricCard
                    label="Contracts"
                    value={data.metrics.uniqueInteractions.toLocaleString()}
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
                    value={data.primaryBalance.symbol === 'ETH'
                      ? formatEth(data.primaryBalance.value)
                      : data.primaryBalance.value}
                    icon={<Wallet size={14} />}
                  />
                  <MetricCard
                    label="TX Volume Out"
                    value={formatVolume(data.metrics.totalVolumeOut, data.metrics.volumeSymbol)}
                    sub={`${data.metrics.txFrequencyPerDay.toFixed(1)} tx/day`}
                    icon={<TrendingUp size={14} />}
                  />
                  <MetricCard
                    label="Active Days"
                    value={data.metrics.activeDays?.toLocaleString() ?? '—'}
                    sub={data.metrics.activeMonths != null ? `${data.metrics.activeMonths} active months` : undefined}
                    icon={<Activity size={14} />}
                  />
                </div>
              </section>

              {/* Classification + Risk */}
              <section className="grid md:grid-cols-2 gap-4">
                <div
                  className="rounded-xl border p-5 flex flex-col gap-3"
                  style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                >
                  <div
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text)', opacity: 0.4 }}
                  >
                    User Classification
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <DonutChart
                      botProbability={data.aiAnalysis.botProbability}
                      classification={data.aiAnalysis.classification}
                      patterns={data.aiAnalysis.patterns}
                    />
                  </div>
                </div>

                <div
                  id="risk"
                  className="rounded-xl border p-5 flex flex-col gap-3"
                  style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                >
                  <div
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text)', opacity: 0.4 }}
                  >
                    Risk Score
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center gap-2">
                    <RiskGauge score={data.aiAnalysis.riskScore} />
                    <p
                      className="text-xs text-center leading-relaxed max-w-xs"
                      style={{ color: 'var(--text)', opacity: 0.55 }}
                    >
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
                    style={{ color: 'var(--text)', opacity: 0.4 }}
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
                            <div
                              className="font-mono text-xs"
                              style={{ color: 'var(--text)', opacity: 0.7 }}
                            >
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
                      style={{ color: 'var(--text)', opacity: 0.4 }}
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
                    style={{ color: 'var(--text)', opacity: 0.4 }}
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
                                style={{ color: 'var(--text)', opacity: 0.5 }}
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
                      style={{ color: 'var(--text)', opacity: 0.4 }}
                    >
                      <CheckCircle size={14} style={{ color: '#4ade80' }} />
                      No contract interactions in recent transactions
                    </div>
                  )}
                </div>
              </section>

              {/* Behavior patterns — driven by detectedPatterns from API */}
              <section id="behavior">
                <div
                  className="rounded-xl border p-5"
                  style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
                >
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: 'var(--text)', opacity: 0.4 }}
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
                  {data.aiAnalysis.patterns.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {data.aiAnalysis.patterns.map((p, i) => (
                        <span
                          key={i}
                          className="text-xs px-2.5 py-1 rounded-full border"
                          style={{ borderColor: 'var(--border)', color: 'var(--text)', opacity: 0.7 }}
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
                      style={{ color: 'var(--text)', opacity: 0.4 }}
                    >
                      Recent Transactions
                      <span
                        className="ml-2 font-normal normal-case"
                        style={{ color: 'var(--text)', opacity: 0.4 }}
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
