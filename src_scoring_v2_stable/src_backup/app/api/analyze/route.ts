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
  computeMetrics,
  detectPatterns,
  type Chain,
} from '@/lib/blockscout'
import { analyzeAddress } from '@/lib/groq'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { address: string; chain: Chain }
    const { address, chain } = body

    if (!address || typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Invalid Ethereum address format' }, { status: 400 })
    }

    const validChains: Chain[] = ['arc', 'ethereum', 'base', 'soneium']
    if (!validChains.includes(chain)) {
      return NextResponse.json({ error: 'Invalid chain' }, { status: 400 })
    }

    const [infoResult, countersResult, txResult, tokenTransferResult, internalTxResult, activityResult] =
      await Promise.allSettled([
        getAddressInfo(chain, address),
        getAddressCounters(chain, address),
        getTransactions(chain, address),
        getTokenTransfers(chain, address),
        getInternalTransactions(chain, address),
        getAddressActivity(chain, address),
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
    const activity = activityResult.status === 'fulfilled' ? activityResult.value : null

    let smartContract = null
    if (info.is_contract) {
      smartContract = await getSmartContract(chain, address).catch(() => null)
    }

    const counterTxCount = counters ? parseInt(counters.transactions_count, 10) || 0 : 0
    const txCount = Math.max(counterTxCount, txs.length)
    const tokenTransferCount = counters ? parseInt(counters.token_transfers_count, 10) || 0 : 0

    const baseMetrics = computeMetrics(address, txs, tokenTransfers)

    // Volume out: pre-divided whole units from getAddressActivity (USDC for ARC, ETH for others)
    const volumeOut = chain === 'arc'
      ? (activity?.tokenVolumeOut ?? '0')
      : (activity?.nativeVolumeOut ?? '0')
    const volumeSymbol = chain === 'arc' ? 'USDC' : 'ETH'

    // tx/day: use activeDays (unique days with any tx) as denominator
    const txFrequencyPerDay = activity?.activeDays && activity.activeDays > 0
      ? txCount / activity.activeDays
      : baseMetrics.txFrequencyPerDay

    const metrics = {
      ...baseMetrics,
      firstActivity: activity?.firstActivity ?? baseMetrics.firstActivity,
      lastActivity: activity?.lastActivity ?? baseMetrics.lastActivity,
      uniqueInteractions: activity?.contractCount ?? baseMetrics.uniqueInteractions,
      txFrequencyPerDay,
    }

    // Detect suspicious patterns from raw on-chain data
    const detectedPatterns = detectPatterns(address, txs, tokenTransfers, metrics)

    // Primary balance: USDC token for ARC, native coin for all other chains
    let primaryBalance: { value: string; symbol: string; label: string }
    if (chain === 'arc') {
      const tokens = await getTokens(chain, address).catch(() => ({ items: [] }))
      const usdc = tokens.items.find((t) => t.token.symbol === 'USDC')
      if (usdc) {
        const decimals = parseInt(usdc.token.decimals ?? '6', 10)
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

    // Risky contracts: counterparties flagged as scam in transactions or token transfers
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

    // Contract interactions: group outgoing txs by destination, top 5 by call count
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
        contractMap.set(key, { address: tx.to.hash, name: tx.to.name, callCount: 0, methods: new Map(), totalValue: BigInt(0) })
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
        topMethod: c.methods.size > 0
          ? [...c.methods.entries()].sort((a, b) => b[1] - a[1])[0][0]
          : null,
        totalValueSent: c.totalValue.toString(),
      }))

    const balanceWei = info.coin_balance ?? '0'

    const aiInput = {
      address,
      isContract: info.is_contract,
      txCount,
      balance: balanceWei,
      firstActivity: metrics.firstActivity,
      lastActivity: metrics.lastActivity,
      txFrequencyPerDay: metrics.txFrequencyPerDay,
      uniqueInteractions: metrics.uniqueInteractions,
      totalVolumeIn: metrics.totalVolumeIn.toString(),
      totalVolumeOut: metrics.totalVolumeOut.toString(),
      avgTxSize: metrics.avgTxSize.toString(),
      largestTx: metrics.largestTx.toString(),
      recentTxSample: txs.slice(0, 10).map((tx) => ({
        hash: tx.hash,
        from: tx.from.hash,
        to: tx.to?.hash ?? null,
        value: tx.value,
        method: tx.method,
        timestamp: tx.timestamp,
      })),
    }

    const aiAnalysis = await analyzeAddress(aiInput)

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
      },
      transactions: txs,
      tokenTransfers,
      internalTxs,
      smartContract,
      metrics: {
        totalVolumeIn: metrics.totalVolumeIn.toString(),
        totalVolumeOut: volumeOut,
        volumeSymbol,
        netVolume: metrics.netVolume.toString(),
        avgTxSize: metrics.avgTxSize.toString(),
        largestTx: metrics.largestTx.toString(),
        firstActivity: metrics.firstActivity,
        lastActivity: metrics.lastActivity,
        uniqueInteractions: metrics.uniqueInteractions,
        txFrequencyPerDay: metrics.txFrequencyPerDay,
        activeDays: activity?.activeDays ?? null,
        activeWeeks: activity?.activeWeeks ?? null,
        activeMonths: activity?.activeMonths ?? null,
        totalGasUSD: activity?.totalGasUSD ?? null,
      },
      detectedPatterns,
      primaryBalance,
      riskyContracts,
      contractInteractions,
      aiAnalysis,
    })
  } catch (err) {
    console.error('Analyze error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
