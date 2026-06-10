'use client'

import { ArrowUpRight, ArrowDownLeft, AlertTriangle, Clock } from 'lucide-react'

interface Tx {
  hash: string
  method: string | null
  value: string
  timestamp: string | null
  status: string | null
  from: { hash: string }
  to: { hash: string } | null
}

interface TransactionTableProps {
  transactions: Tx[]
  address: string
  explorerBase?: string
}

function formatValue(wei: string) {
  try {
    const eth = Number(BigInt(wei)) / 1e18
    if (eth === 0) return '0'
    if (eth < 0.0001) return '<0.0001'
    if (eth > 1e6) return `${(eth / 1e6).toFixed(2)}M`
    return eth.toFixed(4)
  } catch {
    return '0'
  }
}

function timeAgo(ts: string | null) {
  if (!ts) return 'pending'
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 365) return `${days}d ago`
  return `${Math.floor(days / 365)}y ago`
}

function truncateMethod(method: string | null): string {
  if (!method) return 'Transfer'
  if (method.length <= 18) return method
  return method.slice(0, 16) + '…'
}

export function TransactionTable({ transactions, address, explorerBase }: TransactionTableProps) {
  const rows = transactions.slice(0, 20)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Hash', 'Type', 'Value', 'Age', 'Dir'].map((h) => (
              <th
                key={h}
                className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wider"
                style={{ color: 'var(--text)', opacity: 0.4 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => {
            const isOut = tx.from.hash.toLowerCase() === address.toLowerCase()
            const isPending = tx.status === null
            const isFailed = tx.status === 'error'
            const dir = isFailed ? 'FAIL' : isPending ? 'PEND' : isOut ? 'OUT' : 'IN'
            const dirColor = isFailed
              ? '#ef4444'
              : isPending
                ? '#9ca3af'
                : isOut
                  ? '#facc15'
                  : '#4ade80'
            const DirIcon = isFailed
              ? AlertTriangle
              : isPending
                ? Clock
                : isOut
                  ? ArrowUpRight
                  : ArrowDownLeft

            const txUrl = explorerBase
              ? `${explorerBase}/tx/${tx.hash}`
              : `#`

            return (
              <tr
                key={tx.hash}
                className="transition-opacity hover:opacity-70"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <td className="py-3 px-3">
                  <a
                    href={txUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs hover:underline"
                    style={{ color: 'var(--accent)' }}
                    title={tx.hash}
                  >
                    {tx.hash.slice(0, 8)}…{tx.hash.slice(-6)}
                  </a>
                </td>
                <td className="py-3 px-3 max-w-[120px]">
                  <span
                    className="text-xs px-2 py-0.5 rounded inline-block truncate max-w-full"
                    style={{ background: 'var(--border)', color: 'var(--text)' }}
                    title={tx.method ?? 'Transfer'}
                  >
                    {truncateMethod(tx.method)}
                  </span>
                </td>
                <td className="py-3 px-3 font-mono text-xs" style={{ color: 'var(--text)' }}>
                  {formatValue(tx.value)}
                </td>
                <td className="py-3 px-3 text-xs whitespace-nowrap" style={{ color: 'var(--text)', opacity: 0.5 }}>
                  {timeAgo(tx.timestamp)}
                </td>
                <td className="py-3 px-3">
                  <span
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap"
                    style={{ background: `${dirColor}22`, color: dirColor }}
                  >
                    <DirIcon size={10} />
                    {dir}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--text)', opacity: 0.4 }}>
          No transactions found for this address
        </div>
      )}
    </div>
  )
}
