import { randomUUID } from 'node:crypto'
import { LIMITS } from '@shared/constants'
import type { PendingAction } from '@shared/types'
import type { ProjectImportItem } from '@shared/schemas'

const MAX_PENDING_ACTIONS = 10

export type PendingActionPayload =
  | { type: 'add'; items: ProjectImportItem[] }
  | { type: 'update'; projectId: string; changes: Record<string, unknown> }
  | { type: 'delete'; projectIds: string[] }

export interface PendingActionRecord {
  action: PendingAction
  payload: PendingActionPayload
  createdAt: number
  expectedRowVersions: Record<string, number>
}

export class PendingActionError extends Error {
  readonly code: 'NOT_FOUND' | 'EXPIRED' | 'FULL' | 'INVALID'

  constructor(code: PendingActionError['code'], message: string) {
    super(message)
    this.name = 'PendingActionError'
    this.code = code
  }
}

const actions = new Map<string, PendingActionRecord>()

export function clearPendingActions(): void {
  actions.clear()
}

function isExpired(record: PendingActionRecord): boolean {
  return Date.now() - record.createdAt > LIMITS.pendingActionTtlMs
}

export function createPendingAction(input: {
  type: PendingAction['type']
  summary: string
  details: string[]
  before: string | null
  after: string | null
  payload: PendingActionPayload
  expectedRowVersions?: Record<string, number>
}): PendingAction {
  if (actions.size > 0) {
    for (const [id, record] of Array.from(actions.entries())) {
      if (isExpired(record)) {
        actions.delete(id)
      }
    }
  }
  if (actions.size >= MAX_PENDING_ACTIONS) {
    throw new PendingActionError('FULL', 'Có quá nhiều hành động chờ xác nhận, hãy OK hoặc Hủy bớt trước')
  }

  const action: PendingAction = {
    id: randomUUID(),
    type: input.type,
    summary: input.summary,
    details: input.details,
    before: input.before,
    after: input.after
  }

  actions.set(action.id, {
    action,
    payload: input.payload,
    createdAt: Date.now(),
    expectedRowVersions: { ...(input.expectedRowVersions ?? {}) }
  })

  return action
}

export function peekPendingAction(id: string): PendingActionRecord | null {
  const record = actions.get(id)
  if (!record) {
    return null
  }
  if (isExpired(record)) {
    return null
  }
  return record
}

export function consumePendingAction(id: string): PendingActionRecord {
  const record = actions.get(id)
  if (!record) {
    throw new PendingActionError('NOT_FOUND', 'Hành động không tồn tại hoặc đã được thực thi')
  }
  if (isExpired(record)) {
    actions.delete(id)
    throw new PendingActionError('EXPIRED', 'Hành động đã hết hạn (30 phút), hãy tạo yêu cầu lại')
  }
  actions.delete(id)
  return record
}

export function cancelPendingAction(id: string): boolean {
  return actions.delete(id)
}

export function expectedRowVersionsMatch(record: PendingActionRecord, actualRowVersions: Record<string, number>): boolean {
  return Object.entries(record.expectedRowVersions).every(([projectId, expected]) => actualRowVersions[projectId] === expected)
}
