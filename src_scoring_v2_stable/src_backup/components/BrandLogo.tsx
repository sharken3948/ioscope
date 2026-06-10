import Image from 'next/image'
import Link from 'next/link'

interface BrandLogoProps {
  size?: 'sm' | 'md'
}

export function BrandLogo({ size = 'md' }: BrandLogoProps) {
  const logoSize = size === 'sm' ? 28 : 36
  const textClass = size === 'sm' ? 'text-lg' : 'text-xl'

  return (
    <Link href="/" className="flex items-center gap-2.5 no-underline">
      <Image src="/logo.svg" alt="ioScope" width={logoSize} height={logoSize} priority />
      <span className={`font-mono font-bold ${textClass} leading-none`}>
        <span style={{ color: 'var(--text)' }}>io</span>
        <span style={{ color: 'var(--accent)' }}>Scope</span>
      </span>
    </Link>
  )
}
