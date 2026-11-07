import type { RevenueEntry } from './types'
import { round2 } from './format'

export interface UnconvertedTotal {
  symbol: string
  amount: number
}

export interface RevenueTotals {
  realizedUsd: number
  pendingUsd: number
  totalCostUsd: number
  netProfitUsd: number
  unconverted: UnconvertedTotal[]
}

function entryCost(entry: RevenueEntry): number {
  return (entry.participationCostUsd ?? 0) + (entry.txFeeUsd ?? 0)
}

export function computeEntryProfitUsd(entry: RevenueEntry): number | null {
  if (entry.claimStatus !== 'claimed' || entry.receivedUsd === null) {
    return null
  }
  if (entry.rewardKind === 'points') {
    return null
  }
  return round2(entry.receivedUsd - entryCost(entry))
}

export function computeRevenueTotals(entries: RevenueEntry[]): RevenueTotals {
  let realizedUsd = 0
  let pendingUsd = 0
  let totalCostUsd = 0
  const unconvertedMap = new Map<string, number>()

  for (const entry of entries) {
    totalCostUsd += entryCost(entry)

    if (entry.claimStatus === 'claimed') {
      const hasUsd = entry.receivedUsd !== null && entry.rewardKind !== 'points'
      if (hasUsd) {
        realizedUsd += entry.receivedUsd ?? 0
      }
      const unconvertedAmount = entry.receivedAmount
      if ((entry.rewardKind === 'points' || entry.receivedUsd === null) && unconvertedAmount !== null) {
        const current = unconvertedMap.get(entry.rewardSymbol) ?? 0
        unconvertedMap.set(entry.rewardSymbol, current + unconvertedAmount)
      }
      continue
    }

    if (entry.rewardKind !== 'points' && entry.estimatedUsd !== null) {
      pendingUsd += entry.estimatedUsd
    }
  }

  const unconverted = Array.from(unconvertedMap.entries())
    .map(([symbol, amount]) => ({ symbol, amount: round2(amount) }))
    .sort((left, right) => left.symbol.localeCompare(right.symbol))

  const roundedCost = round2(totalCostUsd)
  const roundedRealized = round2(realizedUsd)

  return {
    realizedUsd: roundedRealized,
    pendingUsd: round2(pendingUsd),
    totalCostUsd: roundedCost,
    netProfitUsd: round2(roundedRealized - roundedCost),
    unconverted
  }
}
