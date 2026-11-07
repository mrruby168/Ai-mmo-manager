import type { CostType } from './constants'

export type CostTone = 'free' | 'paid' | 'unverified'

export interface CostLabel {
  label: string
  tone: CostTone
}

export function formatUsd(value: number, forceDecimals = false): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: forceDecimals ? 2 : 0,
    maximumFractionDigits: 2
  })
  return formatter.format(value)
}

export function formatAmount(value: number, symbol: string): string {
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 6
  })
  return `${formatter.format(value)} ${symbol}`
}

export function formatCost(costType: CostType, amountUsd: number | null): CostLabel {
  if (costType === 'free') {
    return { label: 'FREE', tone: 'free' }
  }
  if (costType === 'paid') {
    return { label: amountUsd === null ? 'Có phí' : formatUsd(amountUsd), tone: 'paid' }
  }
  return { label: 'Chưa xác minh', tone: 'unverified' }
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
