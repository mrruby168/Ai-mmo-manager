import { EVENTS } from '@shared/ipc-channels'
import type { AiChannel, AiProgress } from '@shared/types'
import { acquireAiLock, releaseAiLock, canStartAiTask, LockError } from '../services/lockManager'
import { broadcastToRenderers } from '../ipc/guard'
import { logInfo } from '../services/logger'
import { appendAiLog, beginAiLog, finishAiLog, setAiLogProgress } from './aiActivityLog'

interface ActiveTask {
  taskId: string
  label: string
  /** null/undefined = legacy caller without a channel (conflicts with everything). */
  channel: AiChannel | null
  controller: AbortController
}

const activeTasks = new Map<string, ActiveTask>()
let taskSequence = 0

/** Task id prefixes are the channel contract: news-, scan-, chat-, confirm-. */
function channelForPrefix(prefix: string): AiChannel | undefined {
  switch (prefix) {
    case 'news':
      return 'news'
    case 'scan':
      return 'scan'
    case 'chat':
    case 'confirm':
      return 'chat'
    default:
      return undefined
  }
}

function channelLabel(channel: AiChannel | null | undefined): string {
  return channel ?? 'none'
}

export function hasActiveAiTask(): boolean {
  return activeTasks.size > 0
}

export function getActiveTaskId(): string | null {
  const first = activeTasks.values().next()
  return first.done ? null : first.value.taskId
}

export function cancelAiTask(taskId?: string): boolean {
  if (taskId) {
    const task = activeTasks.get(taskId)
    if (!task) {
      return false
    }
    task.controller.abort()
    return true
  }
  if (activeTasks.size === 0) {
    return false
  }
  for (const task of activeTasks.values()) {
    task.controller.abort()
  }
  return true
}

/** Abort only the tasks of one channel; returns true when something was aborted. */
export function cancelAiChannel(channel: AiChannel): boolean {
  let canceled = false
  for (const task of activeTasks.values()) {
    if (task.channel === channel) {
      task.controller.abort()
      canceled = true
    }
  }
  return canceled
}

export interface AiTaskReporter {
  report: (step: string, done: number, total: number, message: string) => void
}

export async function runAiTask<T>(
  label: string,
  taskIdPrefix: string,
  fn: (signal: AbortSignal, reporter: AiTaskReporter) => Promise<T>
): Promise<T> {
  const channel = channelForPrefix(taskIdPrefix)
  const feasibility = canStartAiTask(channel)
  if (!feasibility.ok) {
    throw new LockError('USER_EDITING', feasibility.reason)
  }

  taskSequence += 1
  const taskId = `${taskIdPrefix}-${Date.now().toString(36)}-${taskSequence}`
  const controller = new AbortController()

  const reporter: AiTaskReporter = {
    report(step, done, total, message) {
      const payload: AiProgress = { taskId, step, done, total, message }
      broadcastToRenderers(EVENTS.aiProgress, payload)
      if (channel) {
        // FIX 3: mỗi bước vừa cập nhật thanh tiến trình vừa ghi một dòng Activity Log.
        setAiLogProgress(channel, done, total)
        appendAiLog(channel, 'step', message)
      }
    }
  }

  acquireAiLock(taskId, label, channel)
  activeTasks.set(taskId, { taskId, label, channel: channel ?? null, controller })
  if (channel) {
    // Tác vụ mới bắt đầu: xóa log cũ của kênh (không lưu qua lần chạy trước).
    beginAiLog(channel)
  }
  logInfo(`AI task start: ${label} [${channelLabel(channel)}], đang chạy song song: ${activeTasks.size}`)
  reporter.report('Bắt đầu', 0, 1, `${label}...`)

  try {
    return await fn(controller.signal, reporter)
  } catch (error) {
    if (controller.signal.aborted) {
      reporter.report('Đã hủy', 1, 1, 'Tác vụ đã bị hủy bởi người dùng')
      if (channel) {
        appendAiLog(channel, 'warn', 'Đã dừng giữa chừng')
      }
    } else if (channel) {
      appendAiLog(channel, 'error', error instanceof Error ? error.message : 'Lỗi không xác định')
    }
    throw error
  } finally {
    activeTasks.delete(taskId)
    releaseAiLock(taskId)
    if (channel) {
      finishAiLog(channel)
    }
    logInfo(`AI task end: ${label} [${channelLabel(channel)}], đang chạy song song: ${activeTasks.size}`)
  }
}
