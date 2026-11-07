import { useState } from 'react'
import { Button } from '../../common/Button'
import { CheckboxField } from '../../common/Field'
import { ConfirmDialog } from '../../common/Modal'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'

export function DataPathPanel({ dataPath, onChanged }: { dataPath: string; onChanged: () => void }): React.JSX.Element {
  const { isAiBusy } = useLock()
  const { pushToast } = useToast()
  const [choosing, setChoosing] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [copyExisting, setCopyExisting] = useState(true)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChoose(): Promise<void> {
    setError(null)
    setChoosing(true)
    const result = await window.api.settings.chooseDataPath()
    setChoosing(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    if (result.data.canceled || !result.data.path) {
      return
    }
    if (result.data.path === dataPath) {
      setError('Thư mục mới trùng với thư mục dữ liệu hiện tại')
      return
    }
    setCopyExisting(true)
    setPendingPath(result.data.path)
  }

  async function handleMove(): Promise<void> {
    if (!pendingPath) {
      return
    }
    setMoving(true)
    const result = await window.api.settings.setDataPath({ path: pendingPath, copyExisting })
    setMoving(false)
    if (!result.ok) {
      setError(result.error.message)
      pushToast(result.error.message, 'error')
      return
    }
    setPendingPath(null)
    pushToast('Đã đổi thư mục dữ liệu', 'success')
    onChanged()
  }

  async function handleOpenFolder(): Promise<void> {
    const result = await window.api.settings.openDataFolder()
    if (!result.ok) {
      pushToast(result.error.message, 'error')
    }
  }

  return (
    <div className="stack">
      <section className="card stack">
        <div className="section-title">
          <h2>Thư mục dữ liệu</h2>
          <Button size="sm" variant="secondary" onClick={() => void handleOpenFolder()}>
            Mở thư mục Data
          </Button>
        </div>
        <p className="muted">
          Database, logo và file bằng chứng được lưu tại đây. Có thể chọn ổ đĩa khác hoặc thư mục đồng bộ.
        </p>
        <div className="settings-path" tabIndex={0}>
          {dataPath}
        </div>
        <div className="row">
          <Button variant="primary" loading={choosing} disabled={isAiBusy || choosing} onClick={() => void handleChoose()}>
            Chọn thư mục
          </Button>
        </div>
        {error ? (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={pendingPath !== null}
        title="Đổi thư mục dữ liệu"
        busy={moving}
        confirmLabel="Chuyển dữ liệu"
        onConfirm={() => void handleMove()}
        onCancel={() => setPendingPath(null)}
        message={
          <div className="stack">
            <p>Chuyển sang thư mục:</p>
            <div className="settings-path">{pendingPath}</div>
            <CheckboxField
              label="Sao chép dữ liệu hiện có sang nơi mới"
              checked={copyExisting}
              onChange={setCopyExisting}
              hint="(mặc định)"
            />
            <p className="muted">
              Thư mục cũ không bị xóa. Nếu thư mục mới đã có database mmo-manager.db, app sẽ từ chối để tránh ghi đè.
            </p>
          </div>
        }
      />
    </div>
  )
}
