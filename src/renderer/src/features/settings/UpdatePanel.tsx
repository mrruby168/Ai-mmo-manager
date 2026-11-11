import { useCallback, useEffect, useState } from 'react'
import { isPathInside } from '@shared/constants'
import { Button } from '../../common/Button'
import { useToast } from '../../state/ToastContext'

interface UpdatePanelProps {
  dataPath: string
}

export function UpdatePanel({ dataPath }: UpdatePanelProps): React.JSX.Element {
  const [state, setState] = useState<{ phase: string; currentVersion: string; latestVersion?: string } | null>(
    null
  )
  const [checking, setChecking] = useState(false)
  const { pushToast } = useToast()

  const load = useCallback(async (): Promise<void> => {
    const result = await window.api.update.getState()
    if (result.ok) {
      setState(result.data)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleCheck = useCallback(async (): Promise<void> => {
    setChecking(true)
    try {
      const result = await window.api.update.check()
      if (result.ok) {
        setState(result.data)
        if (result.data.phase === 'idle') {
          pushToast('Bạn đang dùng bản mới nhất.', 'info')
        }
      } else {
        pushToast(result.error.message, 'error')
      }
    } finally {
      setChecking(false)
    }
  }, [pushToast])

  const dataPathInsideInstallDir = isPathInside(dataPath, '')

  return (
    <section className="card stack">
      <div className="section-title">
        <h2>Cập nhật ứng dụng</h2>
      </div>
      <p className="muted">Phiên bản hiện tại: {state?.currentVersion ?? '—'}</p>

      {state?.phase === 'available' && state.latestVersion ? (
        <div className="banner banner--info">
          Có bản mới v{state.latestVersion}. Bấm &ldquo;Kiểm tra cập nhật&rdquo; để tải về.
        </div>
      ) : null}

      <div className="row">
        <Button variant="primary" size="sm" loading={checking} onClick={handleCheck}>
          Kiểm tra cập nhật
        </Button>
      </div>

      <p className="muted">Thư mục dữ liệu: {dataPath}</p>
      {dataPathInsideInstallDir ? (
        <div className="banner banner--warning" role="alert">
          Thư mục dữ liệu đang nằm trong thư mục cài đặt, có thể bị mất khi cập nhật hoặc gỡ cài đặt. Hãy đổi ở mục
          &ldquo;Đường dẫn dữ liệu&rdquo;.
        </div>
      ) : (
        <p className="muted">
          Cập nhật ứng dụng chỉ thay đổi file chương trình, không đụng tới dữ liệu của bạn.
        </p>
      )}
    </section>
  )
}
