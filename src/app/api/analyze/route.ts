import { NextRequest, NextResponse } from 'next/server'
import {
  getAddressInfo,
  getAddressCounters,
  getTransactions,
  getTokenTransfers,
  getTokens,
  getInternalTransactions,
  getSmartContract,
  getAddressActivity,
  computeWalletSummary,
  computeMetrics,
  detectPatterns,
  CHAIN_CONFIGS,
  type Chain,
} from '@/lib/blockscout'
import { analyzeAddress } from '@/lib/groq'
import { calculateRiskScore, calculateBotProbability, getRiskFactors, ScoringMetrics } from '@/lib/scoring'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { address: string; chain: Chain }
    const { address, chain } = body

    if (!address || typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Invalid Ethereum address format' }, { status: 400 })
    }

    const validChains: Chain[] = ['arc', 'base', 'soneium']
    if (!validChains.includes(chain)) {
      return NextResponse.json({ error: 'Invalid chain' }, { status: 400 })
    }

    // V2 API calls run in parallel
    const [
      infoResult,
      countersResult,
      txResult,
      tokenTransferResult,
      internalTxResult,
      tokensResult,
    ] = await Promise.allSettled([
      getAddressInfo(chain, address),
      getAddressCounters(chain, address),
      getTransactions(chain, address),
      getTokenTransfers(chain, address),
      getInternalTransactions(chain, address),
      getTokens(chain, address),
    ])

    if (infoResult.status === 'rejected') {
      return NextResponse.json(
        { error: `Address not found or explorer unavailable (${chain})` },
        { status: 404 },
      )
    }

    const info = infoResult.value
    const counters = countersResult.status === 'fulfilled' ? countersResult.value : null
    const txs = txResult.status === 'fulfilled' ? txResult.value.items : []
    const tokenTransfers =
      tokenTransferResult.status === 'fulfilled' ? tokenTransferResult.value.items : []
    const internalTxs =
      internalTxResult.status === 'fulfilled' ? internalTxResult.value.items : []
    const tokens = tokensResult.status === 'fulfilled' ? tokensResult.value.items : []

    let smartContract = null
    if (info.is_contract) {
      smartContract = await getSmartContract(chain, address).catch(() => null)
    }

    // walletSummary with empty tx arrays — still computes tokenCount and totalPortfolioUSD from tokens
    const walletSummary = computeWalletSummary(address, [], [], tokens)

    // getAddressActivity is the primary V1 source (no pagination, no limits)
    const activity = await getAddressActivity(chain, address).catch(() => null)

    // Wallet age from activity timestamps for frequency calculation
    const activityAgeDays =
      activity?.firstActivity && activity?.lastActivity
        ? Math.max(1, Math.ceil(
            (new Date(activity.lastActivity).getTime() - new Date(activity.firstActivity).getTime()) / 86400000,
          ))
        : 1

    const effectiveFirstActivity = activity?.firstActivity ?? null
    const effectiveLastActivity = activity?.lastActivity ?? null
    const effectiveActiveDays = activity?.activeDays ?? 0
    const effectiveActiveWeeks = activity?.activeWeeks ?? 0
    const effectiveActiveMonths = activity?.activeMonths ?? 0
    const effectiveTxFrequency = activity ? activity.txCount / Math.max(activityAgeDays, 1) : 0
    const effectiveUniqueContracts = activity?.contractCount ?? 0
    const effectiveTokenVolumeOut = activity?.tokenVolumeOut ?? '0'
    const gasSpent =
      activity?.totalGasUSD && activity.totalGasUSD !== '0'
        ? parseFloat((Number(BigInt(activity.totalGasUSD)) / 1e18).toFixed(3))
        : null

    // Enrich topContracts names using V2 tx data (V2 has names, V1 doesn't)
    const v2NameMap = new Map<string, string | null>()
    for (const tx of txs) {
      if (tx.to?.hash) v2NameMap.set(tx.to.hash.toLowerCase(), tx.to.name)
    }
    const enrichedTopContracts = walletSummary.topContracts.map((c) => ({
      ...c,
      name: v2NameMap.get(c.address.toLowerCase()) ?? null,
    }))

    // Counters for accurate total tx count
    const counterTxCount = counters ? parseInt(counters.transactions_count, 10) || 0 : 0
    const txCount = Math.max(counterTxCount, activity?.txCount ?? 0)
    const tokenTransferCount = counters ? parseInt(counters.token_transfers_count, 10) || 0 : 0

    // detectPatterns uses V2 txs (has scam flags) with WalletSummary metrics for accuracy
    const baseMetrics = computeMetrics(address, txs, tokenTransfers)
    const metricsForPatterns = {
      ...baseMetrics,
      txFrequencyPerDay: effectiveTxFrequency,
      firstActivity: effectiveFirstActivity,
      totalVolumeOut: BigInt(walletSummary.totalVolumeOut),
      tokenVolumeOut: parseFloat(activity?.tokenVolumeOut ?? '0') || 0,
    }
    const detectedPatterns = detectPatterns(address, txs, tokenTransfers, metricsForPatterns)

    // Primary balance: USDC token for ARC, native coin for all other chains
    let primaryBalance: { value: string; symbol: string; label: string }
    if (chain === 'arc') {
      const usdc = tokens.find((t) => t.token.symbol === 'USDC')
      if (usdc) {
        const decimals = parseInt(usdc.token.decimals ?? String(CHAIN_CONFIGS[chain].usdcDecimals), 10)
        const raw = BigInt(usdc.value)
        const whole = raw / BigInt(10 ** decimals)
        const frac = raw % BigInt(10 ** decimals)
        const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2)
        primaryBalance = { value: `${whole}.${fracStr} USDC`, symbol: 'USDC', label: 'USDC BALANCE' }
      } else {
        primaryBalance = { value: '0 USDC', symbol: 'USDC', label: 'USDC BALANCE' }
      }
    } else {
      primaryBalance = { value: info.coin_balance ?? '0', symbol: 'ETH', label: 'ETH BALANCE' }
    }

    // Risky contracts: counterparties flagged as scam in V2 txs / token transfers
    const riskyContractsSeen = new Set<string>()
    const riskyContracts: Array<{ address: string; name: string | null }> = []
    const addrLower = address.toLowerCase()
    for (const tx of txs) {
      for (const party of [tx.from, tx.to]) {
        if (party && party.is_scam && party.hash.toLowerCase() !== addrLower) {
          if (!riskyContractsSeen.has(party.hash.toLowerCase())) {
            riskyContractsSeen.add(party.hash.toLowerCase())
            riskyContracts.push({ address: party.hash, name: party.name })
          }
        }
      }
    }
    for (const tt of tokenTransfers) {
      for (const party of [tt.from, tt.to]) {
        if (party.is_scam && party.hash.toLowerCase() !== addrLower) {
          if (!riskyContractsSeen.has(party.hash.toLowerCase())) {
            riskyContractsSeen.add(party.hash.toLowerCase())
            riskyContracts.push({ address: party.hash, name: party.name })
          }
        }
      }
    }

    // Contract interactions: top 5 from V2 txs (has names + method info for display)
    type ContractEntry = {
      address: string
      name: string | null
      callCount: number
      methods: Map<string, number>
      totalValue: bigint
    }
    const contractMap = new Map<string, ContractEntry>()
    for (const tx of txs) {
      if (!tx.to || tx.from.hash.toLowerCase() !== addrLower) continue
      const key = tx.to.hash.toLowerCase()
      if (!contractMap.has(key)) {
        contractMap.set(key, {
          address: tx.to.hash,
          name: tx.to.name,
          callCount: 0,
          methods: new Map(),
          totalValue: BigInt(0),
        })
      }
      const entry = contractMap.get(key)!
      entry.callCount++
      if (tx.method) entry.methods.set(tx.method, (entry.methods.get(tx.method) ?? 0) + 1)
      entry.totalValue += BigInt(tx.value || '0')
    }
    const contractInteractions = [...contractMap.values()]
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 5)
      .map((c) => ({
        address: c.address,
        name: c.name,
        callCount: c.callCount,
        topMethod:
          c.methods.size > 0
            ? [...c.methods.entries()].sort((a, b) => b[1] - a[1])[0][0]
            : null,
        totalValueSent: c.totalValue.toString(),
      }))

    const balanceWei = info.coin_balance ?? '0'
    const publicTags = (info.public_tags ?? []).map((t) => t.label)

    // Volume out for display: USDC units for ARC, ETH (human-readable) for others
    const volumeOut = chain === 'arc' ? effectiveTokenVolumeOut : (activity?.nativeVolumeOut ?? '0')
    const volumeSymbol = chain === 'arc' ? 'USDC' : 'ETH'

    const aiInput = {
      address,
      isContract: info.is_contract,
      isScam: info.is_scam,
      isVerified: info.is_verified,
      ensDomain: info.ens_domain_name,
      publicTags,
      balance: balanceWei,
      gasUsed: counters?.gas_usage_count ?? null,
      txCount,
      firstActivity: effectiveFirstActivity,
      lastActivity: effectiveLastActivity,
      walletAgeDays: walletSummary.walletAgeDays,
      activeDaySpread: effectiveActiveDays,
      activeWeeks: effectiveActiveWeeks,
      activeMonths: effectiveActiveMonths,
      longestActiveStreak: activity?.longestActiveStreak ?? 0,
      txFrequencyPerDay: effectiveTxFrequency,
      uniqueContracts: effectiveUniqueContracts,
      uniqueMethods: activity?.uniqueMethods ?? 0,
      hasDeployedContract: (activity?.deployedContractCount ?? 0) > 0,
      deployedContractCount: activity?.deployedContractCount ?? 0,
      maxTxPerDay: activity?.maxTxPerDay ?? 0,
      consistencyRatio: activity?.consistencyRatio ?? 0,
      usdcBalance: primaryBalance?.value ?? null,
      gasSpent: activity?.totalGasSpent ?? null,
      topContracts: enrichedTopContracts,
      topMethods: walletSummary.topMethods,
      peakHours: walletSummary.peakHours,
      hourStdDev: walletSummary.hourStdDev,
      totalVolumeIn: walletSummary.totalVolumeIn,
      totalVolumeOut: walletSummary.totalVolumeOut,
      tokenCount: walletSummary.tokenCount,
      totalPortfolioUSD: walletSummary.totalPortfolioUSD,
      detectedPatterns,
      riskyContracts,
      txTypeBreakdown: activity?.txTypeBreakdown ?? {},
    }

    const lastActiveDaysAgo = activity?.lastActivity
      ? Math.floor((Date.now() - new Date(activity.lastActivity).getTime()) / 86400000)
      : 999

    const walletAgeDaysCalc = activity?.firstActivity
      ? Math.floor((Date.now() - new Date(activity.firstActivity).getTime()) / 86400000)
      : 0

    const scoringMetrics: ScoringMetrics = {
      txCount: activity?.txCount ?? 0,
      walletAgeDays: walletAgeDaysCalc,
      activeDays: activity?.activeDays ?? 0,
      maxTxPerDay: activity?.maxTxPerDay ?? 0,
      busiestDayHours: activity?.busiestDayHours ?? 0,
      busiestDayFunctions: activity?.busiestDayFunctions ?? 0,
      avgTimeBetweenTx: activity?.avgTimeBetweenTx ?? 0,
      minTimeBetweenTx: activity?.minTimeBetweenTx ?? 0,
      topContractRatio: activity?.topContractRatio ?? 0,
      topContractDailyRepeat: activity?.topContractDailyRepeat ?? 0,
      topContractFunctionDiversity: activity?.topContractFunctionDiversity ?? 0,
      uniqueContracts: activity?.contractCount ?? 0,
      earlyActivityRatio: activity?.earlyActivityRatio ?? 0,
      usdcBalance: parseFloat(primaryBalance?.value ?? '0') || 0,
      tokenVolumeOut: parseFloat(activity?.tokenVolumeOut ?? '0') || 0,
      gasSpent: activity?.totalGasSpent ?? 0,
      consistencyRatio: activity?.consistencyRatio ?? 0,
      recentActivityRatio: activity?.recentActivityRatio ?? 0,
      weekendActivity: activity?.weekendActivity ?? 0,
      lastActiveDaysAgo,
      activityTrend: activity?.activityTrend ?? 1,
      longestStreak: activity?.longestActiveStreak ?? 0,
      deployedContractCount: activity?.deployedContractCount ?? 0,
      txBurstConcentration: activity?.txBurstConcentration ?? 0,
    }

    console.log('[SCORING INPUT]', {
      deployedContractCount: scoringMetrics.deployedContractCount,
      longestStreak: scoringMetrics.longestStreak,
      consistencyRatio: scoringMetrics.consistencyRatio,
      uniqueContracts: scoringMetrics.uniqueContracts,
      activeDays: scoringMetrics.activeDays,
    })
    const calculatedRiskScore = calculateRiskScore(scoringMetrics, detectedPatterns)
    const calculatedBotProbability = calculateBotProbability(scoringMetrics, detectedPatterns)

    const riskFactors = getRiskFactors(scoringMetrics, detectedPatterns)

    const advice: string[] = []
    if (calculatedRiskScore <= 20) {
      advice.push('This wallet appears trustworthy based on its activity history.')
    } else if (calculatedRiskScore <= 40) {
      advice.push('This wallet shows normal user behavior with minor uncertainties.')
    } else if (calculatedRiskScore <= 60) {
      advice.push('Exercise some caution when interacting with this wallet.')
    } else {
      advice.push('Be very cautious — this wallet shows suspicious behavior patterns.')
    }
    if (calculatedBotProbability <= 20) {
      advice.push('Very likely a human user based on activity patterns.')
    } else if (calculatedBotProbability <= 50) {
      advice.push('Probably a human user but some automated patterns detected.')
    } else {
      advice.push('High bot probability — verify before trusting this wallet.')
    }

    const aiAnalysis = await analyzeAddress({
      ...aiInput,
      calculatedRiskScore,
      calculatedBotProbability,
    })

    console.log('[DEBUG RESPONSE]', JSON.stringify({
      txCount,
      contractCount: effectiveUniqueContracts,
      firstActivity: effectiveFirstActivity,
      tokenVolumeOut: volumeOut,
      txFrequencyPerDay: effectiveTxFrequency,
      activeDaySpread: effectiveActiveDays,
      uniqueContracts: effectiveUniqueContracts,
      gasUsed: counters ? parseInt(counters.gas_usage_count, 10) || null : null,
    }, null, 2))

    return NextResponse.json({
      addressInfo: {
        hash: info.hash,
        is_contract: info.is_contract,
        name: info.name,
        balance: balanceWei,
        tx_count: txCount,
        token_transfers_count: tokenTransferCount,
        is_scam: info.is_scam,
        is_verified: info.is_verified,
        creation_tx_hash: info.creation_transaction_hash,
        ens_domain_name: info.ens_domain_name,
        public_tags: publicTags,
      },
      transactions: txs,
      tokenTransfers,
      internalTxs,
      smartContract,
      metrics: {
        txCount,
        totalVolumeIn: walletSummary.totalVolumeIn,
        tokenVolumeOut: volumeOut,
        volumeSymbol,
        firstActivity: effectiveFirstActivity,
        lastActivity: effectiveLastActivity,
        txFrequencyPerDay: effectiveTxFrequency,
        activeDaySpread: effectiveActiveDays,
        activeWeeks: effectiveActiveWeeks,
        activeMonths: effectiveActiveMonths,
        longestActiveStreak: activity?.longestActiveStreak ?? 0,
        uniqueContracts: effectiveUniqueContracts,
        uniqueMethods: activity?.uniqueMethods ?? 0,
        deployedContractCount: activity?.deployedContractCount ?? 0,
        totalPortfolioUSD: walletSummary.totalPortfolioUSD,
        peakHours: walletSummary.peakHours,
        usdcBalance: chain === 'arc' ? primaryBalance.value : null,
        gasUsed: counters ? parseInt(counters.gas_usage_count, 10) || null : null,
        gasSpent,
        gasToken: CHAIN_CONFIGS[chain].gasToken,
      },
      detectedPatterns,
      primaryBalance,
      riskyContracts,
      contractInteractions,
      topContracts: enrichedTopContracts,
      topMethods: walletSummary.topMethods,
      aiAnalysis,
      riskScore: calculatedRiskScore,
      botProbability: calculatedBotProbability,
      riskFactors,
      advice,
    })
  } catch (err) {
    console.error('Analyze error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
