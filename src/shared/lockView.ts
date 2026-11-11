import type { AiChannel, LockState, LockTask } from './types'

/**
 * Danh sách tác vụ AI đang chạy. Payload cũ chỉ có owner/taskId nên được dựng
 * thành một tác vụ `channel: null` (xung đột với mọi kênh, như hành vi trước).
 */
export function deriveRunningTasks(lock: LockState): LockTask[] {
  if (lock.tasks) {
    return lock.tasks
  }
  if (lock.owner === 'ai' && lock.taskId) {
    return [
      {
        taskId: lock.taskId,
        channel: null,
        label: lock.label ?? '',
        startedAt: lock.startedAt ?? ''
      }
    ]
  }
  return []
}

/** Kênh bận khi có tác vụ cùng kênh, hoặc tác vụ không khai báo kênh. */
export function isChannelBusy(tasks: LockTask[], channel: AiChannel): boolean {
  return tasks.some((task) => task.channel === null || task.channel === channel)
}
