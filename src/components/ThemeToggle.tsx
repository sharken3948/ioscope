'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-11 h-11 mr-6" />

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="flex items-center justify-center w-11 h-11 rounded-lg border transition-colors mr-6"
      style={{ borderColor: 'var(--border)', background: 'transparent', color: 'var(--text)' }}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
    </button>
  )
}
