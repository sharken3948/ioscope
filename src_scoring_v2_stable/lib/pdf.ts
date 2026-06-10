export interface ReportData {
  address: string
  chain: string
  txCount: number
  balance: string
  firstActivity: string | null
  lastActivity: string | null
  uniqueInteractions: number
  txFrequencyPerDay: number
  totalVolumeIn: string
  totalVolumeOut: string
  riskScore: number
  botProbability: number
  patterns: string[]
  explanation: string
  classification: string
  transactions: Array<{
    hash: string
    from: string
    to: string | null
    value: string
    method: string | null
    timestamp: string | null
    status: string | null
  }>
}

export function generateReport(data: ReportData): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  const riskColor =
    data.riskScore <= 33 ? '#16a34a' : data.riskScore <= 66 ? '#eab308' : '#ef4444'
  const riskLabel = data.riskScore <= 33 ? 'Low' : data.riskScore <= 66 ? 'Medium' : 'High'

  const txSymbol = data.chain === 'arc' ? 'USDC' : 'ETH'

  const txRows = data.transactions.slice(0, 10)
    .map(
      (tx) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:11px">${tx.hash.slice(0, 18)}…</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${tx.method ?? 'Transfer'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${(Number(BigInt(tx.value || '0')) / 1e18).toFixed(6)} ${txSymbol}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${tx.status ?? 'pending'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : '—'}</td>
    </tr>`,
    )
    .join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ioScope Report — ${data.address}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; color: #111827; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .brand { color: #16a34a; }
    .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
    .section { margin-bottom: 28px; }
    .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px; }
    .metric { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
    .metric-label { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
    .metric-value { font-size: 18px; font-weight: 700; }
    .risk-badge { display: inline-block; background: ${riskColor}; color: white; padding: 4px 12px; border-radius: 20px; font-weight: 700; font-size: 14px; }
    .risk-score { font-size: 36px; font-weight: 700; color: ${riskColor}; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px; background: #f9fafb; font-size: 11px; text-transform: uppercase; color: #6b7280; }
    .pattern-tag { display: inline-block; background: #fef3c7; border: 1px solid #fcd34d; color: #92400e; padding: 3px 10px; border-radius: 12px; font-size: 12px; margin: 3px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1><span style="color:#111827">io</span><span class="brand">Scope</span> Report</h1>
  <div class="subtitle">Generated ${new Date().toLocaleString()} · Chain: ${data.chain.toUpperCase()}</div>

  <div class="section">
    <div class="section-title">Address</div>
    <code style="font-size:13px;background:#f9fafb;padding:8px 12px;border-radius:6px;display:block">${data.address}</code>
  </div>

  <div class="section">
    <div class="section-title">Key Metrics</div>
    <div class="grid">
      <div class="metric"><div class="metric-label">Total Transactions</div><div class="metric-value">${data.txCount.toLocaleString()}</div></div>
      <div class="metric"><div class="metric-label">Unique Interactions</div><div class="metric-value">${data.uniqueInteractions.toLocaleString()}</div></div>
      <div class="metric"><div class="metric-label">Tx / Day</div><div class="metric-value">${data.txFrequencyPerDay.toFixed(2)}</div></div>
      <div class="metric"><div class="metric-label">First Activity</div><div class="metric-value" style="font-size:14px">${data.firstActivity ? new Date(data.firstActivity).toLocaleDateString() : '—'}</div></div>
      <div class="metric"><div class="metric-label">Last Activity</div><div class="metric-value" style="font-size:14px">${data.lastActivity ? new Date(data.lastActivity).toLocaleDateString() : '—'}</div></div>
      <div class="metric"><div class="metric-label">Classification</div><div class="metric-value" style="font-size:14px;text-transform:capitalize">${data.classification.replace('_', ' ')}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Risk Analysis</div>
    <div style="display:flex;align-items:center;gap:24px;margin-bottom:16px">
      <div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px">Risk Score</div>
        <div class="risk-score">${data.riskScore}<span style="font-size:16px;color:#6b7280">/100</span></div>
        <span class="risk-badge">${riskLabel} Risk</span>
      </div>
      <div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px">Bot Probability</div>
        <div style="font-size:28px;font-weight:700">${data.botProbability}%</div>
      </div>
    </div>
    <p style="color:#374151;line-height:1.6;font-size:14px">${data.explanation}</p>
  </div>

  ${data.patterns.length > 0 ? `
  <div class="section">
    <div class="section-title">Detected Patterns</div>
    <div>${data.patterns.map((p) => `<span class="pattern-tag">${p}</span>`).join('')}</div>
  </div>` : ''}

  <div class="section">
    <div class="section-title">Top 10 Transactions</div>
    <table>
      <thead><tr><th>Hash</th><th>Method</th><th>Value</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${txRows}</tbody>
    </table>
  </div>

  <div style="margin-top:40px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px">
    Generated by ioScope · Powered by Blockscout + Groq AI
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`

  printWindow.document.write(html)
  printWindow.document.close()
}
