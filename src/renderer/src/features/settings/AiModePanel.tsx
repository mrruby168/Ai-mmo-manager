import { useState } from 'react'
import type { AiMode } from '@shared/constants'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'

export function AiModePanel({ aiMode, onChanged }: { aiMode: AiMode; onChanged: () => void }): React.JSX.Element {
  const { isAiBusy } = useLock()
  const { pushToast } = useToast()
  const [saving, setSaving] = useState(false)

  async function handleChange(mode: AiMode): Promise<void> {
    if (mode === aiMode || saving) {
      return
    }
    setSaving(true)
    const result = await window.api.settings.setAiMode(mode)
    setSaving(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    pushToast(mode === 'ai' ? 'Đã bật AI Mode' : 'Đã bật No AI Mode', 'success')
    onChanged()
  }

  return (
    <section className="card stack">
      <div className="section-title">
        <h2>Chế độ hoạt động</h2>
        <span className="muted">{aiMode === 'ai' ? 'AI Mode' : 'No AI Mode'}</span>
      </div>
      <p className="muted">
        AI Mode: Chat, Check News, Scan và Test Provider gọi AI như bình thường. No AI Mode: main process không gọi AI ở bất kỳ luồng
        nào; Check News chỉ tạo Prompt để copy. Dữ liệu, API Key, Provider và lịch sử Chat được giữ nguyên khi đổi chế độ.
      </p>
      <div className="segmented" role="group" aria-label="Chọn chế độ hoạt động">
        <button
          type="button"
          className={`segmented__item${aiMode === 'ai' ? ' segmented__item--active' : ''}`}
          aria-pressed={aiMode === 'ai'}
          disabled={isAiBusy || saving}
          onClick={() => void handleChange('ai')}
        >
          AI Mode
        </button>
        <button
          type="button"
          className={`segmented__item${aiMode === 'noai' ? ' segmented__item--active' : ''}`}
          aria-pressed={aiMode === 'noai'}
          disabled={isAiBusy || saving}
          onClick={() => void handleChange('noai')}
        >
          No AI Mode
        </button>
      </div>
    </section>
  )
}
