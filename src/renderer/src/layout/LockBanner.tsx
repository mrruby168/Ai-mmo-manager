import { useState } from 'react'
import type { LockTask } from '@shared/types'
import { Button } from '../common/Button'
import { useLock } from '../state/LockContext'
import { useToast } from '../state/ToastContext'

export function LockBanner(): React.JSX.Element | null {
  const { runningTasks } = useLock()
  const { pushToast } = useToast()
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  if (runningTasks.length === 0) {
    return null
  }

  async function handleCancel(task: LockTask): Promise<void> {
    setCancellingId(task.taskId)
    // channel null = tác vụ cũ không rõ kênh → hủy tất cả như hành vi trước.
    const result = await window.api.chat.cancelTask(task.channel ?? undefined)
    setCancellingId(null)
    if (result.ok) {
      pushToast(
        result.data.canceled ? `Đã gửi yêu cầu hủy: ${task.label || 'tác vụ AI'}` : 'Tác vụ đã kết thúc',
        'info'
      )
    } else {
      pushToast(result.error.message, 'error')
    }
  }

  return (
    <div
      className={`lock-banner${runningTasks.length > 1 ? ' lock-banner--multi' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="lock-banner__spinner" aria-hidden="true" />
      <div className="lock-banner__tasks">
        {runningTasks.map((task) => (
          <div className="lock-banner__task" key={task.taskId}>
            <span>AI đang thực thi: {task.label || 'tác vụ AI'}</span>
            <span className="spacer" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleCancel(task)}
              loading={cancellingId === task.taskId}
            >
              Hủy
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
