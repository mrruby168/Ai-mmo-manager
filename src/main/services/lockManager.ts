import { LOCK_POLICY } from '@shared/constants'
import type { AiChannel, LockState } from '@shared/types'

export type { AiChannel }

export type LockErrorCode = 'AI_BUSY' | 'USER_EDITING'

export class LockError extends Error {
  readonly code: LockErrorCode

  constructor(code: LockErrorCode, message: string) {
    super(message)
    this.name = 'LockError'
    this.code = code
  }
}

/**
 * One AI task. `channel` is null for callers that did not declare a channel
 * (legacy behaviour: conflict with every other task).
 */
export interface RunningAiTask {
  taskId: string
  channel: AiChannel | null
  label: string
  startedAt: string
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
/** Insertion order = start order; the first entry is what legacy callers see. */
const runningTasks = new Map<string, RunningAiTask>()
const listeners = new Set<LockListener>()

function emit(): void {
  const snapshot = getLockState()
  for (const listener of listeners) {
    listener(snapshot)
  }
}

/**
 * `LockState` keeps its original five fields so the renderer contract and the
 * existing tests stay untouched. It always mirrors the OLDEST running task.
 */
function syncStateFromTasks(): void {
  const first = runningTasks.values().next()
  if (first.done) {
    state = { ...idleState(), userEditing: state.userEditing }
    return
  }
  const task = first.value
  state = {
    owner: 'ai',
    taskId: task.taskId,
    label: task.label,
    startedAt: task.startedAt,
    userEditing: state.userEditing
  }
}

/**
 * Same channel never runs twice; a task without a channel excludes everything.
 */
function hasConflict(channel?: AiChannel): boolean {
  if (runningTasks.size === 0) {
    return false
  }
  if (!channel) {
    return true
  }
  for (const task of runningTasks.values()) {
    if (task.channel === null || task.channel === channel) {
      return true
    }
  }
  return false
}

export function getLockState(): LockState {
  return { ...state }
}

export function getRunningAiTasks(): RunningAiTask[] {
  return [...runningTasks.values()].map((task) => ({ ...task }))
}

export function onLockChanged(listener: LockListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function acquireAiLock(taskId: string, label: string, channel?: AiChannel): void {
  if (hasConflict(channel)) {
    throw new LockError('AI_BUSY', 'AI đang thực thi tác vụ khác')
  }
  if (state.userEditing) {
    throw new LockError('USER_EDITING', 'Bạn đang chỉnh sửa, hãy hoàn tất rồi thử lại')
  }
  runningTasks.set(taskId, {
    taskId,
    channel: channel ?? null,
    label,
    startedAt: new Date().toISOString()
  })
  syncStateFromTasks()
  emit()
}

export function releaseAiLock(taskId?: string): void {
  if (taskId) {
    if (!runningTasks.has(taskId)) {
      return
    }
    runningTasks.delete(taskId)
    syncStateFromTasks()
    emit()
    return
  }
  if (runningTasks.size === 0) {
    return
  }
  runningTasks.clear()
  syncStateFromTasks()
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

export function canStartAiTask(channel?: AiChannel): { ok: true } | { ok: false; reason: string } {
  if (hasConflict(channel)) {
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
  runningTasks.clear()
  state = idleState()
  listeners.clear()
}
