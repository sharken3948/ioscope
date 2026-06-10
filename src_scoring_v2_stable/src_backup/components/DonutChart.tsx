'use client'

import { PieChart, Pie, Cell, Tooltip } from 'recharts'

interface DonutChartProps {
  botProbability: number
  classification: string
  patterns: string[]
}

const TAGS: Record<string, string> = {
  whale: 'Whale',
  defi_user: 'DeFi User',
  bot: 'Bot',
  contract: 'Smart Contract',
  regular: 'Regular User',
  unknown: 'Unknown',
}

export function DonutChart({ botProbability, classification, patterns }: DonutChartProps) {
  const humanPct = Math.max(0, 100 - botProbability)
  const data = [
    { name: 'Human', value: humanPct },
    { name: 'Bot', value: botProbability },
  ]

  const COLORS = ['#4ade80', '#ef4444']

  return (
    <div className="flex flex-col items-center gap-4">
      <div style={{ width: 160, height: 160 }}>
        <PieChart width={160} height={160}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'var(--sidebar)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              formatter={(value) => [`${Number(value).toFixed(1)}%`]}
            />
        </PieChart>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{humanPct.toFixed(0)}%</div>
        <div className="text-xs" style={{ color: 'var(--text)', opacity: 0.5 }}>Real User Probability</div>
      </div>
      <div className="flex flex-wrap gap-1.5 justify-center">
        <span
          className="text-xs px-2.5 py-1 rounded-full font-medium"
          style={{ background: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44' }}
        >
          {TAGS[classification] ?? classification}
        </span>
        {patterns.slice(0, 3).map((p, i) => (
          <span
            key={i}
            className="text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'var(--border)', color: 'var(--text)', opacity: 0.7 }}
          >
            {p}
          </span>
        ))}
      </div>
    </div>
  )
}
