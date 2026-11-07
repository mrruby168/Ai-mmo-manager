import { useState } from 'react'
import type { ProjectImportSummary } from '@shared/types'
import { Button } from '../../common/Button'
import { Field, Textarea } from '../../common/Field'
import { Modal } from '../../common/Modal'
import { useToast } from '../../state/ToastContext'

export function ProjectImportDialog({
  open,
  onClose,
  onImported
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
}): React.JSX.Element {
  const { pushToast } = useToast()
  const [json, setJson] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ProjectImportSummary | null>(null)

  async function runImport(source: { json: string } | { pickFile: true }): Promise<void> {
    setBusy(true)
    setError(null)
    const result = await window.api.projects.importJson(source)
    setBusy(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }
    if (result.data.canceled) {
      return
    }

    setSummary(result.data)
    if (result.data.addedCount > 0) {
      onImported()
    }
    pushToast(`Đã nhập ${result.data.addedCount} dự án`, result.data.failedCount > 0 ? 'info' : 'success')
  }

  function handleClose(): void {
    if (busy) {
      return
    }
    setSummary(null)
    setError(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      wide
      closeDisabled={busy}
      title="Import dự án từ JSON"
      onClose={handleClose}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={busy}>
            Đóng
          </Button>
          <Button variant="secondary" onClick={() => void runImport({ pickFile: true })} disabled={busy}>
            Chọn file JSON…
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={json.trim().length === 0}
            onClick={() => void runImport({ json })}
          >
            Nhập từ nội dung dán
          </Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="banner banner--info">
        Dự án hợp lệ sẽ được thêm ngay, dự án lỗi được liệt kê bên dưới kèm lý do. Chấp nhận{' '}
        <span className="mono">{`{ "projects": [ … ] }`}</span>, mảng thuần hoặc <span className="mono">{`{ "items": [ … ] }`}</span>.
        Không bắt buộc <span className="mono">schemaVersion</span>.
      </div>

      <Field label="Dán JSON" hint="Hoặc dùng nút Chọn file JSON… để nhập từ file trên máy">
        <Textarea
          value={json}
          spellCheck={false}
          className="mono"
          placeholder={'{\n  "projects": [\n    { "category": "airdrop", "name": "Tên dự án", "website": "abc.com" }\n  ]\n}'}
          onChange={(event) => setJson(event.target.value)}
        />
      </Field>

      {summary ? (
        <div className="stack">
          <div className="banner banner--info">
            Thêm mới: {summary.addedCount} · Trùng: {summary.duplicateCount} · Lỗi: {summary.failedCount}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Tên dự án</th>
                <th>Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {summary.results.map((item, index) => (
                <tr key={`${item.name}-${index}`}>
                  <td>{item.name}</td>
                  <td>
                    {item.project ? (
                      <span className="badge badge--completed">Đã thêm ({item.project.id})</span>
                    ) : item.duplicateOf ? (
                      <span className="badge badge--warning">Trùng ({item.duplicateOf})</span>
                    ) : (
                      <span className="badge badge--error">{item.error ?? 'Lỗi'}</span>
                    )}
                    {item.project && item.warning ? (
                      <span className="muted" style={{ display: 'block', marginTop: 4, fontSize: '0.8125rem' }}>
                        {item.warning}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Modal>
  )
}
