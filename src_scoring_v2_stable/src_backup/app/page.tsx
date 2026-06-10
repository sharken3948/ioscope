'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2 } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BrandLogo } from '@/components/BrandLogo'
import { ChainSelector } from '@/components/ChainSelector'
import type { Chain } from '@/lib/blockscout'

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

export default function HomePage() {
  const router = useRouter()
  const [address, setAddress] = useState('')
  const [chain, setChain] = useState<Chain>('arc')
  const [loading, setLoading] = useState(false)
  const [validationError, setValidationError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = address.trim()
    if (!trimmed) return
    if (!ETH_ADDRESS_RE.test(trimmed)) {
      setValidationError('Enter a valid Ethereum address (0x followed by 40 hex characters)')
      return
    }
    setValidationError('')
    setLoading(true)
    router.push(`/address/${trimmed}?chain=${chain}`)
  }

  function handleAddressChange(v: string) {
    setAddress(v)
    if (validationError) setValidationError('')
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <BrandLogo />
        <ThemeToggle />
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-20">
        <div className="w-full max-w-2xl text-center">
          <div
            className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border"
            style={{ background: 'var(--accent)18', color: 'var(--accent)', borderColor: 'var(--accent)44' }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
            AI-Powered Blockchain Intelligence
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight" style={{ color: 'var(--text)' }}>
            Analyze any{' '}
            <span style={{ color: 'var(--accent)' }}>address</span>
            <br />on-chain
          </h1>

          <p className="text-base mb-10 max-w-lg mx-auto leading-relaxed" style={{ color: 'var(--text)', opacity: 0.55 }}>
            Deep risk scoring, bot detection, pattern analysis, and behavioral profiling — powered by Blockscout and Groq AI.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2"
                size={18}
                style={{ color: 'var(--text)', opacity: 0.35 }}
              />
              <input
                type="text"
                value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
                placeholder="0x... wallet or contract address"
                className="w-full pl-11 pr-4 py-4 rounded-xl text-sm outline-none border transition-colors font-mono"
                style={{
                  background: 'var(--sidebar)',
                  borderColor: validationError ? '#ef4444' : 'var(--border)',
                  color: 'var(--text)',
                }}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            {validationError && (
              <p className="text-xs text-left -mt-2" style={{ color: '#ef4444' }}>
                {validationError}
              </p>
            )}

            <div className="flex items-center justify-between flex-wrap gap-3">
              <ChainSelector value={chain} onChange={setChain} />
              <button
                type="submit"
                disabled={!address.trim() || loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
                style={{
                  background: 'var(--accent)',
                  color: '#0d1117',
                }}
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                Analyze
              </button>
            </div>
          </form>

          <p className="text-xs mt-8 leading-relaxed" style={{ color: 'var(--text)', opacity: 0.35 }}>
            Supports EVM-compatible wallets and smart contracts.
            <br />
            Data sourced from Blockscout explorer APIs.
          </p>
        </div>
      </main>
    </div>
  )
}
