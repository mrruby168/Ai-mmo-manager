import { useEffect, useRef, useState } from 'react'
import { todayDateOnly } from '@shared/date-utils'
import type { AppSettings, ModelSelection, ScanItem } from '@shared/types'
import { resolveTaskModel } from '@shared/modelSelection'
import { Badge, CostBadge, RiskBadge, VerificationBadge } from '../../common/Badge'
import { Button } from '../../common/Button'
import { EmptyState, ErrorBlock } from '../../common/EmptyState'
import { Field, Textarea } from '../../common/Field'
import { ExternalLink } from '../../common/ExternalLink'
import { ModelPicker } from '../../common/ModelPicker'
import { TaskModelCard } from '../../common/TaskModelCard'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'

const CATEGORY_LABELS: Record<string, string> = { event_mmo: 'Event MMO', airdrop: 'Airdrop' }
const SCAN_FILE_MAX_BYTES = 1_000_000
const SCAN_FILE_ACCEPT = '.txt,.md,.json,text/plain,text/markdown,application/json'

export function ScanPage(): React.JSX.Element {
  const { refreshData, dataVersion, isAiEnabled } = useApp()
  const { isAiBusy } = useLock()
  const { pushToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [items, setItems] = useState<ScanItem[] | null>(null)
  const [scanAt, setScanAt] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    void window.api.scan.latest().then((result) => {
      if (result.ok && result.data) {
        setItems(result.data.items)
        setScanAt(result.data.createdAt)
      }
    })
  }, [])

  useEffect(() => {
    return window.api.events.onAiProgress((progress) => {
      setProgressText(progress.message)
    })
  }, [])

  useEffect(() => {
    let active = true
    void window.api.settings.get().then((result) => {
      if (active && result.ok) {
        setSettings(result.data)
      }
    })
    return () => {
      active = false
    }
  }, [dataVersion])

  const providers = settings?.ai.providers ?? []
  const scanModel = resolveTaskModel(
    providers,
    settings?.ai.scanSelection ?? null,
    settings?.ai.lastSelection ?? null
  )
  const modelLabel = scanModel.effective
    ? `${scanModel.effective.model.label} · ${scanModel.effective.provider.name}`
    : null
  const modelPickerHint = scanModel.stale
    ? 'Model đã chọn không còn khả dụng — đang dùng mặc định'
    : scanModel.usedDefault
      ? 'Đang dùng mặc định'
      : null
  const scanModelWarning =
    scanModel.effective &&
    (!scanModel.effective.model.supportsTools || !scanModel.effective.model.supportsWebSearch)
      ? `Model ${scanModel.effective.model.label} thiếu ${
          !scanModel.effective.model.supportsTools ? 'tool calling' : 'Web Search'
        } — Scan sẽ không chạy.`
      : null

  let scanDisabledReason: string | null = null
  if (!isAiEnabled) {
    scanDisabledReason = 'Vui lòng bật AI Mode trong Settings để sử dụng Scan.'
  } else if (!scanModel.effective) {
    scanDisabledReason = 'Chưa chọn Model. Chọn Model ở khung của tab Scan trước khi Scan.'
  } else if (!scanModel.effective.model.supportsTools) {
    scanDisabledReason = `Model "${scanModel.effective.model.label}" không hỗ trợ tool calling. Chọn Model khác ở khung của tab Scan.`
  } else if (!scanModel.effective.model.supportsWebSearch) {
    scanDisabledReason = `Model "${scanModel.effective.model.label}" không hỗ trợ Web Search. Chọn Model khác ở khung của tab Scan.`
  }

  async function handleScanModelChange(next: ModelSelection): Promise<void> {
    const result = await window.api.settings.setTaskSelection('scan', next)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    setSettings(result.data)
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    if (file.size > SCAN_FILE_MAX_BYTES) {
      pushToast('File lớn hơn 1 MB', 'error')
      return
    }
    const content = await file.text()
    setText(content)
    setFileName(file.name)
  }

  async function handleScan(): Promise<void> {
    if (!isAiEnabled) {
      pushToast('Vui lòng bật AI Mode trong Settings để sử dụng Scan.', 'info')
      return
    }
    if (isAiBusy || scanning || text.trim().length === 0) {
      return
    }
    setScanning(true)
    setLoadError(null)
    setSubmitMessage(null)
    setItems(null)
    setProgressText('Đang đọc nội dung...')
    const result = await window.api.scan.start({ text, fileName: fileName ?? undefined })
    setScanning(false)
    setProgressText('')
    if (!result.ok) {
      setLoadError(result.error.message)
      return
    }
    setItems(result.data.items)
    setScanAt(todayDateOnly())
    setMessage(result.data.message)
    setSelected(new Set())
    refreshData()
  }

  async function handleCancel(): Promise<void> {
    const result = await window.api.scan.cancel()
    if (!result.ok) {
      pushToast(result.error.message, 'error')
    }
  }

  function toggleItem(name: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  function selectableItems(): ScanItem[] {
    return (items ?? []).filter((item) => item.category !== 'insufficient' && !item.duplicateOf)
  }

  function toggleAll(): void {
    const selectable = selectableItems()
    const allSelected = selectable.length > 0 && selectable.every((item) => selected.has(item.name))
    setSelected(allSelected ? new Set() : new Set(selectable.map((item) => item.name)))
  }

  function groupItems(itemsList: ScanItem[] | null, category: 'event_mmo' | 'airdrop' | 'insufficient'): ScanItem[] {
    return (itemsList ?? []).filter((item) => item.category === category)
  }

  async function handleSubmit(): Promise<void> {
    if (selected.size === 0 || submitting) {
      return
    }
    setSubmitting(true)
    const result = await window.api.scan.submit(Array.from(selected))
    setSubmitting(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    const data = result.data
    setSubmitMessage(
      `Đã thêm ${data.addedCount} dự án${data.duplicateCount > 0 ? `, trùng ${data.duplicateCount}` : ''}${
        data.failedCount > 0 ? `, lỗi ${data.failedCount}` : ''
      }`
    )
    const failed = data.results.filter((entry) => entry.error)
    if (failed.length > 0) {
      pushToast(`Có ${failed.length} dự án không thêm được: ${failed.map((entry) => `${entry.name} — ${entry.error}`).join('; ')}`, 'error')
    } else {
      pushToast(`Đã thêm ${data.addedCount} dự án`, 'success')
    }
    setSelected(new Set())
    refreshData()
  }

  const canScan = isAiEnabled && !isAiBusy && !scanning && text.trim().length > 0 && scanDisabledReason === null
  const allSelectable = selectableItems()
  const allSelected = allSelectable.length > 0 && allSelectable.every((item) => selected.has(item.name))

  const eventItems = groupItems(items, 'event_mmo')
  const airdropItems = groupItems(items, 'airdrop')
  const insufficientItems = groupItems(items, 'insufficient')

  return (
    <>
      <div className="page-header">
        <div className="page-header__title">
          <h1>Scan Project</h1>
          <span className="page-header__subtitle">
            {modelLabel ? `Model đang dùng: ${modelLabel}` : 'Chưa chọn Model'} · AI đọc, tra cứu web và báo cáo trùng lặp
          </span>
        </div>
        <div className="row">
          {scanning ? (
            <Button variant="secondary" loading={false} onClick={() => void handleCancel()}>
              Hủy
            </Button>
          ) : (
            <Button variant="primary" loading={scanning} disabled={!canScan} onClick={() => void handleScan()}>
              Scan
            </Button>
          )}
        </div>
      </div>

      {isAiEnabled ? (
        <TaskModelCard
          title="Model cho Scan Project"
          summary={modelLabel ? `Đang dùng: ${modelLabel}` : 'Chưa có Model'}
          hint={modelPickerHint}
          warning={scanModelWarning}
        >
          <ModelPicker
            label="Scan Project"
            providers={providers}
            value={settings?.ai.scanSelection ?? null}
            disabled={scanning || isAiBusy}
            hint={modelPickerHint}
            onChange={(next) => void handleScanModelChange(next)}
          />
        </TaskModelCard>
      ) : null}

      {scanDisabledReason ? <div className="banner banner--warning" role="alert">{scanDisabledReason}</div> : null}

      <div className="card stack">
        <Field label="Dán nội dung dự án (TXT/MD/JSON) hoặc đính kèm file">
          <Textarea
            className="scan-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'Ví dụ:\n1. Alpha Airdrop — https://example.com\n2. Beta MMO Event\n...'}
            disabled={scanning}
          />
        </Field>
        <div className="row row--wrap">
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={scanning}>
            📎 Đính kèm TXT/MD/JSON
          </Button>
          {fileName ? (
            <span className="chip">
              {fileName}
              <button type="button" aria-label="Bỏ file" onClick={() => { setFileName(null); setText('') }}>
                ✕
              </button>
            </span>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept={SCAN_FILE_ACCEPT}
            className="visually-hidden"
            onChange={(event) => void handleFileChange(event)}
          />
          <span className="spacer" />
          <span className="muted">Tối đa 1 MB · AI không tự thêm dự án cho đến khi bạn bấm Gửi</span>
        </div>
      </div>

      {scanning ? (
        <div className="card stack" aria-live="polite">
          <div className="row">
            <span className="lock-banner__spinner" aria-hidden="true" />
            <h2>Đang tra cứu web</h2>
          </div>
          <p className="muted">{progressText || 'AI đang đọc nội dung và tra cứu từng dự án...'}</p>
          <div className="progress">
            <div className="progress__bar progress__bar--indeterminate" />
          </div>
        </div>
      ) : null}

      {loadError ? <ErrorBlock message={loadError} action={!scanning ? <Button onClick={() => void handleScan()}>Thử lại</Button> : undefined} /> : null}

      {message && !loadError ? (
        <div className="banner banner--info" role="status">
          {message} {scanAt ? `· ${scanAt}` : ''}
        </div>
      ) : null}

      {items && items.length > 0 ? (
        <>
          {submitMessage ? <div className="banner banner--info" role="status">{submitMessage}</div> : null}
          {eventItems.length > 0 ? (
            <ScanGroup
              title={CATEGORY_LABELS.event_mmo}
              items={eventItems}
              selected={selected}
              onToggleItem={toggleItem}
              onToggleAll={() => {
                const group = eventItems.filter((item) => !item.duplicateOf)
                const all = group.length > 0 && group.every((item) => selected.has(item.name))
                setSelected((current) => {
                  const next = new Set(current)
                  for (const item of group) {
                    if (all) {
                      next.delete(item.name)
                    } else {
                      next.add(item.name)
                    }
                  }
                  return next
                })
              }}
            />
          ) : null}
          {airdropItems.length > 0 ? (
            <ScanGroup
              title={CATEGORY_LABELS.airdrop}
              items={airdropItems}
              selected={selected}
              onToggleItem={toggleItem}
              onToggleAll={() => {
                const group = airdropItems.filter((item) => !item.duplicateOf)
                const all = group.length > 0 && group.every((item) => selected.has(item.name))
                setSelected((current) => {
                  const next = new Set(current)
                  for (const item of group) {
                    if (all) {
                      next.delete(item.name)
                    } else {
                      next.add(item.name)
                    }
                  }
                  return next
                })
              }}
            />
          ) : null}
          {insufficientItems.length > 0 ? (
            <div className="scan-group">
              <div className="scan-group__title">
                <h2>Không đủ bằng chứng</h2>
                <Badge tone="neutral">{insufficientItems.length} không chọn được</Badge>
              </div>
              <div className="project-rows">
                {insufficientItems.map((item) => (
                  <div className="scan-row scan-row--disabled" key={item.name}>
                    <span className="scan-row__name">{item.name}</span>
                    <span className="muted">{item.taskSummary || 'AI không xác minh được dự án này'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="scan-submit-bar">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Chọn tất cả dự án có thể thêm"
            />
            <span>Đã chọn {selected.size}</span>
            <span className="spacer" />
            <Button variant="primary" disabled={selected.size === 0 || submitting || isAiBusy} loading={submitting} onClick={() => void handleSubmit()}>
              Gửi
            </Button>
          </div>
        </>
      ) : items && items.length === 0 ? (
        <EmptyState title="Không tìm thấy dự án" message={message ?? 'AI không xác định được dự án nào từ nội dung đã dán.'} />
      ) : null}
    </>
  )
}

function ScanGroup({
  title,
  items,
  selected,
  onToggleItem,
  onToggleAll
}: {
  title: string
  items: ScanItem[]
  selected: Set<string>
  onToggleItem: (name: string) => void
  onToggleAll: () => void
}): React.JSX.Element {
  const group = items.filter((item) => !item.duplicateOf)
  const all = group.length > 0 && group.every((item) => selected.has(item.name))

  return (
    <div className="scan-group">
      <div className="scan-group__title">
        <h2>{title}</h2>
        <Badge tone="neutral">{items.length} dự án</Badge>
        {group.length > 0 ? (
          <button type="button" className="link-button" onClick={onToggleAll}>
            {all ? 'Bỏ chọn nhóm này' : 'Chọn tất cả nhóm này'}
          </button>
        ) : null}
      </div>
      <div className="project-rows">
        {items.map((item) => (
          <ScanRow key={item.name} item={item} selected={selected.has(item.name)} onToggle={() => onToggleItem(item.name)} />
        ))}
      </div>
    </div>
  )
}

function ScanRow({ item, selected, onToggle }: { item: ScanItem; selected: boolean; onToggle: () => void }): React.JSX.Element {
  const locked = item.duplicateOf !== null
  return (
    <div
      className={`scan-row${locked ? ' scan-row--disabled' : ''}`}
    >
      <label className="row">
        <input type="checkbox" checked={selected} disabled={locked} onChange={onToggle} aria-label={`Chọn ${item.name}`} />
        <span className="scan-row__name">{item.name}</span>
        {locked ? <Badge tone="warning">Đã có trong app</Badge> : null}
      </label>
      <div className="scan-row__body">
        <div className="row row--wrap">
          <CostBadge costType={item.costType} amountUsd={item.costType === 'paid' ? item.costAmountUsd : null} />
          <VerificationBadge verification={item.verification} />
          <RiskBadge level={item.riskLevel} />
          {item.endDate ? <span className="muted">Hạn: {item.endDate}</span> : <span className="muted">Hạn: Chưa rõ</span>}
        </div>
        <p className="muted">{item.taskSummary || item.potential || 'Chưa có mô tả chi tiết'}</p>
        {item.howToJoin ? <p className="muted text-clamp-2">Cách tham gia: {item.howToJoin}</p> : null}
        <div className="scan-row__sources row row--wrap">
          {item.website ? <ExternalLink url={item.website}>Website</ExternalLink> : null}
          {item.sources.map((source) => (
            <ExternalLink key={source} url={source}>Nguồn</ExternalLink>
          ))}
        </div>
        {item.riskReason ? <p className="muted">Rủi ro: {item.riskReason}</p> : null}
      </div>
    </div>
  )
}
