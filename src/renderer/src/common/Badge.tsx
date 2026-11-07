import type { ReactNode } from 'react'
import type { CostType, ProjectStatus, RiskLevel, VerificationState } from '@shared/constants'
import { formatCost } from '@shared/format'

type BadgeTone = 'free' | 'paid' | 'unverified' | 'not-joined' | 'in-progress' | 'completed' | 'verified' | 'warning' | 'error' | 'info' | 'neutral'

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }): React.JSX.Element {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

const statusTone: Record<ProjectStatus, BadgeTone> = {
  not_joined: 'not-joined',
  in_progress: 'in-progress',
  completed: 'completed'
}

const statusLabel: Record<ProjectStatus, string> = {
  not_joined: 'Chưa tham gia',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn thành'
}

export function StatusBadge({ status }: { status: ProjectStatus }): React.JSX.Element {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>
}

export function CostBadge({ costType, amountUsd }: { costType: CostType; amountUsd: number | null }): React.JSX.Element {
  const cost = formatCost(costType, amountUsd)
  return <Badge tone={cost.tone}>{cost.label}</Badge>
}

export function VerificationBadge({ verification }: { verification: VerificationState }): React.JSX.Element {
  return verification === 'verified' ? (
    <Badge tone="verified">✓ Đã xác minh</Badge>
  ) : (
    <Badge tone="unverified">Chưa xác minh</Badge>
  )
}

const riskTone: Record<RiskLevel, BadgeTone> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
  unknown: 'unverified'
}

const riskLabel: Record<RiskLevel, string> = {
  low: 'Rủi ro thấp',
  medium: 'Rủi ro trung bình',
  high: 'Rủi ro cao',
  unknown: 'Chưa rõ rủi ro'
}

export function RiskBadge({ level }: { level: RiskLevel }): React.JSX.Element {
  return <Badge tone={riskTone[level]}>{riskLabel[level]}</Badge>
}
