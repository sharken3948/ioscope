'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2 } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BrandLogo } from '@/components/BrandLogo'
import { ChainDropdown } from '@/components/ChainDropdown'
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
      <header className="flex items-center justify-between border-b" style={{ borderColor: 'var(--border)', paddingRight: '16px' }}>
        <div style={{ width: '224px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px 0' }}>
          <BrandLogo />
        </div>
        <ThemeToggle />
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-20">
        <div className="w-full max-w-2xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight" style={{ color: 'var(--text)' }}>
            Every address has a story...
            <br />
            <span style={{ color: 'var(--accent)' }}>Scope it!</span>
          </h1>

          <p className="text-base mb-10 max-w-lg mx-auto leading-relaxed" style={{ color: 'var(--text)', opacity: 1 }}>
            Uncover the real story behind any wallet. Risk score, behavior patterns and onchain identity in seconds.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4">
            {/* Search bar with inline chain selector */}
            <div
              className="w-full flex items-center rounded-xl border transition-colors"
              style={{
                background: 'var(--sidebar)',
                borderColor: validationError ? '#ef4444' : 'var(--border)',
              }}
            >
              <ChainDropdown value={chain} onChange={setChain} />

              <input
                type="text"
                value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
                placeholder="0x... wallet or contract address"
                className="flex-1 px-4 py-4 text-sm outline-none font-mono"
                style={{
                  background: 'transparent',
                  color: 'var(--text)',
                }}
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            {validationError && (
              <p className="text-xs text-left w-full -mt-2" style={{ color: '#ef4444' }}>
                {validationError}
              </p>
            )}

            {/* SCOPE! button — centered below the search bar */}
            <button
              type="submit"
              disabled={!address.trim() || loading}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 w-full"
              style={{
                maxWidth: '200px',
                background: 'var(--accent)',
                color: '#0d1117',
              }}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              SCOPE!
            </button>
          </form>

          <p className="text-xs mt-8 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Works with any EVM wallet or contract address.
          </p>
        </div>
      </main>
    </div>
  )
}
