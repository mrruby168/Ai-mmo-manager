import { EVENTS } from '@shared/ipc-channels'
import type { AiProgress } from '@shared/types'
import { acquireAiLock, releaseAiLock, canStartAiTask, LockError } from '../services/lockManager'
import { broadcastToRenderers } from '../ipc/guard'

interface ActiveTask {
  taskId: string
  label: string
  controller: AbortController
}

const activeTasks = new Map<string, ActiveTask>()
let taskSequence = 0

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

export interface AiTaskReporter {
  report: (step: string, done: number, total: number, message: string) => void
}

export async function runAiTask<T>(
  label: string,
  taskIdPrefix: string,
  fn: (signal: AbortSignal, reporter: AiTaskReporter) => Promise<T>
): Promise<T> {
  const feasibility = canStartAiTask()
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
    }
  }

  acquireAiLock(taskId, label)
  activeTasks.set(taskId, { taskId, label, controller })
  reporter.report('Bắt đầu', 0, 1, `${label}...`)

  try {
    return await fn(controller.signal, reporter)
  } catch (error) {
    if (controller.signal.aborted) {
      reporter.report('Đã hủy', 1, 1, 'Tác vụ đã bị hủy bởi người dùng')
    }
    throw error
  } finally {
    activeTasks.delete(taskId)
    releaseAiLock(taskId)
  }
}
