export interface ReportData {
  address: string
  chain: string
  addressInfo: {
    balance: string
    is_contract: boolean
    name: string | null
    is_scam: boolean
    is_verified: boolean
    ens_domain_name: string | null
    public_tags: string[]
  }
  metrics: {
    txCount: number
    firstActivity: string | null
    lastActivity: string | null
    uniqueContracts: number
    txFrequencyPerDay: number
    totalVolumeIn: string
    tokenVolumeOut: string
    volumeSymbol: string
    activeDaySpread: number
    activeMonths: number
    longestActiveStreak: number
    deployedContractCount: number
    gasSpent: number | null
    gasToken: string
    peakHours: number[]
    usdcBalance: string | null
  }
  riskScore: number
  botProbability: number
  riskFactors: Array<{ label: string; impact: string }>
  advice: string[]
  aiAnalysis: {
    patterns: string[]
    explanation: string
    classification: string
    userType: string
    txTypeBreakdown: Record<string, number>
    activityPattern: string
  }
  detectedPatterns: {
    mev: boolean
    honeypot: boolean
    highVolumeShortAge: boolean
    repeatedCalls: boolean
    bridge: boolean
  }
  riskyContracts: Array<{ address: string; name: string | null }>
  contractInteractions: Array<{
    address: string
    name: string | null
    callCount: number
    topMethod: string | null
    totalValueSent: string
  }>
  topContracts: Array<{ address: string; name: string | null; callCount: number }>
  topMethods: Array<{ method: string; count: number }>
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

// ── helpers ──────────────────────────────────────────────────────────────────

const WEI = BigInt('1000000000000000000')

function fmtEth(raw: string | null | undefined): string {
  if (!raw || raw === '0') return '0 ETH'
  try {
    const wei = BigInt(raw)
    const whole = wei / WEI
    const frac = (wei % WEI).toString().padStart(18, '0').slice(0, 4)
    const n = Number(`${whole}.${frac}`)
    if (n === 0) return '0 ETH'
    if (n < 0.0001) return '<0.0001 ETH'
    if (n > 1e9) return `${(n / 1e9).toFixed(2)}B ETH`
    if (n > 1e6) return `${(n / 1e6).toFixed(2)}M ETH`
    return `${n.toFixed(4)} ETH`
  } catch { return '0 ETH' }
}

function fmtVolume(raw: string | null | undefined, sym: string): string {
  if (!raw || raw === '0') return `0 ${sym}`
  try {
    if (sym === 'ETH') return fmtEth(raw)
    return `${Math.floor(Number(raw)).toLocaleString('en-US')} ${sym}`
  } catch { return `0 ${sym}` }
}

function fmtDate(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function lastActiveText(lastActivity: string | null): string {
  if (!lastActivity) return 'Unknown'
  const days = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

// ── SVG gauge (replicates RiskGauge component) ────────────────────────────────

function riskGaugeSvg(score: number): string {
  const s = Math.max(0, Math.min(100, score))
  const color = s <= 33 ? '#4ade80' : s <= 66 ? '#facc15' : '#ef4444'
  const textColor = s <= 33 ? '#16a34a' : s <= 66 ? '#d97706' : '#ef4444'
  const label = s <= 33 ? 'Low Risk' : s <= 66 ? 'Medium Risk' : 'High Risk'
  const r = 60, cx = 80, cy = 80

  function pt(angle: number) {
    const rad = (angle * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }
  function arc(a1: number, a2: number) {
    const s2 = pt(a1), e = pt(a2)
    const large = a2 - a1 > 180 ? 1 : 0
    return `M ${s2.x} ${s2.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
  }

  const scoreAngle = -180 + (s / 100) * 180
  const needle = pt(scoreAngle)

  return `
  <svg width="160" height="95" viewBox="0 0 160 95" style="display:block;margin:0 auto">
    <path d="${arc(-180, 0)}" fill="none" stroke="#e5e7eb" stroke-width="12" stroke-linecap="round"/>
    <path d="${arc(-180, scoreAngle)}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"/>
    <circle cx="${needle.x}" cy="${needle.y}" r="5" fill="${color}"/>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="22" font-weight="bold" fill="#111827">${s}</text>
    <text x="14" y="90" font-size="9" fill="#6b7280">0</text>
    <text x="148" y="90" font-size="9" fill="#6b7280" text-anchor="end">100</text>
  </svg>
  <div style="text-align:center;margin-top:6px">
    <span style="display:inline-block;padding:3px 14px;border-radius:20px;font-size:12px;font-weight:700;background:${color}22;color:${textColor}">${label}</span>
  </div>`
}

// ── SVG donut chart (replicates DonutChart component) ─────────────────────────

function donutSvg(botPct: number): string {
  const real = 100 - botPct
  const c = 2 * Math.PI * 50 // circumference at r=50
  const botDash = (botPct / 100) * c
  const realDash = (real / 100) * c
  // bot segment starts at top (-90°), real follows
  const botOffset = 0
  const realOffset = -botDash

  return `
  <svg width="120" height="120" viewBox="0 0 120 120" style="display:block;margin:0 auto">
    <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" stroke-width="16"/>
    <!-- real user (green) -->
    <circle cx="60" cy="60" r="50" fill="none" stroke="#4ade80" stroke-width="16"
      stroke-dasharray="${realDash} ${c - realDash}"
      stroke-dashoffset="${realOffset}"
      transform="rotate(-90 60 60)"/>
    <!-- bot (red) -->
    <circle cx="60" cy="60" r="50" fill="none" stroke="#ef4444" stroke-width="16"
      stroke-dasharray="${botDash} ${c - botDash}"
      stroke-dashoffset="${botOffset}"
      transform="rotate(-90 60 60)"/>
    <text x="60" y="56" text-anchor="middle" font-size="13" font-weight="bold" fill="#111827">${real}%</text>
    <text x="60" y="70" text-anchor="middle" font-size="9" fill="#6b7280">real user</text>
  </svg>`
}

// ── main export ───────────────────────────────────────────────────────────────

export function generateReport(data: ReportData): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  const origin = window.location.origin
  const logoSrc = `${origin}/logo-light.png`

  const riskColor = data.riskScore <= 33 ? '#16a34a' : data.riskScore <= 66 ? '#d97706' : '#ef4444'
  const sym = data.metrics.volumeSymbol

  // ── address badges ────────────────────────────────────────────────────────
  const badges = [
    data.addressInfo.is_scam
      ? `<span style="background:#ef444422;color:#ef4444;border:1px solid #ef444444;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">⚠ Scam</span>`
      : '',
    data.addressInfo.is_contract
      ? `<span style="background:#e5e7eb;color:#6b7280;padding:2px 8px;border-radius:4px;font-size:11px">Contract${data.addressInfo.is_verified ? ' · ✓ Verified' : ''}</span>`
      : '',
    ...data.addressInfo.public_tags.map((t) => {
      const low = t.toLowerCase()
      const danger = ['bot','mev','scam','hack','exploit'].some((k) => low.includes(k))
      const safe = ['foundation','team','verified','safe'].some((k) => low.includes(k))
      const c = danger ? '#ef4444' : safe ? '#4ade80' : '#60a5fa'
      return `<span style="background:${c}22;color:${c};border:1px solid ${c}44;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">${t}</span>`
    }),
  ].filter(Boolean).join(' ')

  // ── metric cards ──────────────────────────────────────────────────────────
  function mc(label: string, value: string, sub = '') {
    return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px">
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${label}</div>
      <div style="font-size:16px;font-weight:700;color:#111827">${value}</div>
      ${sub ? `<div style="font-size:10px;color:#6b7280;margin-top:2px">${sub}</div>` : ''}
    </div>`
  }

  const primaryBal = data.metrics.usdcBalance != null
    ? data.metrics.usdcBalance
    : fmtEth(data.addressInfo.balance)

  const metricCards = [
    mc('Total TX', data.metrics.txCount.toLocaleString()),
    mc('Contracts', data.metrics.uniqueContracts.toLocaleString(), 'unique interacted'),
    mc('First TX', fmtDate(data.metrics.firstActivity)),
    mc('Balance', primaryBal),
    mc('TX Volume Out', fmtVolume(data.metrics.tokenVolumeOut, sym), `${data.metrics.txFrequencyPerDay.toFixed(1)} tx/day`),
    mc('Active Days', data.metrics.activeDaySpread.toLocaleString(), `${data.metrics.activeMonths} active months`),
    mc('Gas Spent', data.metrics.gasSpent != null ? `${data.metrics.gasSpent.toFixed(data.metrics.gasToken === 'ETH' ? 4 : 2)} ${data.metrics.gasToken}` : '—'),
    mc('Longest Streak', `${data.metrics.longestActiveStreak} days`),
    mc('Deployed Contracts', (data.metrics.deployedContractCount ?? 0).toLocaleString()),
    mc('Last Active', lastActiveText(data.metrics.lastActivity)),
  ].join('')

  // ── tx type breakdown ─────────────────────────────────────────────────────
  const breakdown = Object.entries(data.aiAnalysis.txTypeBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => `<span>${k} <strong>${v}%</strong></span>`)
    .join('<span style="color:#e5e7eb"> · </span>')

  // ── risk factors ──────────────────────────────────────────────────────────
  const riskFactorRows = data.riskFactors.map((f) => {
    const c = f.impact === 'negative' ? '#ef4444' : f.impact === 'neutral' ? '#facc15' : '#4ade80'
    const dot = f.impact === 'negative' ? '🔴' : f.impact === 'neutral' ? '🟡' : '🟢'
    return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid #e5e7eb">
      <span style="font-size:10px;flex-shrink:0">${dot}</span>
      <span style="color:#6b7280;flex:1">${f.label}</span>
      <span style="color:${c};font-weight:600;font-size:11px">${f.impact}</span>
    </div>`
  }).join('')

  // ── top contracts + methods ───────────────────────────────────────────────
  const topContractRows = data.topContracts.map((c) =>
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #e5e7eb">
      <span style="font-family:monospace;font-size:11px;color:#16a34a">${c.name ?? `${c.address.slice(0,6)}…${c.address.slice(-4)}`}</span>
      <span style="font-size:11px;font-weight:700;padding:1px 8px;border-radius:12px;background:#4ade8022;color:#16a34a;flex-shrink:0">${c.callCount}×</span>
    </div>`
  ).join('')

  const topMethodRows = data.topMethods.map((m) =>
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #e5e7eb">
      <span style="font-family:monospace;font-size:11px;color:#111827;opacity:.8">${m.method}</span>
      <span style="font-size:11px;color:#6b7280;flex-shrink:0">${m.count}×</span>
    </div>`
  ).join('')

  // ── detected patterns ─────────────────────────────────────────────────────
  function patternRow(label: string, detected: boolean) {
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb">
      <span style="font-size:13px;color:#6b7280">${label}</span>
      ${detected
        ? `<span style="color:#ef4444;font-size:11px;font-weight:700">⚠ Detected</span>`
        : `<span style="color:#16a34a;font-size:11px">✓ Clear</span>`}
    </div>`
  }

  const dp = data.detectedPatterns
  const patternRows = [
    patternRow('MEV / Frontrunning', dp.mev),
    patternRow('Honeypot Interaction', dp.honeypot),
    patternRow('Bridge Usage', dp.bridge),
    patternRow('High Volume Short Age', dp.highVolumeShortAge),
    patternRow('Repeated Contract Calls', dp.repeatedCalls),
  ].join('')

  const aiPatternTags = data.aiAnalysis.patterns.length > 0
    ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${data.aiAnalysis.patterns.map((p) =>
        `<span style="border:1px solid #e5e7eb;color:#6b7280;padding:3px 10px;border-radius:12px;font-size:11px">${p}</span>`
      ).join('')}</div>`
    : ''

  const peakHoursLine = data.metrics.peakHours.length > 0
    ? `<div style="margin-top:10px;font-size:11px;color:#6b7280">Most active at: <strong style="color:#111827">${data.metrics.peakHours.map((h) => `${String(h).padStart(2,'0')}:00`).join(', ')} UTC</strong></div>`
    : ''

  // ── risky contracts ───────────────────────────────────────────────────────
  const riskyContractRows = data.riskyContracts.length > 0
    ? data.riskyContracts.map((c) =>
        `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:8px;background:#ffffff;border:1px solid #e5e7eb;margin-bottom:6px">
          <div>
            <div style="font-family:monospace;font-size:11px;color:#6b7280">${c.address.slice(0,6)}…${c.address.slice(-4)}</div>
            ${c.name ? `<div style="font-size:12px;font-weight:500;color:#111827;margin-top:2px">${c.name}</div>` : ''}
          </div>
          <span style="background:#ef444422;color:#ef4444;border:1px solid #ef444444;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700">High Risk</span>
        </div>`
      ).join('')
    : `<div style="color:#6b7280;font-size:13px;padding:4px 0">✓ No risky contract interactions detected</div>`

  // ── contract interactions ─────────────────────────────────────────────────
  const contractInteractionRows = data.contractInteractions.length > 0
    ? data.contractInteractions.map((c) =>
        `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:8px;background:#ffffff;border:1px solid #e5e7eb;margin-bottom:6px">
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-family:monospace;font-size:11px;color:#16a34a">${c.address.slice(0,6)}…${c.address.slice(-4)}</span>
              ${c.name ? `<span style="font-size:12px;font-weight:500;color:#111827">${c.name}</span>` : ''}
            </div>
            ${c.topMethod ? `<div style="font-family:monospace;font-size:10px;color:#6b7280;margin-top:3px">${c.topMethod}</div>` : ''}
          </div>
          <span style="background:#4ade8022;color:#16a34a;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;flex-shrink:0">${c.callCount}×</span>
        </div>`
      ).join('')
    : `<div style="color:#6b7280;font-size:13px;padding:4px 0">✓ No contract interactions in recent transactions</div>`

  // ── transactions table ────────────────────────────────────────────────────
  const txRows = data.transactions.slice(0, 15).map((tx) =>
    `<tr>
      <td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;font-family:monospace;font-size:10px;color:#6b7280">${tx.hash.slice(0,10)}…</td>
      <td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#111827">${tx.method ?? 'Transfer'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#111827">${(Number(BigInt(tx.value || '0')) / 1e18).toFixed(6)} ${sym}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;font-size:11px">
        <span style="color:${tx.status === 'ok' ? '#4ade80' : tx.status === 'error' ? '#ef4444' : '#6b7280'}">${tx.status ?? 'pending'}</span>
      </td>
      <td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280">${tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : '—'}</td>
    </tr>`
  ).join('')

  // ── card wrapper helper ───────────────────────────────────────────────────
  function card(title: string, body: string) {
    return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #e5e7eb">${title}</div>
      ${body}
    </div>`
  }

  // ── advice bullets ────────────────────────────────────────────────────────
  const adviceBullets = data.advice.length > 0
    ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb">${data.advice.map((a) =>
        `<div style="font-size:11px;color:#6b7280;line-height:1.6;margin-bottom:4px">${a}</div>`
      ).join('')}</div>`
    : ''

  // ── contract name/info banner ─────────────────────────────────────────────
  const contractBanner = (data.addressInfo.is_contract || data.addressInfo.name)
    ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <span style="color:#16a34a;font-size:16px">🛡</span>
        <div style="font-size:13px;color:#111827">
          ${data.addressInfo.name ? `<strong>${data.addressInfo.name}</strong> ` : ''}
          ${data.addressInfo.is_contract ? `<span style="color:#6b7280;opacity:.8">Smart contract${data.addressInfo.is_verified ? ' · ✓ Verified' : ' · Unverified'}</span>` : ''}
        </div>
      </div>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ioScope Report — ${data.address}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 32px 40px; background: #ffffff; color: #111827; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px; background: #f9fafb; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; }
    a { color: #4ade80; }
    @media print {
      body { padding: 16px 20px; }
      @page { margin: 10mm; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #e5e7eb">
    <img src="${logoSrc}" alt="ioScope" style="height:96px;object-fit:contain" onerror="this.style.display='none';document.getElementById('logo-fallback').style.display='inline'">
    <span id="logo-fallback" style="display:none;font-size:20px;font-weight:800;color:#111827">io<span style="color:#16a34a">Scope</span></span>
    <div style="text-align:right;font-size:11px;color:#6b7280">
      <div>Generated ${new Date().toLocaleString()}</div>
      <div>Chain: <strong style="color:#16a34a">${data.chain.toUpperCase()}</strong></div>
    </div>
  </div>

  <!-- Address -->
  <div style="margin-bottom:16px;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px">
    ${data.addressInfo.ens_domain_name ? `<div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:4px">${data.addressInfo.ens_domain_name}</div>` : ''}
    <div style="font-family:monospace;font-size:13px;font-weight:600;color:#111827;word-break:break-all;letter-spacing:.02em">${data.address}</div>
    ${badges ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${badges}</div>` : ''}
    <div style="margin-top:6px;font-size:11px;color:#6b7280">
      ${fmtDate(data.metrics.firstActivity)} → ${fmtDate(data.metrics.lastActivity)}
    </div>
  </div>

  ${contractBanner}

  <!-- Key Metrics -->
  ${card('Key Metrics', `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">${metricCards}</div>`)}

  <!-- Classification + Risk Score side by side -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">

    <!-- Classification -->
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #e5e7eb">User Classification</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;padding:0 4px">
        <div>
          <span style="font-size:20px;font-weight:700;color:#ef4444">${data.botProbability}%</span>
          <span style="font-size:11px;color:#6b7280;margin-left:5px">Bot</span>
        </div>
        <div>
          <span style="font-size:20px;font-weight:700;color:#16a34a">${100 - data.botProbability}%</span>
          <span style="font-size:11px;color:#6b7280;margin-left:5px">Real User</span>
        </div>
      </div>
      ${donutSvg(data.botProbability)}
      <div style="margin-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="background:#4ade8022;color:#16a34a;border:1px solid #4ade8044;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700">${data.aiAnalysis.userType}</span>
        ${data.aiAnalysis.activityPattern ? `<span style="font-size:11px;color:#6b7280">${data.aiAnalysis.activityPattern}</span>` : ''}
      </div>
      ${Object.keys(data.aiAnalysis.txTypeBreakdown).length > 0
        ? `<div style="margin-top:8px;font-size:11px;color:#6b7280">${breakdown}</div>`
        : ''}
      ${adviceBullets}
    </div>

    <!-- Risk Score -->
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #e5e7eb">Risk Score</div>
      ${riskGaugeSvg(data.riskScore)}
      <div style="text-align:center;font-size:26px;font-weight:700;margin:6px 0 10px;color:${riskColor}">${data.riskScore}<span style="font-size:14px;color:#6b7280">/100</span></div>
      ${riskFactorRows ? `<div style="margin-bottom:10px">${riskFactorRows}</div>` : ''}
      <p style="font-size:12px;line-height:1.7;color:#6b7280;margin:0;padding-top:10px;border-top:1px solid #e5e7eb">${data.aiAnalysis.explanation}</p>
    </div>
  </div>

  <!-- Top Contracts + Top Methods -->
  ${(data.topContracts.length > 0 || data.topMethods.length > 0) ? `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
    ${data.topContracts.length > 0 ? card('Top Contracts', topContractRows) : ''}
    ${data.topMethods.length > 0 ? card('Top Methods', topMethodRows) : ''}
  </div>` : ''}

  <!-- Suspicious Patterns -->
  ${card('Suspicious Behavior Patterns', patternRows + peakHoursLine + aiPatternTags)}

  <!-- Risky Contracts -->
  ${card('Risky Contract Interactions', riskyContractRows)}

  <!-- Contract Interactions -->
  ${card('Contract Interactions', contractInteractionRows)}

  <!-- Transactions -->
  ${card('Recent Transactions', `
    <table>
      <thead>
        <tr>
          <th>Hash</th><th>Method</th><th>Value</th><th>Status</th><th>Date</th>
        </tr>
      </thead>
      <tbody>${txRows}</tbody>
    </table>
  `)}

  <!-- Footer -->
  <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:10px;color:#6b7280;display:flex;justify-content:space-between">
    <span>Generated by ioScope · Powered by Blockscout + Groq AI</span>
    <span>${data.address}</span>
  </div>

  <script>window.onload = () => { window.print() }</script>
</body>
</html>`

  printWindow.document.write(html)
  printWindow.document.close()
}
