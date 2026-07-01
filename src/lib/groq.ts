import Groq from 'groq-sdk'

let _groq: Groq | null = null
function getGroq() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? '' })
  return _groq
}

export interface AiAnalysis {
  patterns: string[]
  explanation: string
  classification: 'whale' | 'defi_power_user' | 'developer' | 'bot' | 'mev_bot' | 'contract' | 'regular' | 'unknown'
  userType: string
  txTypeBreakdown: Record<string, number>
  activityPattern: string
}

const NEUTRAL_RESULT: AiAnalysis = {
  patterns: [],
  explanation: 'Analysis unavailable',
  classification: 'unknown',
  userType: 'Unknown',
  txTypeBreakdown: {},
  activityPattern: '',
}

interface AnalysisInput {
  address: string
  isContract: boolean
  isScam: boolean
  isVerified: boolean
  ensDomain: string | null
  publicTags: string[]
  balance: string
  gasUsed: string | null
  txCount: number
  firstActivity: string | null
  lastActivity: string | null
  walletAgeDays: number
  activeDaySpread: number
  activeWeeks: number
  activeMonths: number
  longestActiveStreak: number
  txFrequencyPerDay: number
  uniqueContracts: number
  uniqueMethods: number
  hasDeployedContract: boolean
  deployedContractCount: number
  maxTxPerDay: number
  consistencyRatio: number
  usdcBalance: string | null
  gasSpent: number | null
  topContracts: Array<{ address: string; name: string | null; callCount: number }>
  topMethods: Array<{ method: string; count: number }>
  peakHours: number[]
  hourStdDev: number
  totalVolumeIn: string
  totalVolumeOut: string
  tokenCount: number
  totalPortfolioUSD: number
  detectedPatterns: {
    mev: boolean
    honeypot: boolean
    bridge: boolean
    repeatedCalls: boolean
    highVolumeShortAge: boolean
  }
  riskyContracts: Array<{ address: string; name: string | null }>
  calculatedRiskScore: number
  calculatedBotProbability: number
  txTypeBreakdown: Record<string, number>
}

export async function analyzeAddress(data: AnalysisInput): Promise<AiAnalysis> {
  const apiKey = process.env.GROQ_API_KEY ?? ''
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    console.log('[groq] USING HEURISTIC — no valid API key')
    return NEUTRAL_RESULT
  }
  console.log('[groq] USING GROQ — key present, calling llama-3.3-70b-versatile')

  const eth = (wei: string) => (Number(wei) / 1e18).toFixed(4)
  const consistencyPct = data.walletAgeDays > 0
    ? Math.round((data.activeDaySpread / data.walletAgeDays) * 100)
    : 0

  const topContractLines = data.topContracts.length > 0
    ? data.topContracts
        .map((c) => `  - ${c.name ?? c.address}: ${c.callCount} calls`)
        .join('\n')
    : '  None'

  const topMethodsLine = data.topMethods.length > 0
    ? data.topMethods.map((m) => `${m.method} (${m.count})`).join(', ')
    : 'None'

  const riskyContractLines = data.riskyContracts.length > 0
    ? data.riskyContracts
        .map((c) => `  - ${c.address}${c.name ? ` (${c.name})` : ''}`)
        .join('\n')
    : ''

  const prompt = `=== WALLET PROFILE ===
Risk Score: ${data.calculatedRiskScore}/100
Bot Probability: ${data.calculatedBotProbability}%

=== WALLET METRICS ===
Total Transactions: ${data.txCount}
Unique Contracts Interacted: ${data.uniqueContracts}
First Transaction: ${data.firstActivity ?? 'Unknown'}
Active Days: ${data.activeDaySpread}
Longest Active Streak: ${data.longestActiveStreak} days
Deployed Contracts: ${data.deployedContractCount}
Consistency Ratio: ${data.consistencyRatio}%
Last Active: ${data.lastActivity ?? 'Unknown'}
Transaction Type Breakdown: ${JSON.stringify(data.txTypeBreakdown)}

=== YOUR TASK ===
Based on the wallet metrics and scores above, provide qualitative analysis only.
Do NOT provide any numbers for risk or bot scores.
Use the provided txTypeBreakdown for the txTypeBreakdown field in your response, do not guess it.

For txTypeBreakdown:
- Percentages must add up to 100
- Use whole numbers only
- Example: { "contract calls": 85, "token transfers": 15 }

Risk score interpretation:
- 1-20: Very low risk, trustworthy wallet — use only positive factors
- 21-40: Low risk, normal user — mostly positive factors
- 41-60: Medium risk — mix of positive and negative
- 61-80: High risk — mostly negative factors
- 81-100: Very high risk — all negative factors

Bot probability interpretation:
- 1-20: Very likely human — use only positive factors
- 21-50: Probably human — mostly positive
- 51-80: Uncertain — mix
- 81-100: Likely bot — negative factors

Do not contradict the calculated scores in your explanation.
- Do not contradict the wallet metrics in your explanation
- If consistency ratio is above 50%, do not call it low
- Keep explanation factual and based only on the metrics provided

CRITICAL: Only mention factors that actually apply to this wallet based on the metrics provided.
- If Deployed Contracts is 0, do NOT list deployed contracts as a factor
- If the wallet is older than 30 days, do NOT call it a new wallet
- If consistency ratio > 50%, do NOT mention low consistency
- If riskScore < 20, explanation must say this is a low risk wallet, not high risk
- riskFactors list must match the actual metrics, not generic patterns
- Lack of deployed contracts is NOT a negative risk factor — most normal users never deploy contracts
- Consistency ratio above 50% is NOT low consistency — do not label it as low
- Only call consistency "low" if it is below 20%

Classification rules:
- If deployedContracts > 5: classification must be "developer"
- If deployedContracts > 0 and uniqueContracts > 20: classification must be "defi_power_user" or "developer"
- If txCount > 1000 and activeDays > 100: classification must be "defi_power_user"
- If txCount < 100 and deployedContracts = 0: classification is "regular"

Return ONLY valid JSON, no markdown:
{
  "patterns": ["<short observed pattern>"],
  "explanation": "<2-3 sentences describing this wallet's behavior based on the metrics>",
  "classification": "<whale|defi_power_user|developer|bot|regular|unknown>",
  "userType": "<concise human-readable label like: Normal User, Power User, Developer, Active Trader>",
  "txTypeBreakdown": { "<type>": <percentage, must add to 100> },
  "activityPattern": "<one sentence>"
}`

  console.log('[GROQ PROMPT]', prompt)

  try {
    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024,
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    console.log('[groq] RAW RESPONSE:', JSON.stringify(completion, null, 2))

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const parsed = JSON.parse(jsonMatch[0]) as AiAnalysis
    return {
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
      explanation: String(parsed.explanation || ''),
      classification: parsed.classification || 'unknown',
      userType: String(parsed.userType || 'Unknown'),
      txTypeBreakdown:
        parsed.txTypeBreakdown && typeof parsed.txTypeBreakdown === 'object'
          ? parsed.txTypeBreakdown
          : {},
      activityPattern: (() => {
        const ap = String(parsed.activityPattern || '').trim()
        return ap.includes(' ') ? ap : ''
      })(),
    }
  } catch (err) {
    console.log('[groq] GROQ FAILED — returning neutral scores:', err instanceof Error ? err.message : err)
    return NEUTRAL_RESULT
  }
}
