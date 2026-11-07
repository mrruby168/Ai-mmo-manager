import { useEffect, useRef, useState } from 'react'
import { FONT_SIZE_RANGE, FONT_WEIGHT_RANGE, SAFE_FONT_FAMILIES } from '@shared/constants'
import type { AppearanceSettings } from '@shared/types'
import { Button } from '../../common/Button'
import { Field, Select } from '../../common/Field'
import { defaultAppearance, useAppearance } from '../../state/AppearanceProvider'
import { useToast } from '../../state/ToastContext'

const FONT_LABELS: Record<string, string> = {
  'Segoe UI, system-ui, -apple-system, sans-serif': 'Segoe UI (mặc định)',
  'Arial, Helvetica, sans-serif': 'Arial',
  'Calibri, Candara, sans-serif': 'Calibri',
  'Tahoma, Geneva, sans-serif': 'Tahoma',
  'Verdana, Geneva, sans-serif': 'Verdana',
  'Consolas, "Cascadia Mono", monospace': 'Consolas (mono)'
}

const WEIGHT_LABELS: Record<number, string> = {
  300: 'Light 300',
  400: 'Regular 400',
  500: 'Medium 500',
  600: 'Semibold 600',
  700: 'Bold 700'
}

export function AppearancePanel(): React.JSX.Element {
  const { appearance, preview, apply, reset } = useAppearance()
  const { pushToast } = useToast()
  const [draft, setDraft] = useState<AppearanceSettings>(appearance)
  const [busy, setBusy] = useState(false)
  const dirtyRef = useRef(false)
  const savedRef = useRef<AppearanceSettings>(appearance)

  useEffect(() => {
    if (!dirtyRef.current) {
      savedRef.current = appearance
      setDraft(appearance)
    }
  }, [appearance])

  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        preview(savedRef.current)
        dirtyRef.current = false
      }
    }
  }, [preview])

  function update(next: AppearanceSettings): void {
    dirtyRef.current = true
    setDraft(next)
    preview(next)
  }

  async function handleApply(): Promise<void> {
    setBusy(true)
    const ok = await apply(draft)
    setBusy(false)
    if (!ok) {
      pushToast('Không lưu được cài đặt giao diện', 'error')
      return
    }
    dirtyRef.current = false
    savedRef.current = draft
    pushToast('Đã áp dụng giao diện', 'success')
  }

  async function handleReset(): Promise<void> {
    setBusy(true)
    const ok = await reset()
    setBusy(false)
    if (!ok) {
      pushToast('Không đặt lại được giao diện', 'error')
      return
    }
    dirtyRef.current = false
    savedRef.current = defaultAppearance
    setDraft(defaultAppearance)
    pushToast('Đã đặt lại giao diện mặc định', 'success')
  }

  return (
    <div className="stack">
      <section className="card stack">
        <div className="section-title">
          <h2>Giao diện</h2>
          <span className="muted">Preview trực tiếp, chỉ lưu khi bấm Apply</span>
        </div>

        <Field label="Font Family">
          <Select
            value={draft.fontFamily}
            onChange={(event) => update({ ...draft, fontFamily: event.target.value })}
          >
            {SAFE_FONT_FAMILIES.map((family) => (
              <option key={family} value={family}>
                {FONT_LABELS[family] ?? family}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={`Font Size: ${draft.fontSize}px`} hint={`Từ ${FONT_SIZE_RANGE.min} đến ${FONT_SIZE_RANGE.max}px`}>
          <input
            className="range-control"
            type="range"
            min={FONT_SIZE_RANGE.min}
            max={FONT_SIZE_RANGE.max}
            step={1}
            value={draft.fontSize}
            onChange={(event) => update({ ...draft, fontSize: Number(event.target.value) })}
          />
        </Field>

        <Field label={`Font Weight: ${WEIGHT_LABELS[draft.fontWeight] ?? draft.fontWeight}`}>
          <input
            className="range-control"
            type="range"
            min={FONT_WEIGHT_RANGE.min}
            max={FONT_WEIGHT_RANGE.max}
            step={100}
            value={draft.fontWeight}
            onChange={(event) => update({ ...draft, fontWeight: Number(event.target.value) })}
          />
        </Field>

        <div>
          <span className="field__label">Preview</span>
          <div
            className="appearance-preview"
            style={{
              fontFamily: draft.fontFamily,
              fontSize: `${draft.fontSize}px`,
              fontWeight: draft.fontWeight
            }}
          >
            <strong>MMO Manager</strong>
            <p>Quản lý Event MMO và Airdrop, theo dõi hạn chót và doanh thu trên một màn hình.</p>
            <p className="mono">0x1234…abcd · 2026-11-05</p>
          </div>
        </div>

        <div className="row">
          <Button variant="primary" loading={busy} onClick={() => void handleApply()}>
            Apply
          </Button>
          <Button loading={busy} onClick={() => void handleReset()}>
            Reset
          </Button>
          <span className="muted">{dirtyRef.current ? 'Có thay đổi chưa lưu' : 'Đang dùng cài đặt đã lưu'}</span>
        </div>
      </section>
    </div>
  )
}
