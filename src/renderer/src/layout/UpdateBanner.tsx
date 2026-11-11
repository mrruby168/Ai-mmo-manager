import { useCallback, useEffect, useState } from 'react'
import { Button } from '../common/Button'
import { useLock } from '../state/LockContext'
import { useToast } from '../state/ToastContext'
import type { UpdateState } from '@shared/types'

const DISMISSED_KEY = 'update-dismissed-version'

function isDismissed(latestVersion: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === latestVersion
  } catch {
    return false
  }
}

export function UpdateBanner(): React.JSX.Element | null {
  const [state, setState] = useState<UpdateState | null>(null)
  const { isAiBusy, lock } = useLock()
  const { pushToast } = useToast()
  const userEditing = lock.userEditing

  useEffect(() => {
    const load = async () => {
      const result = await window.api.update.getState()
      if (result.ok) {
        setState(result.data)
      }
    }
    void load()
    const unsubscribe = window.api.events.onUpdateState((next) => setState(next))
    return () => unsubscribe()
  }, [])

  if (!state) {
    return null
  }
  if (state.phase === 'idle' || state.phase === 'checking') {
    return null
  }

  const busy = isAiBusy || Boolean(userEditing)
  const isPortable = Boolean(state.portable)

  const handleCheckLater = useCallback(() => {
    if (state.latestVersion) {
      try {
        localStorage.setItem(DISMISSED_KEY, state.latestVersion)
      } catch {
        // localStorage không khả qui, bỏ qua.
      }
    }
    setState(null)
  }, [state.latestVersion])

  const handleDownload = async (): Promise<void> => {
    const result = await window.api.update.download()
    if (!result.ok) {
      pushToast(result.error.message, 'error')
    }
  }

  const handleInstall = async (): Promise<void> => {
    const result = await window.api.update.install()
    if (!result.ok) {
      pushToast(typeof result.error === 'string' ? result.error : result.error?.message ?? 'Không thể cài cập nhật', 'error')
    }
  }

  const handleOpenRelease = async (): Promise<void> => {
    const result = await window.api.update.openRelease()
    if (!result.ok) {
      pushToast(typeof result.error === 'string' ? result.error : result.error?.message ?? 'Không mở được trang tải', 'error')
    }
  }

  const hasNews = Boolean(state.latestVersion) && !isDismissed(state.latestVersion ?? '')

  if (state.phase === 'available' && state.latestVersion && hasNews) {
    return (
      <div className="banner banner--info" role="status" aria-live="polite">
        <span>
          Có bản mới v{state.latestVersion} (bạn đang dùng v{state.currentVersion})
        </span>
        <span className="spacer" />
        {isPortable ? (
          <Button variant="primary" size="sm" onClick={handleOpenRelease}>
            Mở trang tải
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={handleDownload} disabled={busy}>
            Cập nhật
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleCheckLater}>
          Để sau
        </Button>
      </div>
    )
  }

  if (state.phase === 'downloading') {
    return (
      <div className="banner banner--info" role="status" aria-live="polite">
        <span>Đang tải cập nhật… {state.percent ?? 0}%</span>
        <span className="spacer" />
        <Button variant="ghost" size="sm" onClick={handleCheckLater}>
          Để sau
        </Button>
      </div>
    )
  }

  if (state.phase === 'downloaded') {
    return (
      <div className="banner banner--info" role="status" aria-live="polite">
        <span>Đã tải xong cập nhật</span>
        <span className="spacer" />
        <Button variant="primary" size="sm" onClick={handleInstall} disabled={busy}>
          Khởi động lại để cài
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCheckLater}>
          Để sau
        </Button>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="banner banner--error" role="alert">
        {state.message ?? 'Không thể kiểm tra cập nhật'}
      </div>
    )
  }

  return null
}
