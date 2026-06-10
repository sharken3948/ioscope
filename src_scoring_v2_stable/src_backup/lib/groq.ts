import Groq from 'groq-sdk'

let _groq: Groq | null = null
function getGroq() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? '' })
  return _groq
}

export interface AiAnalysis {
  riskScore: number
  botProbability: number
  patterns: string[]
  explanation: string
  classification: 'whale' | 'defi_user' | 'bot' | 'contract' | 'regular' | 'unknown'
}

interface AnalysisInput {
  address: string
  isContract: boolean
  txCount: number
  balance: string
  firstActivity: string | null
  lastActivity: string | null
  txFrequencyPerDay: number
  uniqueInteractions: number
  totalVolumeIn: string
  totalVolumeOut: string
  avgTxSize: string
  largestTx: string
  recentTxSample: Array<{
    hash: string
    from: string
    to: string | null
    value: string
    method: string | null
    timestamp: string | null
  }>
}

interface TimePatterns {
  time_clustering: boolean
  peak_hours: number[]
  hour_stddev: number
}

function computeTimePatterns(txSample: AnalysisInput['recentTxSample']): TimePatterns {
  const hours = txSample
    .map((tx) => (tx.timestamp ? new Date(tx.timestamp).getUTCHours() : null))
    .filter((h): h is number => h !== null)

  if (hours.length === 0) return { time_clustering: false, peak_hours: [], hour_stddev: 0 }

  const freq = new Array(24).fill(0) as number[]
  for (const h of hours) freq[h]++

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1])
  const peak_hours = sorted.filter(([, count]) => count > 0).slice(0, 3).map(([hour]) => hour)

  const top3Count = sorted.slice(0, 3).reduce((sum, [, count]) => sum + count, 0)
  const time_clustering = hours.length > 0 && top3Count / hours.length > 0.6

  const mean = hours.reduce((sum, h) => sum + h, 0) / hours.length
  const variance = hours.reduce((sum, h) => sum + (h - mean) ** 2, 0) / hours.length
  const hour_stddev = Math.sqrt(variance)

  return { time_clustering, peak_hours, hour_stddev }
}

function heuristicAnalysis(data: AnalysisInput): AiAnalysis {
  let riskScore = 10
  let botProbability = 5
  const patterns: string[] = []
  const tp = computeTimePatterns(data.recentTxSample)
  if (tp.time_clustering && tp.hour_stddev < 3) {
    riskScore += 20
    botProbability += 30
    patterns.push('Highly clustered transaction times')
  } else if (tp.hour_stddev > 4) {
    botProbability = Math.max(0, botProbability - 10)
  }

  if (data.isContract) {
    riskScore += 15
    patterns.push('Smart contract')
  }

  if (data.txFrequencyPerDay > 50) {
    riskScore += 30
    botProbability += 40
    patterns.push('Extremely high transaction frequency')
  } else if (data.txFrequencyPerDay > 20) {
    riskScore += 15
    botProbability += 25
    patterns.push('High transaction frequency')
  }

  const balanceEth = Number(data.balance) / 1e18
  if (balanceEth > 1000) {
    riskScore += 5
    patterns.push('Whale wallet')
  }

  const volOut = Number(data.totalVolumeOut) / 1e18
  if (volOut > 10000) patterns.push('High outgoing volume')

  const methods = data.recentTxSample.map((t) => t.method?.toLowerCase() ?? '').filter(Boolean)
  if (methods.some((m) => m.includes('swap') || m.includes('trade'))) {
    patterns.push('DeFi activity (swaps)')
  }
  if (methods.some((m) => m.includes('bridge') || m.includes('relay'))) {
    riskScore += 10
    patterns.push('Bridge usage')
  }

  const walletAgeDays = data.firstActivity
    ? (Date.now() - new Date(data.firstActivity).getTime()) / 86400000
    : 0
  if (walletAgeDays < 7 && data.txCount > 100) {
    riskScore += 25
    botProbability += 30
    patterns.push('High volume short age')
  }

  const uniqueMethodCount = new Set(methods).size
  if (uniqueMethodCount === 1 && data.txCount > 20) {
    riskScore += 10
    botProbability += 20
    patterns.push('Repeated contract calls')
  }

  riskScore = Math.max(0, Math.min(100, riskScore))
  botProbability = Math.max(0, Math.min(100, botProbability))

  let classification: AiAnalysis['classification'] = 'regular'
  if (data.isContract) classification = 'contract'
  else if (botProbability > 60) classification = 'bot'
  else if (balanceEth > 1000 || volOut > 10000) classification = 'whale'
  else if (patterns.some((p) => p.toLowerCase().includes('defi'))) classification = 'defi_user'

  const explanation = `Address has ${data.txCount} transactions with ${data.uniqueInteractions} unique counterparties. ${
    data.txFrequencyPerDay > 10
      ? `High activity rate of ${data.txFrequencyPerDay.toFixed(1)} tx/day.`
      : `Moderate activity at ${data.txFrequencyPerDay.toFixed(1)} tx/day.`
  } Risk assessment based on on-chain behavior patterns.`

  return { riskScore, botProbability, patterns, explanation, classification }
}

export async function analyzeAddress(data: AnalysisInput): Promise<AiAnalysis> {
  const apiKey = process.env.GROQ_API_KEY ?? ''
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    return heuristicAnalysis(data)
  }

  const tp = computeTimePatterns(data.recentTxSample)

  const prompt = `You are a blockchain address risk analyzer. Analyze the following on-chain data and return a JSON risk assessment.

Address: ${data.address}
Type: ${data.isContract ? 'Smart Contract' : 'Wallet'}
Transaction Count: ${data.txCount}
Balance: ${data.balance} wei (${(Number(data.balance) / 1e18).toFixed(4)} ETH)
First Activity: ${data.firstActivity ?? 'Unknown'}
Last Activity: ${data.lastActivity ?? 'Unknown'}
Tx Frequency: ${data.txFrequencyPerDay.toFixed(2)} tx/day
Unique Interactions: ${data.uniqueInteractions}
Total Volume In: ${data.totalVolumeIn} wei
Total Volume Out: ${data.totalVolumeOut} wei
Average Tx Size: ${data.avgTxSize} wei
Largest Single Tx: ${data.largestTx} wei

Transaction Time Pattern Analysis (from recent sample):
Time Clustering (top 3 hours > 60% of txs): ${tp.time_clustering}
Peak Hours UTC: ${tp.peak_hours.length > 0 ? tp.peak_hours.join(', ') : 'N/A'}
Hour Standard Deviation: ${tp.hour_stddev.toFixed(2)}

Recent Transactions Sample (up to 10):
${JSON.stringify(data.recentTxSample.slice(0, 10), null, 2)}

Bot detection rules — apply carefully:
- If time_clustering is true AND hour_stddev < 3, this strongly indicates automated/bot behavior.
- If transactions are spread across many different hours (hour_stddev > 4), this indicates human behavior regardless of frequency.
- GM card minting, NFT minting, and testnet faucet interactions are normal human activities — do NOT use these as bot indicators.
- Real bot indicators: same-hour clustering, MEV patterns, flash loans, sandwich attacks, extremely high frequency with narrow time windows.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "riskScore": <0-100, where 0=safe, 100=high risk>,
  "botProbability": <0-100 percentage>,
  "patterns": [<detected suspicious or notable behavior patterns, short strings>],
  "explanation": "<2-3 sentence summary>",
  "classification": "<one of: whale, defi_user, bot, contract, regular, unknown>"
}`

  try {
    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024,
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const parsed = JSON.parse(jsonMatch[0]) as AiAnalysis
    return {
      riskScore: Math.max(0, Math.min(100, Number(parsed.riskScore) || 0)),
      botProbability: Math.max(0, Math.min(100, Number(parsed.botProbability) || 0)),
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
      explanation: String(parsed.explanation || ''),
      classification: parsed.classification || 'unknown',
    }
  } catch {
    return heuristicAnalysis(data)
  }
}
