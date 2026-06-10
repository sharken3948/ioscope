'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ArrowLeftRight,
  Zap,
  ShieldAlert,
  Activity,
  Bookmark,
  GitCompare,
} from 'lucide-react'
import { BrandLogo } from './BrandLogo'

const NAV_ITEMS = [
  { label: 'Overview', icon: LayoutDashboard, href: '#overview' },
  { label: 'Transactions', icon: ArrowLeftRight, href: '#transactions' },
  { label: 'Interactions', icon: Zap, href: '#interactions' },
  { label: 'Risk Analysis', icon: ShieldAlert, href: '#risk' },
  { label: 'Behavior Analysis', icon: Activity, href: '#behavior' },
]

const EXTRA_NAV = [
  { label: 'Watchlist', icon: Bookmark, href: '/watchlist' },
  { label: 'Compare', icon: GitCompare, href: '/compare' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="hidden md:flex flex-col w-56 min-h-screen shrink-0 border-r"
      style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
    >
      <div className="border-b" style={{ borderColor: 'var(--border)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px 0', width: '100%' }}>
        <BrandLogo />
      </div>

      <nav className="flex flex-col p-2 gap-0.5 flex-1">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Analysis
        </div>
        {NAV_ITEMS.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--text)' }}
          >
            <item.icon size={15} />
            {item.label}
          </a>
        ))}

        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-widest mt-4" style={{ color: 'var(--text-muted)' }}>
          Tools
        </div>
        {EXTRA_NAV.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
            style={{
              color: pathname === item.href ? 'var(--accent)' : 'var(--text)',
              background: pathname === item.href ? `var(--accent)18` : 'transparent',
            }}
          >
            <item.icon size={15} />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
