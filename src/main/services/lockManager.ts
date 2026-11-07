import { LOCK_POLICY } from '@shared/constants'
import type { LockState } from '@shared/types'

export type LockErrorCode = 'AI_BUSY' | 'USER_EDITING'

export class LockError extends Error {
  readonly code: LockErrorCode

  constructor(code: LockErrorCode, message: string) {
    super(message)
    this.name = 'LockError'
    this.code = code
  }
}

type LockListener = (state: LockState) => void

const idleState = (): LockState => ({
  owner: 'none',
  taskId: null,
  label: null,
  startedAt: null,
  userEditing: false
})

let state: LockState = idleState()
const listeners = new Set<LockListener>()

function emit(): void {
  const snapshot = getLockState()
  for (const listener of listeners) {
    listener(snapshot)
  }
}

export function getLockState(): LockState {
  return { ...state }
}

export function onLockChanged(listener: LockListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function acquireAiLock(taskId: string, label: string): void {
  if (state.owner === 'ai') {
    throw new LockError('AI_BUSY', 'AI đang thực thi tác vụ khác')
  }
  if (state.userEditing) {
    throw new LockError('USER_EDITING', 'Bạn đang chỉnh sửa, hãy hoàn tất rồi thử lại')
  }
  state = {
    owner: 'ai',
    taskId,
    label,
    startedAt: new Date().toISOString(),
    userEditing: false
  }
  emit()
}

export function releaseAiLock(taskId?: string): void {
  if (state.owner !== 'ai') {
    return
  }
  if (taskId && state.taskId !== taskId) {
    return
  }
  state = idleState()
  emit()
}

export function beginUserEditing(): void {
  if (state.owner === 'ai') {
    throw new LockError('AI_BUSY', 'AI đang thực thi, không thể bắt đầu chỉnh sửa')
  }
  if (state.userEditing) {
    return
  }
  state = { ...state, userEditing: true }
  emit()
}

export function endUserEditing(): void {
  if (!state.userEditing) {
    return
  }
  state = { ...state, userEditing: false }
  emit()
}

export function assertUserCanMutate(): void {
  if (state.owner === 'ai') {
    throw new LockError('AI_BUSY', 'AI đang thực thi, thao tác bị tạm khóa')
  }
}

export function canStartAiTask(): { ok: true } | { ok: false; reason: string } {
  if (state.owner === 'ai') {
    return { ok: false, reason: 'AI đang thực thi tác vụ khác' }
  }
  if (state.userEditing) {
    return { ok: false, reason: 'Hoàn tất chỉnh sửa trước khi chạy AI' }
  }
  return { ok: true }
}

export function isAllowedWhileAiBusy(action: string): boolean {
  return (LOCK_POLICY.allowedWhileAiBusy as readonly string[]).includes(action)
}

export function resetLockForTests(): void {
  state = idleState()
  listeners.clear()
}
