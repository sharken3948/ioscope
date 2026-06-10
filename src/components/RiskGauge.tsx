'use client'

interface RiskGaugeProps {
  score: number
}

export function RiskGauge({ score }: RiskGaugeProps) {
  const clampedScore = Math.max(0, Math.min(100, score))
  const color =
    clampedScore <= 33 ? '#4ade80' : clampedScore <= 66 ? '#facc15' : '#ef4444'
  const label =
    clampedScore <= 33 ? 'Low Risk' : clampedScore <= 66 ? 'Medium Risk' : 'High Risk'

  // SVG arc gauge: 180° arc (semi-circle)
  const radius = 60
  const cx = 80
  const cy = 80
  const startAngle = -180
  const endAngle = 0

  function polarToCartesian(angle: number) {
    const rad = (angle * Math.PI) / 180
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    }
  }

  function describeArc(start: number, end: number) {
    const s = polarToCartesian(start)
    const e = polarToCartesian(end)
    const largeArc = end - start > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`
  }

  const scoreAngle = startAngle + (clampedScore / 100) * (endAngle - startAngle)
  const needle = polarToCartesian(scoreAngle)

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="160" height="90" viewBox="0 0 160 90">
        {/* Background arc */}
        <path
          d={describeArc(startAngle, endAngle)}
          fill="none"
          stroke="var(--border)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d={describeArc(startAngle, scoreAngle)}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Needle dot */}
        <circle cx={needle.x} cy={needle.y} r="5" fill={color} />
        {/* Center score */}
        <text
          x={cx}
          y={cy + 8}
          textAnchor="middle"
          fontSize="22"
          fontWeight="bold"
          fill="var(--text)"
        >
          {clampedScore}
        </text>
        {/* Scale labels */}
        <text x="14" y="88" fontSize="9" fill="var(--text)" opacity="0.4">0</text>
        <text x="148" y="88" fontSize="9" fill="var(--text)" opacity="0.4" textAnchor="end">100</text>
      </svg>
      <span
        className="text-sm font-semibold px-3 py-1 rounded-full"
        style={{ background: `${color}22`, color }}
      >
        {label}
      </span>
    </div>
  )
}
