import type { ClaimStatus, RewardKind } from '@shared/constants'
import type { RevenueEntry } from '@shared/types'
import { getDatabase } from './connection'

const COLUMNS = `id, project_id, project_name_snapshot, reward_kind, reward_symbol, estimated_amount,
  estimated_usd, received_amount, received_usd, received_at, claim_status, participation_cost_usd,
  tx_fee_usd, tx_hash, evidence_note, evidence_file, note, created_at, updated_at`

interface RevenueRow {
  id: number
  project_id: string | null
  project_name_snapshot: string
  reward_kind: string
  reward_symbol: string
  estimated_amount: number | null
  estimated_usd: number | null
  received_amount: number | null
  received_usd: number | null
  received_at: string | null
  claim_status: string
  participation_cost_usd: number
  tx_fee_usd: number
  tx_hash: string | null
  evidence_note: string | null
  evidence_file: string | null
  note: string
  created_at: string
  updated_at: string
}

export interface RevenueRecord {
  projectId: string | null
  projectNameSnapshot: string
  rewardKind: RewardKind
  rewardSymbol: string
  estimatedAmount: number | null
  estimatedUsd: number | null
  receivedAmount: number | null
  receivedUsd: number | null
  receivedAt: string | null
  claimStatus: ClaimStatus
  participationCostUsd: number
  txFeeUsd: number
  txHash: string | null
  evidenceNote: string | null
  evidenceFile: string | null
  note: string
  createdAt: string
  updatedAt: string
}

export interface RevenueMutableFields extends Omit<RevenueRecord, 'createdAt'> {}

function mapRow(row: RevenueRow): RevenueEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    projectNameSnapshot: row.project_name_snapshot,
    rewardKind: row.reward_kind as RewardKind,
    rewardSymbol: row.reward_symbol,
    estimatedAmount: row.estimated_amount,
    estimatedUsd: row.estimated_usd,
    receivedAmount: row.received_amount,
    receivedUsd: row.received_usd,
    receivedAt: row.received_at,
    claimStatus: row.claim_status as ClaimStatus,
    participationCostUsd: row.participation_cost_usd,
    txFeeUsd: row.tx_fee_usd,
    txHash: row.tx_hash,
    evidenceNote: row.evidence_note,
    evidenceFile: row.evidence_file,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listRevenue(projectId?: string): RevenueEntry[] {
  const statement = projectId
    ? getDatabase().prepare(`SELECT ${COLUMNS} FROM revenue_entries WHERE project_id = ? ORDER BY created_at DESC, id DESC`)
    : getDatabase().prepare(`SELECT ${COLUMNS} FROM revenue_entries ORDER BY created_at DESC, id DESC`)
  const rows = projectId ? statement.all(projectId) : statement.all()
  return (rows as unknown as RevenueRow[]).map(mapRow)
}

export function getRevenue(id: number): RevenueEntry | null {
  const row = getDatabase().prepare(`SELECT ${COLUMNS} FROM revenue_entries WHERE id = ?`).get(id)
  return row ? mapRow(row as unknown as RevenueRow) : null
}

export function insertRevenue(record: RevenueRecord): number {
  const result = getDatabase()
    .prepare(
      `INSERT INTO revenue_entries (
        project_id, project_name_snapshot, reward_kind, reward_symbol, estimated_amount, estimated_usd,
        received_amount, received_usd, received_at, claim_status, participation_cost_usd, tx_fee_usd,
        tx_hash, evidence_note, evidence_file, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      record.projectId,
      record.projectNameSnapshot,
      record.rewardKind,
      record.rewardSymbol,
      record.estimatedAmount,
      record.estimatedUsd,
      record.receivedAmount,
      record.receivedUsd,
      record.receivedAt,
      record.claimStatus,
      record.participationCostUsd,
      record.txFeeUsd,
      record.txHash,
      record.evidenceNote,
      record.evidenceFile,
      record.note,
      record.createdAt,
      record.updatedAt
    )
  return Number(result.lastInsertRowid)
}

export function updateRevenue(id: number, fields: RevenueMutableFields): boolean {
  const result = getDatabase()
    .prepare(
      `UPDATE revenue_entries SET
        project_id = ?, project_name_snapshot = ?, reward_kind = ?, reward_symbol = ?, estimated_amount = ?,
        estimated_usd = ?, received_amount = ?, received_usd = ?, received_at = ?, claim_status = ?,
        participation_cost_usd = ?, tx_fee_usd = ?, tx_hash = ?, evidence_note = ?, evidence_file = ?,
        note = ?, updated_at = ?
      WHERE id = ?`
    )
    .run(
      fields.projectId,
      fields.projectNameSnapshot,
      fields.rewardKind,
      fields.rewardSymbol,
      fields.estimatedAmount,
      fields.estimatedUsd,
      fields.receivedAmount,
      fields.receivedUsd,
      fields.receivedAt,
      fields.claimStatus,
      fields.participationCostUsd,
      fields.txFeeUsd,
      fields.txHash,
      fields.evidenceNote,
      fields.evidenceFile,
      fields.note,
      fields.updatedAt,
      id
    )
  return Number(result.changes) > 0
}

export function deleteRevenue(id: number): boolean {
  const result = getDatabase().prepare('DELETE FROM revenue_entries WHERE id = ?').run(id)
  return Number(result.changes) > 0
}
