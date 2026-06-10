'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'

export function BrandLogo() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const src = mounted
    ? resolvedTheme === 'dark' ? '/logo-dark.png' : '/logo-light.png'
    : '/logo-dark.png'

  return (
    <Link href="/" className="no-underline" style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent' }}>
      <div style={{ width: '260px', height: '167px', flexShrink: 0 }}>
        <img
          src={src}
          alt="ioscope"
          style={{ width: '260px', height: '167px', objectFit: 'contain', display: 'block' }}
        />
      </div>
    </Link>
  )
}
