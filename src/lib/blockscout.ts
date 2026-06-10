export type Chain = 'arc' | 'base' | 'soneium'

const BASE_URLS: Record<Chain, string> = {
  arc: 'https://testnet.arcscan.app/api/v2',
  base: 'https://base.blockscout.com/api/v2',
  soneium: 'https://soneium.blockscout.com/api/v2',
}

const V1_URLS: Record<Chain, string> = {
  arc: 'https://testnet.arcscan.app/api',
  base: 'https://base.blockscout.com/api',
  soneium: 'https://soneium.blockscout.com/api',
}

type V1TxlistItem = {
  hash: string
  to: string
  from: string
  timeStamp: string
  gasUsed: string
  gasPrice: string
  value: string
  functionName?: string
}

type V1TokenTxItem = {
  hash: string
  to: string
  from: string
  timeStamp: string
  value: string
  tokenDecimal?: string
  decimals?: string
}

type V1Response<T> = { status: string; result: T[] }

// ─── Paginated V1 fetchers ────────────────────────────────────────────────────

export async function getPaginatedTxlist(
  chain: Chain,
  address: string,
  maxTxs = 500,
): Promise<V1TxlistItem[]> {
  const base = V1_URLS[chain]
  const opts = { headers: { Accept: 'application/json' }, cache: 'no-store' } as const
  const pageSize = 50
  const collected: V1TxlistItem[] = []
  const seen = new Set<string>()

  for (let page = 1; collected.length < maxTxs; page++) {
    try {
      const url = `${base}?module=account&action=txlist&address=${address}&sort=desc&page=${page}&offset=${pageSize}`
      const res = await fetch(url, opts)
      if (!res.ok) break
      const data = (await res.json()) as V1Response<V1TxlistItem>
      if (data.status !== '1' || !Array.isArray(data.result) || data.result.length === 0) break

      for (const tx of data.result) {
        const key = tx.hash.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          collected.push(tx)
        }
      }

      if (data.result.length < pageSize) break
    } catch {
      break
    }
  }

  return collected.slice(0, maxTxs)
}

export async function getPaginatedTokenTx(
  chain: Chain,
  address: string,
  maxTxs = 500,
): Promise<V1TokenTxItem[]> {
  const base = V1_URLS[chain]
  const opts = { headers: { Accept: 'application/json' }, cache: 'no-store' } as const
  const pageSize = 50
  const collected: V1TokenTxItem[] = []
  const seen = new Set<string>()

  for (let page = 1; collected.length < maxTxs; page++) {
    try {
      const url = `${base}?module=account&action=tokentx&address=${address}&sort=desc&page=${page}&offset=${pageSize}`
      const res = await fetch(url, opts)
      if (!res.ok) break
      const data = (await res.json()) as V1Response<V1TokenTxItem>
      if (data.status !== '1' || !Array.isArray(data.result) || data.result.length === 0) break

      for (const tx of data.result) {
        const key = tx.hash.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          collected.push(tx)
        }
      }

      if (data.result.length < pageSize) break
    } catch {
      break
    }
  }

  return collected.slice(0, maxTxs)
}

// ─── WalletSummary ────────────────────────────────────────────────────────────

export interface WalletSummary {
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
  topContracts: Array<{ address: string; name: string | null; callCount: number }>
  topMethods: Array<{ method: string; count: number }>
  peakHours: number[]
  hourStdDev: number
  totalVolumeIn: string
  totalVolumeOut: string
  tokenVolumeOut: string
  totalGasSpent: number
  avgTxSize: string
  largestTx: string
  tokenCount: number
  totalPortfolioUSD: number
}

export function computeWalletSummary(
  address: string,
  txsList: Awaited<ReturnType<typeof getPaginatedTxlist>>,
  tokenTxsList: Awaited<ReturnType<typeof getPaginatedTokenTx>>,
  tokens: Token[],
): WalletSummary {
  const addrLower = address.toLowerCase()

  // ─── timestamps ───────────────────────────────────────────────────────────
  const timestamps = txsList
    .map((tx) => parseInt(tx.timeStamp, 10))
    .filter((ts) => ts > 0)
    .sort((a, b) => a - b)

  const firstTs = timestamps[0] ?? null
  const lastTs = timestamps[timestamps.length - 1] ?? null
  const firstActivity = firstTs ? new Date(firstTs * 1000).toISOString() : null
  const lastActivity = lastTs ? new Date(lastTs * 1000).toISOString() : null
  const walletAgeDays = firstTs && lastTs ? Math.max(1, Math.ceil((lastTs - firstTs) / 86400)) : 0
  const spanDays = firstTs && lastTs ? Math.max(1, (lastTs - firstTs) / 86400) : 1
  const txFrequencyPerDay = txsList.length / spanDays

  // ─── active day / week / month sets ───────────────────────────────────────
  const activeDaysSet = new Set<string>()
  const activeWeeksSet = new Set<string>()
  const activeMonthsSet = new Set<string>()

  for (const ts of timestamps) {
    const d = new Date(ts * 1000)
    const iso = d.toISOString()
    activeDaysSet.add(iso.slice(0, 10))
    activeMonthsSet.add(iso.slice(0, 7))
    const jan4 = new Date(d.getFullYear(), 0, 4)
    const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7)
    activeWeeksSet.add(`${d.getFullYear()}-W${week}`)
  }

  // ─── longest consecutive streak ───────────────────────────────────────────
  const sortedDays = [...activeDaysSet].sort()
  let longestActiveStreak = sortedDays.length > 0 ? 1 : 0
  let currentStreak = 1
  for (let i = 1; i < sortedDays.length; i++) {
    const diffDays = Math.round(
      (new Date(sortedDays[i]).getTime() - new Date(sortedDays[i - 1]).getTime()) / 86400000,
    )
    if (diffDays === 1) {
      currentStreak++
      if (currentStreak > longestActiveStreak) longestActiveStreak = currentStreak
    } else {
      currentStreak = 1
    }
  }

  // ─── volume ───────────────────────────────────────────────────────────────
  let totalIn = BigInt(0)
  let totalOut = BigInt(0)
  let largest = BigInt(0)

  for (const tx of txsList) {
    try {
      const val = BigInt(tx.value || '0')
      if (tx.from.toLowerCase() === addrLower) totalOut += val
      else totalIn += val
      if (val > largest) largest = val
    } catch { /* skip malformed value */ }
  }

  const avg = txsList.length > 0 ? (totalIn + totalOut) / BigInt(txsList.length) : BigInt(0)

  // ─── gas spent (outgoing txs only) ────────────────────────────────────────
  let gasSpentWei = BigInt(0)
  for (const tx of txsList) {
    if (tx.from.toLowerCase() === addrLower) {
      try {
        gasSpentWei += BigInt(tx.gasUsed || '0') * BigInt(tx.gasPrice || '0')
      } catch { /* skip malformed */ }
    }
  }
  const totalGasSpent = Number(gasSpentWei / BigInt(1e9)) / 1e9

  // ─── token volume out (for ARC USDC etc.) ─────────────────────────────────
  let tokenOut = 0
  for (const tx of tokenTxsList) {
    if (tx.from.toLowerCase() === addrLower && tx.value) {
      try {
        const decimals = parseInt(tx.tokenDecimal || tx.decimals || '18', 10)
        tokenOut += Number(BigInt(tx.value)) / Math.pow(10, decimals)
      } catch { /* skip malformed */ }
    }
  }

  // ─── behavior metrics ─────────────────────────────────────────────────────
  const contractCallCounts = new Map<string, number>()
  const methodCounts = new Map<string, number>()
  let deployedContractCount = 0

  for (const tx of txsList) {
    if (!tx.to || tx.to === '' || tx.to === '0x0000000000000000000000000000000000000000') {
      deployedContractCount++
      continue
    }

    const toAddr = tx.to.toLowerCase()
    if (toAddr !== addrLower) {
      contractCallCounts.set(toAddr, (contractCallCounts.get(toAddr) ?? 0) + 1)
    }

    if (tx.functionName && tx.functionName.trim()) {
      const methodName = tx.functionName.split('(')[0].trim()
      if (methodName) {
        methodCounts.set(methodName, (methodCounts.get(methodName) ?? 0) + 1)
      }
    }
  }

  const topContracts = [...contractCallCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([addr, count]) => ({ address: addr, name: null as string | null, callCount: count }))

  const topMethods = [...methodCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([method, count]) => ({ method, count }))

  // ─── time patterns ────────────────────────────────────────────────────────
  const hours = timestamps.map((ts) => new Date(ts * 1000).getUTCHours())
  const hourFreq = new Array(24).fill(0) as number[]
  for (const h of hours) hourFreq[h]++

  const peakHours = [...hourFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count > 0)
    .slice(0, 3)
    .map(([hour]) => hour)

  let hourStdDev = 0
  if (hours.length > 0) {
    const mean = hours.reduce((sum, h) => sum + h, 0) / hours.length
    const variance = hours.reduce((sum, h) => sum + (h - mean) ** 2, 0) / hours.length
    hourStdDev = Math.sqrt(variance)
  }

  // ─── portfolio USD value ──────────────────────────────────────────────────
  let totalPortfolioUSD = 0
  for (const t of tokens) {
    const rate = t.token.exchange_rate ? parseFloat(t.token.exchange_rate) : null
    if (rate && rate > 0) {
      try {
        const decimals = parseInt(t.token.decimals ?? '18', 10)
        const amount = Number(BigInt(t.value)) / Math.pow(10, decimals)
        totalPortfolioUSD += amount * rate
      } catch { /* skip */ }
    }
  }

  return {
    txCount: txsList.length,
    firstActivity,
    lastActivity,
    walletAgeDays,
    activeDaySpread: activeDaysSet.size,
    activeWeeks: activeWeeksSet.size,
    activeMonths: activeMonthsSet.size,
    longestActiveStreak,
    txFrequencyPerDay,
    uniqueContracts: contractCallCounts.size,
    uniqueMethods: methodCounts.size,
    hasDeployedContract: deployedContractCount > 0,
    deployedContractCount,
    topContracts,
    topMethods,
    peakHours,
    hourStdDev,
    totalVolumeIn: totalIn.toString(),
    totalVolumeOut: totalOut.toString(),
    tokenVolumeOut: Math.floor(tokenOut).toString(),
    totalGasSpent,
    avgTxSize: avg.toString(),
    largestTx: largest.toString(),
    tokenCount: tokens.length,
    totalPortfolioUSD,
  }
}

// ─── V1 activity fetcher — used as fallback when pagination returns empty ─────

export interface AddressActivity {
  txCount: number
  contractCount: number
  activeDays: number
  activeWeeks: number
  activeMonths: number
  longestActiveStreak: number
  deployedContractCount: number
  uniqueMethods: number
  maxTxPerDay: number
  consistencyRatio: number
  totalGasUSD: string
  totalGasSpent: number
  firstActivity: string | null
  lastActivity: string | null
  nativeVolumeOut: string
  tokenVolumeOut: string
  busiestDayHours: number
  busiestDayFunctions: number
  avgTimeBetweenTx: number
  minTimeBetweenTx: number
  topContractRatio: number
  topContractDailyRepeat: number
  topContractFunctionDiversity: number
  earlyActivityRatio: number
  weekendActivity: number
  recentActivityRatio: number
  activityTrend: number
  txBurstConcentration: number
  txTypeBreakdown: Record<string, number>
}

export async function getAddressActivity(chain: Chain, address: string): Promise<AddressActivity> {
  const base = V1_URLS[chain]
  const addrLower = address.toLowerCase()
  const opts = { headers: { Accept: 'application/json' }, cache: 'no-store' } as const

  const [txRes, tokenRes, nftRes] = await Promise.allSettled([
    fetch(`${base}?module=account&action=txlist&address=${address}`, opts)
      .then((r) => r.json() as Promise<V1Response<V1TxlistItem>>),
    fetch(`${base}?module=account&action=tokentx&address=${address}`, opts)
      .then((r) => r.json() as Promise<V1Response<V1TokenTxItem>>),
    fetch(`${base}?module=account&action=tokennfttx&address=${address}`, opts)
      .then((r) => r.json() as Promise<V1Response<V1TokenTxItem>>),
  ])

  const txsList = txRes.status === 'fulfilled' && txRes.value.status === '1' ? txRes.value.result : []
  const tokenTxsList = tokenRes.status === 'fulfilled' && tokenRes.value.status === '1' ? tokenRes.value.result : []
  const nftTxsList = nftRes.status === 'fulfilled' && nftRes.value.status === '1' ? nftRes.value.result : []

  // Merge all three into a single array deduplicated by hash
  const seen = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTxs: any[] = []
  for (const tx of txsList) {
    const key = tx.hash.toLowerCase()
    if (!seen.has(key)) { seen.add(key); allTxs.push({ ...tx, _isTxlist: true }) }
  }
  for (const tx of [...tokenTxsList, ...nftTxsList]) {
    const key = tx.hash.toLowerCase()
    if (!seen.has(key)) { seen.add(key); allTxs.push(tx) }
  }

  const totalWei = txsList
    .filter((tx) => tx.from?.toLowerCase() === addrLower)
    .reduce((sum, tx) => sum + BigInt(tx.value || '0'), BigInt(0))
  const nativeVolumeOut = (Number(totalWei / BigInt(1e9)) / 1e9).toString()

  const gasSpentWei = txsList
    .filter((tx) => tx.from?.toLowerCase() === addrLower)
    .reduce((sum, tx) => {
      try { return sum + BigInt(tx.gasUsed || '0') * BigInt(tx.gasPrice || '0') } catch { return sum }
    }, BigInt(0))
  const totalGasSpent = Number(gasSpentWei / BigInt(1e9)) / 1e9

  let tokenOut = 0
  for (const tx of tokenTxsList) {
    if (tx.from.toLowerCase() === addrLower && tx.value) {
      try {
        const decimals = parseInt(tx.tokenDecimal || tx.decimals || '18', 10)
        tokenOut += Number(BigInt(tx.value)) / Math.pow(10, decimals)
      } catch { /* skip */ }
    }
  }

  const activeDaysSet = new Set<string>()
  const activeWeeksSet = new Set<string>()
  const activeMonthsSet = new Set<string>()
  const contracts = new Set<string>()
  let totalGasWei = BigInt(0)
  let minTs: number | null = null
  let maxTs: number | null = null

  for (const tx of allTxs) {
    if (tx.to) contracts.add((tx.to as string).toLowerCase())
    const ts = parseInt(tx.timeStamp as string, 10)
    if (ts) {
      if (minTs === null || ts < minTs) minTs = ts
      if (maxTs === null || ts > maxTs) maxTs = ts
      const d = new Date(ts * 1000)
      const iso = d.toISOString()
      activeDaysSet.add(iso.slice(0, 10))
      activeMonthsSet.add(iso.slice(0, 7))
      const jan4 = new Date(d.getFullYear(), 0, 4)
      const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7)
      activeWeeksSet.add(`${d.getFullYear()}-W${week}`)
    }
    if (tx._isTxlist && tx.gasUsed && tx.gasPrice) {
      try { totalGasWei += BigInt(tx.gasUsed as string) * BigInt(tx.gasPrice as string) } catch { /* skip */ }
    }
  }

  const txCountByDate: Record<string, number> = {}
  allTxs.forEach((tx) => {
    const dateStr = new Date(parseInt(tx.timeStamp as string) * 1000).toISOString().split('T')[0]
    txCountByDate[dateStr] = (txCountByDate[dateStr] || 0) + 1
  })
  const maxTxPerDay = Object.values(txCountByDate).length > 0 ? Math.max(...Object.values(txCountByDate)) : 0
  const dailyCounts = Object.values(txCountByDate).sort((a, b) => b - a)
  const top3Sum = dailyCounts.slice(0, 3).reduce((s, n) => s + n, 0)
  const txBurstConcentration = allTxs.length > 0 ? top3Sum / allTxs.length : 0

  const busiestDay = Object.entries(txCountByDate).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const busiestDayTxs = allTxs.filter(tx =>
    new Date(parseInt(tx.timeStamp) * 1000).toISOString().split('T')[0] === busiestDay
  )
  const busiestDayHoursSet = new Set(busiestDayTxs.map((tx: { timeStamp: string }) =>
    new Date(parseInt(tx.timeStamp) * 1000).getUTCHours()
  ))
  const busiestDayHours = busiestDayHoursSet.size

  const busiestDayFunctionsSet = new Set(
    busiestDayTxs
      .map((tx: { functionName?: string; input?: string }) => tx.functionName?.split('(')[0]?.trim() ?? tx.input?.slice(0, 10) ?? '')
      .filter((f: string) => f !== '' && f !== '0x')
  )
  const busiestDayFunctions = busiestDayFunctionsSet.size

  const sortedByTime = [...allTxs].sort((a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp))
  let totalTimeDiff = 0
  for (let i = 1; i < sortedByTime.length; i++) {
    totalTimeDiff += parseInt(sortedByTime[i].timeStamp) - parseInt(sortedByTime[i - 1].timeStamp)
  }
  const avgTimeBetweenTx = sortedByTime.length > 1 ? totalTimeDiff / (sortedByTime.length - 1) : 0

  let minTimeBetweenTx = Infinity
  for (let i = 1; i < sortedByTime.length; i++) {
    const diff = parseInt(sortedByTime[i].timeStamp) - parseInt(sortedByTime[i - 1].timeStamp)
    if (diff < minTimeBetweenTx) minTimeBetweenTx = diff
  }
  if (minTimeBetweenTx === Infinity) minTimeBetweenTx = 0

  const contractCallMap: Record<string, number> = {}
  allTxs.forEach((tx: { to?: string }) => {
    if (tx.to) contractCallMap[tx.to] = (contractCallMap[tx.to] || 0) + 1
  })
  const topContractCalls = Math.max(...Object.values(contractCallMap), 0)
  const topContractRatio = allTxs.length > 0 ? topContractCalls / allTxs.length : 0
  const topContractAddress = Object.entries(contractCallMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const topContractActiveDays = new Set(
    allTxs
      .filter((tx: { to?: string }) => tx.to === topContractAddress)
      .map((tx: { timeStamp: string }) => new Date(parseInt(tx.timeStamp) * 1000).toISOString().split('T')[0])
  ).size
  const topContractDailyRepeat = activeDaysSet.size > 0 ? topContractActiveDays / activeDaysSet.size : 0

  const topContractFunctionDiversity = new Set(
    allTxs
      .filter((tx: { to?: string }) => tx.to === topContractAddress)
      .map((tx: { functionName?: string; input?: string }) => tx.functionName?.split('(')[0]?.trim() ?? tx.input?.slice(0, 10) ?? '')
      .filter((f: string) => f !== '' && f !== '0x')
  ).size

  const firstTxTime = sortedByTime[0] ? parseInt(sortedByTime[0].timeStamp) : 0
  const earlyTxCount = allTxs.filter((tx: { timeStamp: string }) =>
    parseInt(tx.timeStamp) - firstTxTime < 7 * 86400
  ).length
  const earlyActivityRatio = allTxs.length > 0 ? earlyTxCount / allTxs.length : 0

  const weekendDays = [...activeDaysSet].filter(dateStr => {
    const day = new Date(dateStr).getDay()
    return day === 0 || day === 6
  }).length
  const weekendActivity = activeDaysSet.size > 0 ? weekendDays / activeDaysSet.size : 0

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentActiveDays = [...activeDaysSet].filter(dateStr =>
    new Date(dateStr) >= thirtyDaysAgo
  ).length
  const recentActivityRatio = recentActiveDays / 30

  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
  const prevActiveDays = [...activeDaysSet].filter(dateStr => {
    const d = new Date(dateStr)
    return d >= sixtyDaysAgo && d < thirtyDaysAgo
  }).length
  const activityTrend = prevActiveDays > 0 ? recentActiveDays / prevActiveDays : recentActiveDays > 0 ? 2 : 1

  const firstActivityIso = minTs ? new Date(minTs * 1000).toISOString() : null
  const walletAgeDays = firstActivityIso
    ? Math.floor((Date.now() - new Date(firstActivityIso).getTime()) / 86400000)
    : 1
  const consistencyRatio = Math.round((activeDaysSet.size / Math.max(walletAgeDays, 1)) * 100)
  console.log('[METRICS]', { maxTxPerDay, consistencyRatio, activeDays: activeDaysSet.size })

  // Longest consecutive active day streak
  const sortedDays = [...activeDaysSet].sort()
  let longestActiveStreak = sortedDays.length > 0 ? 1 : 0
  let currentStreak = 1
  for (let i = 1; i < sortedDays.length; i++) {
    const diffDays = Math.round(
      (new Date(sortedDays[i]).getTime() - new Date(sortedDays[i - 1]).getTime()) / 86400000,
    )
    if (diffDays === 1) {
      currentStreak++
      if (currentStreak > longestActiveStreak) longestActiveStreak = currentStreak
    } else {
      currentStreak = 1
    }
  }

  // Contract deployments: txs where to is empty or null
  const deployedTxs = txsList.filter((tx) => tx.to === '' || tx.to === null)
  console.log('[DEPLOYED]', deployedTxs.map((tx) => tx.hash))
  const deployedContractCount = deployedTxs.length

  // Unique methods from all txs
  const uniqueMethodsSet = new Set<string>()
  allTxs.forEach((tx) => {
    if (tx.functionName && tx.functionName.trim() !== '') {
      const methodName = (tx.functionName as string).split('(')[0].trim()
      uniqueMethodsSet.add(methodName)
    } else if (tx.input && tx.input !== '0x' && (tx.input as string).length >= 10) {
      uniqueMethodsSet.add((tx.input as string).slice(0, 10))
    }
  })
  const uniqueMethods = uniqueMethodsSet.size
  console.log('[UNIQUE METHODS]', [...uniqueMethodsSet].sort())

  const methodCountMap: Record<string, number> = {}
  allTxs.forEach((tx: { to?: string; functionName?: string }) => {
    const isDeployment = !tx.to || tx.to === ''
    if (isDeployment) {
      methodCountMap['contract deployment'] = (methodCountMap['contract deployment'] || 0) + 1
    } else {
      const method = tx.functionName?.split('(')[0]?.trim() || 'transfer'
      methodCountMap[method] = (methodCountMap[method] || 0) + 1
    }
  })

  const totalTxForBreakdown = allTxs.length || 1
  const txTypeBreakdown: Record<string, number> = {}
  Object.entries(methodCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([method, count]) => {
      txTypeBreakdown[method] = Math.round((count / totalTxForBreakdown) * 100)
    })

  return {
    txCount: allTxs.length,
    contractCount: contracts.size,
    activeDays: activeDaysSet.size,
    activeWeeks: activeWeeksSet.size,
    activeMonths: activeMonthsSet.size,
    longestActiveStreak,
    deployedContractCount,
    uniqueMethods,
    maxTxPerDay,
    consistencyRatio,
    totalGasUSD: totalGasWei.toString(),
    totalGasSpent,
    firstActivity: minTs ? new Date(minTs * 1000).toISOString() : null,
    lastActivity: maxTs ? new Date(maxTs * 1000).toISOString() : null,
    nativeVolumeOut,
    tokenVolumeOut: Math.floor(tokenOut).toString(),
    busiestDayHours,
    busiestDayFunctions,
    avgTimeBetweenTx,
    minTimeBetweenTx,
    topContractRatio,
    topContractDailyRepeat,
    topContractFunctionDiversity,
    earlyActivityRatio,
    weekendActivity,
    recentActivityRatio,
    activityTrend,
    txBurstConcentration,
    txTypeBreakdown,
  }
}

// ─── V2 API types ─────────────────────────────────────────────────────────────

export interface AddressInfo {
  hash: string
  is_contract: boolean
  name: string | null
  coin_balance: string | null
  creation_transaction_hash: string | null
  is_scam: boolean
  is_verified: boolean
  ens_domain_name: string | null
  public_tags: Array<{ label: string }> | null
}

export interface AddressCounters {
  transactions_count: string
  token_transfers_count: string
  gas_usage_count: string
  validations_count: string
}

interface AddressRef {
  hash: string
  is_contract: boolean
  is_scam: boolean
  is_verified: boolean
  name: string | null
}

export interface Transaction {
  hash: string
  method: string | null
  status: string | null
  block_number: number | null
  timestamp: string | null
  from: AddressRef
  to: AddressRef | null
  value: string
  fee: { type: string; value: string } | null
  gas_used: number | null
}

export interface TokenTransfer {
  type: string
  token: {
    address_hash: string
    symbol: string
    name: string
    type: string
    reputation: string | null
  }
  from: AddressRef
  to: AddressRef
  total: { value: string; decimals: string | null }
  timestamp: string | null
  transaction_hash: string
}

export interface Token {
  token: {
    symbol: string
    name: string
    type: string
    address: string
    decimals: string | null
    exchange_rate: string | null
  }
  value: string
  token_id: string | null
}

export interface InternalTransaction {
  type: string
  from: AddressRef
  to: AddressRef | null
  value: string
  success: boolean
}

export interface SmartContract {
  name: string | null
  verified_at: string | null
  is_verified: boolean
  language: string | null
}

// ─── V2 fetch helpers ─────────────────────────────────────────────────────────

async function fetchBlockscout<T>(chain: Chain, path: string): Promise<T> {
  const url = `${BASE_URLS[chain]}${path}`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Blockscout ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export const getAddressInfo = (chain: Chain, address: string) =>
  fetchBlockscout<AddressInfo>(chain, `/addresses/${address}`)

export const getAddressCounters = (chain: Chain, address: string) =>
  fetchBlockscout<AddressCounters>(chain, `/addresses/${address}/counters`)

export const getTransactions = (chain: Chain, address: string) =>
  fetchBlockscout<{ items: Transaction[] }>(chain, `/addresses/${address}/transactions`)

export const getTokenTransfers = (chain: Chain, address: string) =>
  fetchBlockscout<{ items: TokenTransfer[] }>(chain, `/addresses/${address}/token-transfers`)

export const getTokens = (chain: Chain, address: string) =>
  fetchBlockscout<{ items: Token[] }>(chain, `/addresses/${address}/tokens`)

export const getInternalTransactions = (chain: Chain, address: string) =>
  fetchBlockscout<{ items: InternalTransaction[] }>(chain, `/addresses/${address}/internal-transactions`)

export const getSmartContract = (chain: Chain, address: string) =>
  fetchBlockscout<SmartContract>(chain, `/smart-contracts/${address}`)

// ─── Metrics helpers (used by detectPatterns) ─────────────────────────────────

export interface ComputedMetrics {
  totalVolumeIn: bigint
  totalVolumeOut: bigint
  netVolume: bigint
  avgTxSize: bigint
  largestTx: bigint
  firstActivity: string | null
  lastActivity: string | null
  uniqueInteractions: number
  txFrequencyPerDay: number
  tokenVolumeOut: number
}

export function computeMetrics(
  address: string,
  txs: Transaction[],
  tokenTransfers?: TokenTransfer[],
): ComputedMetrics {
  let totalIn = BigInt(0)
  let totalOut = BigInt(0)
  let largest = BigInt(0)

  const addrLower = address.toLowerCase()
  for (const tx of txs) {
    const val = BigInt(tx.value || '0')
    if (tx.from.hash.toLowerCase() === addrLower) totalOut += val
    else totalIn += val
    if (val > largest) largest = val
  }

  const avg = txs.length > 0 ? (totalIn + totalOut) / BigInt(txs.length) : BigInt(0)

  const timestamps = txs
    .map((t) => (t.timestamp ? new Date(t.timestamp).getTime() : 0))
    .filter(Boolean)

  const oldestFetched = timestamps.length > 0 ? Math.min(...timestamps) : null
  const newestFetched = timestamps.length > 0 ? Math.max(...timestamps) : null

  let txFrequency = 0
  if (oldestFetched && newestFetched) {
    const spanDays = (newestFetched - oldestFetched) / 86400000
    txFrequency = spanDays > 0 ? txs.length / spanDays : txs.length
  }

  const uniqueAddrs = new Set<string>()
  for (const tx of txs) {
    if (tx.to) uniqueAddrs.add(tx.to.hash.toLowerCase())
    uniqueAddrs.add(tx.from.hash.toLowerCase())
  }
  for (const tt of tokenTransfers ?? []) {
    uniqueAddrs.add(tt.from.hash.toLowerCase())
    uniqueAddrs.add(tt.to.hash.toLowerCase())
  }
  uniqueAddrs.delete(addrLower)

  return {
    totalVolumeIn: totalIn,
    totalVolumeOut: totalOut,
    netVolume: totalIn - totalOut,
    avgTxSize: avg,
    largestTx: largest,
    firstActivity: oldestFetched ? new Date(oldestFetched).toISOString() : null,
    lastActivity: newestFetched ? new Date(newestFetched).toISOString() : null,
    uniqueInteractions: uniqueAddrs.size,
    txFrequencyPerDay: txFrequency,
    tokenVolumeOut: 0,
  }
}

export interface DetectedPatterns {
  mev: boolean
  honeypot: boolean
  highVolumeShortAge: boolean
  repeatedCalls: boolean
  bridge: boolean
}

const BRIDGE_KEYWORDS = ['bridge', 'crosschain', 'cross_chain', 'wormhole', 'stargate', 'layerzero', 'hop', 'across', 'celer', 'synapse']
const BRIDGE_CONTRACTS = new Set([
  '0x3154cf16ccdb4c6d922629664174b904d80f2c35',
  '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1',
  '0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf',
  '0xa0c68c638235ee32657e8f720a23cec1bfc77c77',
])

// Contracts whose method names overlap with BRIDGE_KEYWORDS but are not bridges
const KEYWORD_BRIDGE_EXCLUDED_CONTRACTS = new Set([
  '0x12b2018baaa60862c00d083b531d54ce5317b928', // ArcEscrowV2 (DealARC)
])

const REPEATED_CALLS_EXCLUDED = new Set([
  '0x12b2018baaa60862c00d083b531d54ce5317b928', // ArcEscrowV2 (DealARC)
])

const REPEATED_CALLS_EXCLUDED_NAMES = new Set([
  'ERC1967Proxy', 'FiatTokenProxy', 'ArcFlowNFT', 'RecurringOrderExecutor', 'UniversalRouter',
])

export function detectPatterns(
  address: string,
  txs: Transaction[],
  tokenTransfers: TokenTransfer[],
  metrics: ComputedMetrics,
): DetectedPatterns {
  const addrLower = address.toLowerCase()

  // MEV condition 1: 5+ txs in same block AND 3+ distinct contracts AND value > 0
  const blockTxMap = new Map<number, Transaction[]>()
  for (const tx of txs) {
    if (tx.block_number !== null) {
      const list = blockTxMap.get(tx.block_number) ?? []
      list.push(tx)
      blockTxMap.set(tx.block_number, list)
    }
  }
  const sameBlockMev = [...blockTxMap.values()].some((list) => {
    if (list.length < 5) return false
    const contracts = new Set(list.map((tx) => tx.to?.hash?.toLowerCase()).filter(Boolean))
    if (contracts.size < 3) return false
    return list.some((tx) => BigInt(tx.value || '0') > BigInt(0))
  })

  // MEV condition 2: 3 consecutive txs within 2s AND 3 distinct contracts AND txFrequencyPerDay > 30
  const addrTxsSorted = txs
    .filter((tx) => tx.timestamp && tx.from.hash.toLowerCase() === addrLower)
    .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime())
  let sandwichPattern = false
  if (metrics.txFrequencyPerDay > 30) {
    for (let i = 0; i + 2 < addrTxsSorted.length; i++) {
      const t1 = new Date(addrTxsSorted[i].timestamp!).getTime()
      const t3 = new Date(addrTxsSorted[i + 2].timestamp!).getTime()
      if (t3 - t1 <= 2000) {
        const contracts = new Set([
          addrTxsSorted[i].to?.hash?.toLowerCase(),
          addrTxsSorted[i + 1].to?.hash?.toLowerCase(),
          addrTxsSorted[i + 2].to?.hash?.toLowerCase(),
        ].filter(Boolean))
        if (contracts.size >= 3) { sandwichPattern = true; break }
      }
    }
  }
  const mev = sameBlockMev || sandwichPattern

  const honeypot =
    txs.some((tx) => tx.to?.is_scam || tx.from.is_scam) ||
    tokenTransfers.some(
      (tt) =>
        tt.from.is_scam ||
        tt.to.is_scam ||
        (tt.token.reputation !== null && tt.token.reputation !== 'ok'),
    )

  const walletAgeDays = metrics.firstActivity
    ? (Date.now() - new Date(metrics.firstActivity).getTime()) / 86400000
    : Infinity
  const highVolumeShortAge = walletAgeDays < 30 && metrics.tokenVolumeOut > 20

  const callCounts = new Map<string, number>()
  const callMethods = new Map<string, Set<string>>()
  for (const tx of txs) {
    if (!tx.to || tx.to.hash.toLowerCase() === addrLower) continue
    const toAddr = tx.to.hash.toLowerCase()
    if (REPEATED_CALLS_EXCLUDED.has(toAddr)) continue
    if (tx.to.name && REPEATED_CALLS_EXCLUDED_NAMES.has(tx.to.name)) continue
    const method = tx.method ?? ''
    if (method.toLowerCase().startsWith('deploy')) continue
    callCounts.set(toAddr, (callCounts.get(toAddr) ?? 0) + 1)
    if (method) {
      const methods = callMethods.get(toAddr) ?? new Set()
      methods.add(method)
      callMethods.set(toAddr, methods)
    }
  }
  const repeatThreshold = callCounts.size > 10 ? 40 : 20
  const repeatedCalls = [...callCounts.entries()].some(
    ([addr, count]) => count > repeatThreshold && (callMethods.get(addr)?.size ?? 0) < 4
  )

  const bridge = txs.some((tx) => {
    if (tx.to && BRIDGE_CONTRACTS.has(tx.to.hash.toLowerCase())) return true
    if (!tx.method) return false
    if (tx.to && KEYWORD_BRIDGE_EXCLUDED_CONTRACTS.has(tx.to.hash.toLowerCase())) return false
    const m = tx.method.toLowerCase()
    return BRIDGE_KEYWORDS.some((kw) => m.includes(kw.toLowerCase()))
  })

  return { mev, honeypot, highVolumeShortAge, repeatedCalls, bridge }
}
