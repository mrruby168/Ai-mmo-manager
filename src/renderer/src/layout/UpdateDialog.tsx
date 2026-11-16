import { Button } from '../common/Button'
import { Modal } from '../common/Modal'
import { useUpdate } from '../state/UpdateContext'

function DownloadIcon(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 4v10" strokeLinecap="round" />
      <path d="M8 10l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </svg>
  )
}

export function UpdateDialog(): React.JSX.Element {
  const { state, dialogOpen, installError, closeDialog, startUpdate, install } = useUpdate()

  if (!state) {
    return <></>
  }

  const percent = Math.max(0, Math.min(100, Math.round(state.percent ?? 0)))
  const downloading = state.phase === 'downloading'
  const portable = Boolean(state.portable)
  const latestVersion = state.latestVersion ?? ''
  const blocked = installError !== null
  const failed = state.phase === 'error'

  let primaryLabel = 'Đóng'
  let primaryAction: () => void = closeDialog
  let primaryDisabled = false

  if (blocked) {
    primaryLabel = 'Khởi động lại để cài'
    primaryAction = () => {
      void install()
    }
  } else if (portable) {
    primaryLabel = 'Mở trang tải'
    primaryAction = () => {
      void startUpdate()
    }
  } else if (downloading) {
    primaryLabel = `Đang tải… ${percent}%`
    primaryAction = () => {}
    primaryDisabled = true
  } else if (state.phase === 'downloaded') {
    primaryLabel = 'Khởi động lại để cài'
    primaryAction = () => {
      void install()
    }
  } else if (failed) {
    primaryLabel = 'Thử lại'
    primaryAction = () => {
      void startUpdate()
    }
  } else if (state.phase === 'available') {
    primaryLabel = 'Cập nhật ngay'
    primaryAction = () => {
      void startUpdate()
    }
  }

  return (
    <Modal
      open={dialogOpen}
      title="Có phiên bản mới!"
      onClose={closeDialog}
      footer={
        <>
          <Button variant="secondary" onClick={closeDialog}>
            Để sau
          </Button>
          <Button variant="primary" className="btn--update" onClick={primaryAction} disabled={primaryDisabled}>
            {primaryLabel}
          </Button>
        </>
      }
    >
      <p className="update-dialog__lead">
        <span className="update-dialog__icon" aria-hidden="true">
          <DownloadIcon />
        </span>
        <span>
          Một phiên bản mới của MMO Manager (v{latestVersion}) đã được phát hành. Vui lòng cập nhật để trải nghiệm
          các tính năng mới, cải tiến hiệu suất và sửa lỗi.
        </span>
      </p>
      <p className="muted">Phiên bản hiện tại: v{state.currentVersion}.</p>

      {state.dataInsideInstallDir === true ? (
        <div className="banner banner--warning" role="alert">
          Thư mục dữ liệu nằm trong thư mục cài đặt, hãy sao lưu trước khi cập nhật.
        </div>
      ) : null}

      {downloading ? (
        <div
          className="update-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="update-progress__bar" style={{ width: `${percent}%` }} />
        </div>
      ) : null}

      {blocked ? (
        <div className="banner banner--warning" role="alert">
          {installError}
        </div>
      ) : null}

      {failed && !blocked ? (
        <div className="banner banner--error" role="alert">
          {state.message ?? 'Không tải được bản cập nhật. Hãy thử lại.'}
        </div>
      ) : null}
    </Modal>
  )
}
