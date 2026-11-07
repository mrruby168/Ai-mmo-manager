import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { revenueInputSchema } from '@shared/schemas'
import type { RevenueInput } from '@shared/schemas'
import { computeRevenueTotals } from '@shared/revenue-calc'
import type { RevenueTotals } from '@shared/revenue-calc'
import type { RevenueEntry } from '@shared/types'
import { getProject } from '../services/projectService'
import { getCurrentLayout } from './dataPathService'
import { logError } from './logger'
import {
  deleteRevenue,
  getRevenue,
  insertRevenue,
  listRevenue,
  updateRevenue
} from '../db/revenueRepo'
import type { RevenueMutableFields } from '../db/revenueRepo'

export class RevenueError extends Error {
  readonly code: 'INVALID' | 'NOT_FOUND'

  constructor(code: RevenueError['code'], message: string) {
    super(message)
    this.name = 'RevenueError'
    this.code = code
  }
}

const ATTACHMENT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.txt'])
const ATTACHMENT_MAX_BYTES = 10_000_000

function normalisePayload(input: RevenueInput): RevenueMutableFields {
  const project = input.projectId ? getProject(input.projectId) : null
  if (input.projectId && !project) {
    throw new RevenueError('INVALID', 'Dự án đã chọn không tồn tại')
  }

  const now = new Date().toISOString()
  const projectNameSnapshot =
    input.projectNameSnapshot.trim() || project?.name || 'Khoản thưởng không gắn dự án'

  const participationCostUsd = input.participationCostUsd ?? 0
  const txFeeUsd = input.txFeeUsd ?? 0
  const isPoints = input.rewardKind === 'points'
  const claimStatus = input.claimStatus ?? 'pending'

  return {
    projectId: input.projectId ?? null,
    projectNameSnapshot: projectNameSnapshot.slice(0, 200),
    rewardKind: input.rewardKind,
    rewardSymbol: input.rewardSymbol.trim().toUpperCase().slice(0, 20),
    estimatedAmount: input.estimatedAmount ?? null,
    estimatedUsd: isPoints ? null : (input.estimatedUsd ?? null),
    receivedAmount: isPoints ? (input.receivedAmount ?? null) : (input.receivedAmount ?? null),
    receivedUsd: isPoints ? null : (input.receivedUsd ?? null),
    receivedAt: input.receivedAt ?? null,
    claimStatus,
    participationCostUsd,
    txFeeUsd,
    txHash: input.txHash ?? null,
    evidenceNote: input.evidenceNote ?? null,
    evidenceFile: input.evidenceFile ?? null,
    note: input.note ?? '',
    updatedAt: now
  }
}

export function listRevenueEntries(projectId?: string): RevenueEntry[] {
  return listRevenue(projectId)
}

export function getRevenueEntry(id: number): RevenueEntry | null {
  return getRevenue(id)
}

export function getRevenueSummary(): RevenueTotals {
  return computeRevenueTotals(listRevenue())
}

export function saveRevenue(rawInput: unknown, id?: number): RevenueEntry {
  const parsed = revenueInputSchema.parse(rawInput)
  const fields = normalisePayload(parsed)

  if (id === undefined) {
    const now = new Date().toISOString()
    const insertedId = insertRevenue({ ...fields, createdAt: now })
    const stored = getRevenue(insertedId)
    if (!stored) {
      throw new RevenueError('NOT_FOUND', 'Không đọc lại được khoản thưởng vừa lưu')
    }
    return stored
  }

  const existing = getRevenue(id)
  if (!existing) {
    throw new RevenueError('NOT_FOUND', 'Không tìm thấy khoản thưởng cần sửa')
  }
  const applied = updateRevenue(id, fields)
  if (!applied) {
    throw new RevenueError('NOT_FOUND', 'Không lưu được khoản thưởng')
  }
  const stored = getRevenue(id)
  if (!stored) {
    throw new RevenueError('NOT_FOUND', 'Không đọc lại được khoản thưởng vừa lưu')
  }
  return stored
}

export function removeRevenue(id: number): { id: number } {
  const existing = getRevenue(id)
  if (!existing) {
    throw new RevenueError('NOT_FOUND', 'Không tìm thấy khoản thưởng cần xóa')
  }
  deleteRevenue(id)
  return { id }
}

export interface EvidenceResult {
  fileName: string
}

export function attachEvidenceFile(revenueId: number, sourcePath: string): EvidenceResult {
  const existing = getRevenue(revenueId)
  if (!existing) {
    throw new RevenueError('NOT_FOUND', 'Không tìm thấy khoản thưởng để đính kèm bằng chứng')
  }

  const stats = statSync(sourcePath)
  if (!stats.isFile()) {
    throw new RevenueError('INVALID', 'Đường dẫn đính kèm không phải là file')
  }
  if (stats.size > ATTACHMENT_MAX_BYTES) {
    throw new RevenueError('INVALID', 'File bằng chứng lớn hơn 10 MB')
  }
  const extension = extname(sourcePath).toLowerCase()
  if (!ATTACHMENT_EXTENSIONS.has(extension)) {
    throw new RevenueError('INVALID', 'Chỉ chấp nhận PNG, JPG, WEBP, PDF, TXT')
  }

  const attachmentsDir = getCurrentLayout().attachmentsDir
  mkdirSync(attachmentsDir, { recursive: true })

  const safeName = basename(sourcePath).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'evidence'
  const storedName = `${revenueId}-${randomUUID().slice(0, 8)}-${safeName}`
  const targetPath = join(attachmentsDir, storedName)

  try {
    copyFileSync(sourcePath, targetPath)
  } catch (error) {
    logError(`Không sao chép được file bằng chứng cho khoản thưởng ${revenueId}`, error)
    throw new RevenueError('INVALID', 'Không sao chép được file bằng chứng')
  }

  updateRevenue(revenueId, { ...normaliseExisting(existing), evidenceFile: storedName, updatedAt: new Date().toISOString() })
  return { fileName: storedName }
}

function normaliseExisting(entry: RevenueEntry): RevenueMutableFields {
  return {
    projectId: entry.projectId,
    projectNameSnapshot: entry.projectNameSnapshot,
    rewardKind: entry.rewardKind,
    rewardSymbol: entry.rewardSymbol,
    estimatedAmount: entry.estimatedAmount,
    estimatedUsd: entry.estimatedUsd,
    receivedAmount: entry.receivedAmount,
    receivedUsd: entry.receivedUsd,
    receivedAt: entry.receivedAt,
    claimStatus: entry.claimStatus,
    participationCostUsd: entry.participationCostUsd,
    txFeeUsd: entry.txFeeUsd,
    txHash: entry.txHash,
    evidenceNote: entry.evidenceNote,
    evidenceFile: entry.evidenceFile,
    note: entry.note,
    updatedAt: entry.updatedAt
  }
}
