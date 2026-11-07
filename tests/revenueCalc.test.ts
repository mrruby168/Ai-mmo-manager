import { describe, expect, it } from 'vitest'
import type { RevenueEntry } from '@shared/types'
import { computeEntryProfitUsd, computeRevenueTotals } from '@shared/revenue-calc'

function makeEntry(overrides: Partial<RevenueEntry>): RevenueEntry {
  return {
    id: 1,
    projectId: 'PRJ-001',
    projectNameSnapshot: 'Demo',
    rewardKind: 'cash',
    rewardSymbol: 'USD',
    estimatedAmount: null,
    estimatedUsd: null,
    receivedAmount: null,
    receivedUsd: null,
    receivedAt: null,
    claimStatus: 'pending',
    participationCostUsd: 0,
    txFeeUsd: 0,
    txHash: null,
    evidenceNote: null,
    evidenceFile: null,
    note: '',
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
    ...overrides
  }
}

describe('revenue-calc', () => {
  it('counts claimed cash with USD into realized and subtracts costs', () => {
    const totals = computeRevenueTotals([
      makeEntry({
        claimStatus: 'claimed',
        receivedAmount: 100,
        receivedUsd: 100,
        participationCostUsd: 10,
        txFeeUsd: 2
      })
    ])

    expect(totals.realizedUsd).toBe(100)
    expect(totals.totalCostUsd).toBe(12)
    expect(totals.netProfitUsd).toBe(88)
    expect(totals.unconverted).toEqual([])
  })

  it('keeps tokens without USD and points out of realized revenue', () => {
    const totals = computeRevenueTotals([
      makeEntry({ claimStatus: 'claimed', rewardKind: 'token', rewardSymbol: 'ABC', receivedAmount: 50 }),
      makeEntry({ id: 2, claimStatus: 'claimed', rewardKind: 'points', rewardSymbol: 'points', receivedAmount: 1000 })
    ])

    expect(totals.realizedUsd).toBe(0)
    expect(totals.unconverted).toEqual([
      { symbol: 'ABC', amount: 50 },
      { symbol: 'points', amount: 1000 }
    ])
  })

  it('sums pending estimated USD but never counts claimed entries as pending', () => {
    const totals = computeRevenueTotals([
      makeEntry({ estimatedUsd: 200 }),
      makeEntry({ id: 2, claimStatus: 'claimable', estimatedUsd: 50 }),
      makeEntry({ id: 3, claimStatus: 'claimed', receivedUsd: 10, estimatedUsd: 999 }),
      makeEntry({ id: 4, rewardKind: 'points', estimatedUsd: 999 })
    ])

    expect(totals.pendingUsd).toBe(250)
    expect(totals.realizedUsd).toBe(10)
  })

  it('rounds totals to two decimals', () => {
    const totals = computeRevenueTotals([
      makeEntry({ claimStatus: 'claimed', receivedUsd: 0.1, participationCostUsd: 0.05 }),
      makeEntry({ id: 2, claimStatus: 'claimed', receivedUsd: 0.2, participationCostUsd: 0.05 })
    ])

    expect(totals.realizedUsd).toBe(0.3)
    expect(totals.totalCostUsd).toBe(0.1)
    expect(totals.netProfitUsd).toBe(0.2)
  })

  it('computes per-entry profit only for claimed entries with USD', () => {
    expect(computeEntryProfitUsd(makeEntry({ claimStatus: 'claimed', receivedUsd: 30, participationCostUsd: 5, txFeeUsd: 1 }))).toBe(24)
    expect(computeEntryProfitUsd(makeEntry({ claimStatus: 'pending', receivedUsd: 30 }))).toBeNull()
    expect(
      computeEntryProfitUsd(makeEntry({ claimStatus: 'claimed', rewardKind: 'points', rewardSymbol: 'points', receivedAmount: 30 }))
    ).toBeNull()
  })
})
