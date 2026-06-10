import type { DetectedPatterns } from '@/lib/blockscout'

export interface ScoringMetrics {
  // TX
  txCount: number
  walletAgeDays: number
  activeDays: number
  maxTxPerDay: number
  busiestDayHours: number
  busiestDayFunctions: number
  avgTimeBetweenTx: number
  minTimeBetweenTx: number
  txBurstConcentration: number

  // Contracts
  topContractRatio: number
  topContractDailyRepeat: number
  topContractFunctionDiversity: number
  uniqueContracts: number

  // First Transaction
  earlyActivityRatio: number

  // Balance + Volume + Gas
  usdcBalance: number
  tokenVolumeOut: number
  gasSpent: number

  // Active Days + Last Active
  consistencyRatio: number
  recentActivityRatio: number
  weekendActivity: number
  lastActiveDaysAgo: number
  activityTrend: number

  // Streak
  longestStreak: number

  // Deployed
  deployedContractCount: number
}

function zone(value: number, zones: [number, number][]): number {
  for (const [threshold, score] of zones) {
    if (value >= threshold) return score
  }
  return zones[zones.length - 1][1]
}

export function calculateBotProbability(m: ScoringMetrics, patterns?: DetectedPatterns): number {
  if (m.walletAgeDays < 14 && m.txCount < 20) return 50

  // SIGNAL 1 - minTimeBetweenTx (weight 22)
  const speed = 1 / Math.max(m.minTimeBetweenTx, 0.1)
  const s1 = zone(speed, [[1/5, 1.0],[1/15, 0.6],[1/120, 0.1],[0, 0.0]]) * 22

  // SIGNAL 2 - longestStreak INVERSE (weight 18)
  const s2 = zone(m.longestStreak, [[90,0.0],[30,0.2],[7,0.5],[0,1.0]]) * 18 * (m.activeDays >= 10 ? 1.0 : 0.3)

  // SIGNAL 3 - deployedContractCount INVERSE (weight 16)
  const s3 = zone(m.deployedContractCount, [[10,0.0],[3,0.1],[1,0.3],[0,0.5]]) * 16

  // SIGNAL 4 - txBurstConcentration (weight 14)
  const s4 = zone(m.txBurstConcentration, [[0.85,1.0],[0.60,0.6],[0.40,0.3],[0,0.0]]) * 14

  // SIGNAL 5 - contract concentration combined (weight 11)
  const contractConcentration = m.topContractRatio / Math.max(m.topContractFunctionDiversity, 1)
  const s5 = zone(contractConcentration, [[0.7,1.0],[0.4,0.5],[0.2,0.2],[0,0.0]]) * 11

  // SIGNAL 6 - consistencyRatio INVERSE (weight 8)
  const s6 = zone(m.consistencyRatio, [[65,0.0],[30,0.3],[10,0.6],[0,0.8]]) * 8 * (m.activeDays >= 10 ? 1.0 : 0.3)

  // SIGNAL 7 - walletAgeDays INVERSE (weight 6)
  const s7 = zone(m.walletAgeDays, [[365,0.0],[90,0.2],[30,0.5],[0,0.8]]) * 6

  // SIGNAL 8 - uniqueContracts INVERSE (weight 5)
  const s8 = zone(m.uniqueContracts, [[30,0.0],[10,0.2],[3,0.5],[0,0.9]]) * 5

  let rawBot = s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8

  // PATTERN MULTIPLIERS
  if (patterns) {
    if (patterns.mev) rawBot = rawBot + (100 - rawBot) * 0.38
    if (patterns.honeypot) rawBot = rawBot + (100 - rawBot) * 0.15
    if (patterns.highVolumeShortAge) rawBot = rawBot + (100 - rawBot) * 0.35
    if (patterns.repeatedCalls && m.uniqueContracts < 5) rawBot = rawBot + (100 - rawBot) * 0.20
    if (patterns.bridge) rawBot = rawBot * 0.92
  }

  // HARD CAPS
  if (m.longestStreak > 120 && m.deployedContractCount > 5 && m.activeDays >= 10) rawBot = Math.min(rawBot, 8)
  else if (m.longestStreak > 90 && m.deployedContractCount > 0 && m.activeDays >= 10) rawBot = Math.min(rawBot, 18)
  else if (m.walletAgeDays > 365 && m.consistencyRatio > 65 && m.activeDays >= 10) rawBot = Math.min(rawBot, 25)

  return Math.max(1, Math.min(100, Math.round(rawBot)))
}

export function calculateRiskScore(m: ScoringMetrics, patterns?: DetectedPatterns): number {
  if (m.walletAgeDays < 14 && m.txCount < 20) return 50

  // SIGNAL 1 - honeypot (weight 26)
  const r1 = (patterns?.honeypot ? 1.0 : 0.0) * 26

  // SIGNAL 2 - longestStreak INVERSE (weight 19)
  const r2 = zone(m.longestStreak, [[90,0.0],[30,0.2],[7,0.6],[0,1.0]]) * 19 * (m.activeDays >= 10 ? 1.0 : 0.3)

  // SIGNAL 3 - newWalletHighActivity (weight 16)
  const newWalletRisk =
    m.walletAgeDays < 7 && m.txCount > 20 ? 1.0 :
    m.walletAgeDays <= 15 && m.activeDays < 3 && m.txCount > 10 ? 0.8 :
    m.walletAgeDays < 30 && m.activeDays < 5 && m.txCount > 30 ? 0.6 :
    m.walletAgeDays < 30 && m.txCount > 50 ? 0.4 :
    0.0
  const r3 = newWalletRisk * 16

  // SIGNAL 4 - deployedContractCount INVERSE (weight 13)
  const r4 = zone(m.deployedContractCount, [[10,0.0],[3,0.1],[1,0.3],[0,0.5]]) * 13

  // SIGNAL 5 - zeroGasHighTx (weight 11)
  const r5 = (m.gasSpent === 0 && m.txCount > 50 ? 1.0 : m.gasSpent === 0 && m.txCount > 20 ? 0.5 : 0.0) * 11

  // SIGNAL 6 - mev detection (weight 8)
  const r6 = (patterns?.mev ? 1.0 : 0.0) * 8

  // SIGNAL 7 - consistencyRatio INVERSE (weight 7)
  const r7 = zone(m.consistencyRatio, [[65,0.0],[30,0.3],[10,0.6],[0,0.8]]) * 7 * (m.activeDays >= 10 ? 1.0 : 0.3)

  let rawRisk = r1 + r2 + r3 + r4 + r5 + r6 + r7

  // PATTERN MULTIPLIERS
  if (patterns) {
    if (patterns.honeypot) rawRisk = rawRisk + (100 - rawRisk) * 0.52
    if (patterns.mev) rawRisk = rawRisk + (100 - rawRisk) * 0.30
    if (patterns.highVolumeShortAge) rawRisk = rawRisk + (100 - rawRisk) * 0.42
    if (patterns.bridge && !patterns.mev && !patterns.honeypot) rawRisk = rawRisk * 0.92
  }

  // HARD CAPS
  if (m.longestStreak > 120 && m.consistencyRatio > 65 && m.activeDays >= 10) rawRisk = Math.min(rawRisk, 18)
  else if (m.longestStreak > 90 && m.deployedContractCount > 3 && m.activeDays >= 10) rawRisk = Math.min(rawRisk, 35)
  if (patterns?.honeypot) rawRisk = Math.max(rawRisk, 45)

  return Math.max(1, Math.min(100, Math.round(rawRisk)))
}

export function getRiskFactors(m: ScoringMetrics, patterns: DetectedPatterns): Array<{ label: string; impact: string }> {
  const factors: Array<{ label: string; impact: string }> = []
  if (m.longestStreak > 30) factors.push({ label: 'Long active streak', impact: 'positive' })
  if (m.consistencyRatio > 50) factors.push({ label: 'High consistency', impact: 'positive' })
  if (m.deployedContractCount > 5) factors.push({ label: 'Deployed contracts', impact: 'positive' })
  if (m.walletAgeDays > 180) factors.push({ label: 'Old wallet', impact: 'positive' })
  if (m.uniqueContracts > 20) factors.push({ label: 'Diverse contracts', impact: 'positive' })
  if (m.consistencyRatio > 70 && m.lastActiveDaysAgo < 2) factors.push({ label: 'Very active user', impact: 'positive' })
  if (patterns.bridge) factors.push({ label: 'Bridge activity', impact: 'positive' })
  if (m.lastActiveDaysAgo >= 15) factors.push({ label: 'Inactive wallet', impact: 'negative' })
  if (m.walletAgeDays < 7 && m.txCount > 100) factors.push({ label: 'New wallet high activity', impact: 'negative' })
  if (m.gasSpent === 0 && m.txCount > 50) factors.push({ label: 'Zero gas high TX', impact: 'negative' })
  if (m.topContractRatio > 0.7 && m.topContractFunctionDiversity < 3) factors.push({ label: 'Single contract dominance', impact: 'negative' })
  if (patterns.mev) factors.push({ label: 'MEV/sandwich activity', impact: 'negative' })
  if (patterns.honeypot) factors.push({ label: 'Scam contract interactions', impact: 'negative' })
  if (patterns.highVolumeShortAge) factors.push({ label: 'High volume new wallet', impact: 'negative' })
  if (patterns.repeatedCalls) factors.push({ label: 'Repeated contract calls', impact: 'negative' })
  return factors
}
