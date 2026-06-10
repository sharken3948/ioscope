'use client'

import { PieChart, Pie, Cell, Tooltip } from 'recharts'

interface DonutChartProps {
  botProbability: number
  classification: string
  patterns: string[]
}

export function DonutChart({ botProbability }: DonutChartProps) {
  const humanPct = Math.max(0, 100 - botProbability)
  const chartData = [
    { name: 'Human', value: humanPct },
    { name: 'Bot', value: botProbability },
  ]
  const COLORS = ['#4ade80', '#ef4444']

  return (
    <div className="flex flex-col items-center gap-2">
      <div style={{ width: 140, height: 140 }}>
        <PieChart width={140} height={140}>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={42}
            outerRadius={62}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
          >
            {chartData.map((_, index) => (
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
        <div className="text-lg font-bold" style={{ color: '#4ade80' }}>{humanPct.toFixed(0)}%</div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Real User</div>
      </div>
    </div>
  )
}
