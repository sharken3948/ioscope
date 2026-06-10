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

export function calculateBotProbability(m: ScoringMetrics): number {
  if (m.walletAgeDays < 14 && m.txCount < 20) return 50

  let score = 50

  // BLOCK 1 — TX
  const avgTxPerActiveDay = m.activeDays > 0 ? m.txCount / m.activeDays : 0
  const txSpike = avgTxPerActiveDay > 0 ? m.maxTxPerDay / avgTxPerActiveDay : 0

  if (txSpike > 20 && m.busiestDayHours < 3 && m.busiestDayFunctions < 3 && m.minTimeBetweenTx < 5) score += 35
  else if (txSpike > 20 && m.busiestDayHours > 6 && m.busiestDayFunctions > 3) score -= 10

  if (m.avgTimeBetweenTx < 5 && m.txCount > 100) score += 20
  if (m.txCount / Math.max(m.walletAgeDays, 1) > 50) score += 15

  // BLOCK 2 — Contracts
  if (m.topContractRatio > 0.7 && m.topContractFunctionDiversity < 3) score += 25
  if (m.topContractRatio > 0.5 && m.topContractDailyRepeat > 0.8) score += 20
  if (m.uniqueContracts > 30) score -= 20
  else if (m.uniqueContracts > 15) score -= 10
  else if (m.uniqueContracts < 5 && m.txCount > 500) score += 15

  // BLOCK 3 — First Transaction
  if (m.walletAgeDays < 30 && m.txCount > 200) score += 20
  if (m.walletAgeDays < 7 && m.txCount > 100) score += 30
  if (m.earlyActivityRatio > 0.5) score += 15
  if (m.walletAgeDays > 180) score -= 10

  // BLOCK 4 — Balance + Volume + Gas
  const zeroGasHighTx = m.gasSpent === 0 && m.txCount > 50
  const zeroVolumeHighTx = m.tokenVolumeOut === 0 && m.txCount > 100
  const gasToVolumeRatio = m.tokenVolumeOut > 0 ? m.gasSpent / m.tokenVolumeOut : 0

  if (zeroGasHighTx) score += 35
  if (zeroVolumeHighTx) score += 20
  if (gasToVolumeRatio > 0.8) score += 15

  // BLOCK 5 — Active Days + Last Active
  if (m.consistencyRatio > 70 && m.lastActiveDaysAgo < 2) score -= 25
  else if (m.consistencyRatio > 50) score -= 15
  if (m.weekendActivity > 0.45 && m.consistencyRatio > 80) score += 15
  if (m.recentActivityRatio === 0 && m.lastActiveDaysAgo > 60) score += 10
  if (m.activityTrend > 1 && m.lastActiveDaysAgo < 7) score -= 10

  // BLOCK 6 — Longest Streak (Override)
  if (m.longestStreak > 90) score = Math.min(score, 25)
  else if (m.longestStreak > 30 && m.consistencyRatio > 50) score -= 20
  else if (m.longestStreak > 14) score -= 10

  // BLOCK 7 — Deployed Contracts (Override)
  if (m.deployedContractCount > 10 && m.longestStreak > 90) score = Math.min(score, 10)
  else if (m.deployedContractCount > 10) score = Math.min(score, 20)
  else if (m.deployedContractCount > 5) score -= 15
  else if (m.deployedContractCount > 0) score -= 8

  return Math.max(1, Math.min(100, Math.round(score)))
}

export function calculateRiskScore(m: ScoringMetrics): number {
  if (m.walletAgeDays < 14 && m.txCount < 20) return 50

  let score = 50

  // BLOCK 1 — TX
  const avgTxPerActiveDay = m.activeDays > 0 ? m.txCount / m.activeDays : 0
  const txSpike = avgTxPerActiveDay > 0 ? m.maxTxPerDay / avgTxPerActiveDay : 0

  if (txSpike > 20 && m.busiestDayHours < 3 && m.busiestDayFunctions < 3) score += 20
  if (m.avgTimeBetweenTx < 5 && m.txCount > 100) score += 15

  // BLOCK 2 — Contracts
  if (m.topContractRatio > 0.7 && m.topContractFunctionDiversity < 3) score += 20
  if (m.uniqueContracts > 30) score -= 15
  else if (m.uniqueContracts > 15) score -= 8

  // BLOCK 3 — First Transaction
  if (m.walletAgeDays < 7 && m.txCount > 100) score += 40
  if (m.walletAgeDays < 30 && m.txCount > 200) score += 20
  if (m.earlyActivityRatio > 0.5) score += 10
  if (m.walletAgeDays > 180) score -= 15

  // BLOCK 4 — Balance + Volume + Gas
  const zeroGasHighTx = m.gasSpent === 0 && m.txCount > 50
  const gasToVolumeRatio = m.tokenVolumeOut > 0 ? m.gasSpent / m.tokenVolumeOut : 0

  if (zeroGasHighTx) score += 35
  if (gasToVolumeRatio > 0.8) score += 10

  // BLOCK 5 — Active Days + Last Active
  if (m.consistencyRatio > 70 && m.lastActiveDaysAgo < 2) score -= 20
  else if (m.consistencyRatio > 50) score -= 10
  if (m.lastActiveDaysAgo >= 15) score += 10
  if (m.recentActivityRatio === 0 && m.lastActiveDaysAgo > 60) score += 15

  // BLOCK 6 — Longest Streak (Override)
  if (m.longestStreak > 90) score = Math.min(score, 40)
  else if (m.longestStreak > 30 && m.consistencyRatio > 50) score -= 15

  // BLOCK 7 — Deployed Contracts (Override)
  if (m.deployedContractCount > 10 && m.longestStreak > 90) score -= 25
  else if (m.deployedContractCount > 5 && m.uniqueContracts > 20) score -= 20
  else if (m.deployedContractCount > 0) score -= 8
  if (m.deployedContractCount / Math.max(m.activeDays, 1) > 5) score += 15

  return Math.max(1, Math.min(100, Math.round(score)))
}
