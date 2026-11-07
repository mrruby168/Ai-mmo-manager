import { useState } from 'react'
import { Button } from '../common/Button'
import { useLock } from '../state/LockContext'
import { useToast } from '../state/ToastContext'

export function LockBanner(): React.JSX.Element | null {
  const { lock, isAiBusy } = useLock()
  const { pushToast } = useToast()
  const [cancelling, setCancelling] = useState(false)

  if (!isAiBusy) {
    return null
  }

  async function handleCancel(): Promise<void> {
    setCancelling(true)
    const result = await window.api.chat.cancelTask()
    setCancelling(false)
    if (result.ok) {
      pushToast('Đã gửi yêu cầu hủy tác vụ AI', 'info')
    } else {
      pushToast(result.error.message, 'error')
    }
  }

  return (
    <div className="lock-banner" role="status" aria-live="polite">
      <span className="lock-banner__spinner" aria-hidden="true" />
      <span>AI đang thực thi{lock.label ? `: ${lock.label}` : ''}</span>
      <span className="spacer" />
      <Button variant="ghost" size="sm" onClick={() => void handleCancel()} loading={cancelling}>
        Hủy AI
      </Button>
    </div>
  )
}
