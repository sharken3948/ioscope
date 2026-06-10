export type Chain = 'arc' | 'ethereum' | 'base' | 'soneium'

const BASE_URLS: Record<Chain, string> = {
  arc: 'https://testnet.arcscan.app/api/v2',
  ethereum: 'https://eth.blockscout.com/api/v2',
  base: 'https://base.blockscout.com/api/v2',
  soneium: 'https://soneium.blockscout.com/api/v2',
}

const V1_URLS: Record<Chain, string> = {
  arc: 'https://testnet.arcscan.app/api',
  ethereum: 'https://eth.blockscout.com/api',
  base: 'https://base.blockscout.com/api',
  soneium: 'https://soneium.blockscout.com/api',
}

/** Returns the ISO timestamp of the oldest transaction for an address, or null if none found. */
export async function getFirstTransactionTimestamp(chain: Chain, address: string): Promise<string | null> {
  const url = `${V1_URLS[chain]}?module=account&action=txlist&address=${address}&sort=asc&page=1&offset=1`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) return null
  const data = (await res.json()) as { status: string; result: Array<{ timeStamp: string }> }
  if (data.status !== '1' || !data.result?.length) return null
  const unixSec = parseInt(data.result[0].timeStamp, 10)
  if (!unixSec) return null
  return new Date(unixSec * 1000).toISOString()
}

export interface AddressActivity {
  contractCount: number
  activeDays: number
  activeWeeks: number
  activeMonths: number
  totalGasUSD: string
  firstActivity: string | null
  lastActivity: string | null
  /** Sum of txlist value where from===address (wei, 18 decimals) */
  nativeVolumeOut: string
  /** Sum of tokentx value where from===address (smallest token unit, typically 6 decimals for USDC) */
  tokenVolumeOut: string
}

type V1TxlistItem = {
  hash: string
  to: string
  from: string
  timeStamp: string
  gasUsed: string
  gasPrice: string
  value: string
}
type V1TokenTxItem = {
  hash: string
  to: string
  from: string
  contractAddress?: string
  timeStamp: string
  value: string
}
type V1Response<T> = { status: string; result: T[] }

/** Fetches txlist + tokentx + tokennfttx, merges by hash, computes activity stats. */
export async function getAddressActivity(chain: Chain, address: string): Promise<AddressActivity> {
  const base = V1_URLS[chain]
  const addrLower = address.toLowerCase()
  const opts = { headers: { Accept: 'application/json' }, cache: 'no-store' } as const

  const [txRes, tokenRes, nftRes] = await Promise.allSettled([
    fetch(`${base}?module=account&action=txlist&address=${address}&sort=desc`, opts)
      .then((r) => r.json() as Promise<V1Response<V1TxlistItem>>),
    fetch(`${base}?module=account&action=tokentx&address=${address}&sort=desc`, opts)
      .then((r) => r.json() as Promise<V1Response<V1TokenTxItem>>),
    fetch(`${base}?module=account&action=tokennfttx&address=${address}&sort=desc`, opts)
      .then((r) => r.json() as Promise<V1Response<V1TokenTxItem>>),
  ])

  type MergedEntry = {
    to: string | undefined
    timeStamp: string
    gasUsed?: string
    gasPrice?: string
    fromTxlist: boolean
  }
  const txMap = new Map<string, MergedEntry>()

  if (txRes.status === 'fulfilled' && txRes.value.status === '1') {
    for (const tx of txRes.value.result) {
      txMap.set(tx.hash, {
        to: tx.to,
        timeStamp: tx.timeStamp,
        gasUsed: tx.gasUsed,
        gasPrice: tx.gasPrice,
        fromTxlist: true,
      })
    }
  }
  for (const settled of [tokenRes, nftRes]) {
    if (settled.status === 'fulfilled' && settled.value.status === '1') {
      for (const tx of settled.value.result) {
        if (!txMap.has(tx.hash)) {
          txMap.set(tx.hash, {
            to: tx.contractAddress || tx.to,
            timeStamp: tx.timeStamp,
            fromTxlist: false,
          })
        }
      }
    }
  }

  // Volume out — computed from raw results (from field not stored in merged map)
  let nativeOut = BigInt(0)
  if (txRes.status === 'fulfilled' && txRes.value.status === '1') {
    for (const tx of txRes.value.result) {
      if (tx.from.toLowerCase() === addrLower && tx.value) {
        try { nativeOut += BigInt(tx.value) } catch { /* skip malformed */ }
      }
    }
  }
  let tokenOut = BigInt(0)
  if (tokenRes.status === 'fulfilled' && tokenRes.value.status === '1') {
    for (const tx of tokenRes.value.result) {
      if (tx.from.toLowerCase() === addrLower && tx.value) {
        try { tokenOut += BigInt(tx.value) } catch { /* skip malformed */ }
      }
    }
  }

  const contracts = new Set<string>()
  const activeDaysSet = new Set<string>()
  const activeWeeksSet = new Set<string>()
  const activeMonthsSet = new Set<string>()
  let totalGas = BigInt(0)
  let minTs: number | null = null
  let maxTs: number | null = null

  for (const tx of txMap.values()) {
    if (tx.to && tx.to.toLowerCase() !== addrLower) contracts.add(tx.to.toLowerCase())

    const ts = parseInt(tx.timeStamp, 10)
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

    if (tx.fromTxlist && tx.gasUsed && tx.gasPrice) {
      totalGas += BigInt(tx.gasUsed) * BigInt(tx.gasPrice)
    }
  }

  return {
    contractCount: contracts.size,
    activeDays: activeDaysSet.size,
    activeWeeks: activeWeeksSet.size,
    activeMonths: activeMonthsSet.size,
    totalGasUSD: totalGas.toString(),
    firstActivity: minTs ? new Date(minTs * 1000).toISOString() : null,
    lastActivity: maxTs ? new Date(maxTs * 1000).toISOString() : null,
    nativeVolumeOut: Number(nativeOut / BigInt('1000000000000000000')).toString(),
    tokenVolumeOut: Math.floor(Number(tokenOut) / 1e18).toString(),
  }
}

export interface AddressInfo {
  hash: string
  is_contract: boolean
  name: string | null
  coin_balance: string | null
  creation_transaction_hash: string | null
  is_scam: boolean
  is_verified: boolean
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
  token: { symbol: string; name: string; type: string; address: string; decimals: string | null }
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

export interface ComputedMetrics {
  totalVolumeIn: bigint
  totalVolumeOut: bigint
  netVolume: bigint
  avgTxSize: bigint
  largestTx: bigint
  /** Estimated first-ever transaction timestamp (extrapolated from txCount when data is partial) */
  firstActivity: string | null
  lastActivity: string | null
  uniqueInteractions: number
  txFrequencyPerDay: number
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

  // Compute tx frequency from the fetched window
  let txFrequency = 0
  if (oldestFetched && newestFetched) {
    const spanDays = (newestFetched - oldestFetched) / 86400000
    txFrequency = spanDays > 0 ? txs.length / spanDays : txs.length
  }

  const firstActivity: string | null = oldestFetched ? new Date(oldestFetched).toISOString() : null

  const lastActivity = newestFetched ? new Date(newestFetched).toISOString() : null

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
    firstActivity,
    lastActivity,
    uniqueInteractions: uniqueAddrs.size,
    txFrequencyPerDay: txFrequency,
  }
}

export interface DetectedPatterns {
  mev: boolean
  honeypot: boolean
  highVolumeShortAge: boolean
  repeatedCalls: boolean
  bridge: boolean
}

const BRIDGE_KEYWORDS = ['bridge', 'deposit', 'relay', 'transferRemote', 'sendToL2', 'xcall', 'dispatch']
const BRIDGE_CONTRACTS = new Set([
  '0x3154cf16ccdb4c6d922629664174b904d80f2c35', // Base Bridge
  '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1', // Optimism Gateway
  '0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf', // Polygon Bridge
  '0xa0c68c638235ee32657e8f720a23cec1bfc77c77', // Polygon PoS Bridge
])

export function detectPatterns(
  address: string,
  txs: Transaction[],
  tokenTransfers: TokenTransfer[],
  metrics: ComputedMetrics,
): DetectedPatterns {
  const addrLower = address.toLowerCase()

  // MEV / Frontrunning: tx/day > 100 OR multiple txs in the same block
  const blockCounts = new Map<number, number>()
  for (const tx of txs) {
    if (tx.block_number !== null) {
      blockCounts.set(tx.block_number, (blockCounts.get(tx.block_number) ?? 0) + 1)
    }
  }
  const sameBlockTxs = [...blockCounts.values()].some((c) => c > 1)
  const mev = metrics.txFrequencyPerDay > 100 || sameBlockTxs

  // Honeypot: any counterparty (from/to on txs or token transfers) flagged as scam,
  // or any token with a suspicious/scam reputation
  const honeypot =
    txs.some((tx) => tx.to?.is_scam || tx.from.is_scam) ||
    tokenTransfers.some(
      (tt) =>
        tt.from.is_scam ||
        tt.to.is_scam ||
        (tt.token.reputation !== null && tt.token.reputation !== 'ok'),
    )

  // High Volume Short Age: wallet age < 30 days AND outgoing volume > 10 ETH
  const walletAgeDays = metrics.firstActivity
    ? (Date.now() - new Date(metrics.firstActivity).getTime()) / 86400000
    : Infinity
  const volumeOutEth = Number(metrics.totalVolumeOut) / 1e18
  const highVolumeShortAge = walletAgeDays < 30 && volumeOutEth > 10

  // Repeated Contract Calls: same `to` address appears more than 10 times
  const callCounts = new Map<string, number>()
  for (const tx of txs) {
    if (tx.to && tx.to.hash.toLowerCase() !== addrLower) {
      const toAddr = tx.to.hash.toLowerCase()
      callCounts.set(toAddr, (callCounts.get(toAddr) ?? 0) + 1)
    }
  }
  const repeatedCalls = [...callCounts.values()].some((c) => c > 10)

  // Bridge Usage: method name contains bridge keywords OR known bridge contract
  const bridge = txs.some((tx) => {
    if (tx.to && BRIDGE_CONTRACTS.has(tx.to.hash.toLowerCase())) return true
    if (!tx.method) return false
    const m = tx.method.toLowerCase()
    return BRIDGE_KEYWORDS.some((kw) => m.includes(kw.toLowerCase()))
  })

  return { mev, honeypot, highVolumeShortAge, repeatedCalls, bridge }
}
