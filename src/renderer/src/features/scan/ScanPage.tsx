import { useEffect, useRef, useState } from 'react'
import type { AiLogProgress, AppSettings, ScanItem } from '@shared/types'
import { progressPercent } from '@shared/aiLog'
import {
  isScanRowSelectable,
  scanRowKey,
  selectedScanNames,
  selectableScanIndexes,
  toggleScanIndex,
  toggleScanIndexes
} from '@shared/scanSelection'
import {
  chainWarnings,
  effectiveChain,
  firstRunnable,
  listModelChoices
} from '@shared/modelConfig'
import { Badge, CostBadge, RiskBadge } from '../../common/Badge'
import { Button } from '../../common/Button'
import { EmptyState, ErrorBlock } from '../../common/EmptyState'
import { AiActivityLog } from '../../common/AiActivityLog'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'

const CATEGORY_LABELS: Record<string, string> = { event_mmo: 'Event MMO', airdrop: 'Airdrop' }
const SCAN_FILE_MAX_BYTES = 1_000_000
const SCAN_FILE_ACCEPT = '.txt,.md,.json,text/plain,text/markdown,application/json'
const IDLE_PROGRESS: AiLogProgress = { done: 0, total: 0, running: false }

/** FIX 3: Scan chỉ nhận file văn bản nhỏ, giống nút Đính kèm. */
function isScanFileName(name: string): boolean {
  return /\.(txt|md|json)$/i.test(name)
}

function formatScanAt(value: string | null): string {
  if (!value) {
    return 'Chưa rõ thời điểm quét'
  }
  const parsed = new Date(value)
  return `Quét lúc ${Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('vi-VN')}`
}

export function ScanPage(): React.JSX.Element {
  const { refreshData, dataVersion, isAiEnabled } = useApp()
  const { isAiBusy, isBusy } = useLock()
  const { pushToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const logRef = useRef<HTMLDivElement>(null)

  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [view, setView] = useState<'input' | 'result'>('input')
  const [progress, setProgress] = useState<AiLogProgress>(IDLE_PROGRESS)
  const [items, setItems] = useState<ScanItem[] | null>(null)
  const [scanAt, setScanAt] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [logExpanded, setLogExpanded] = useState(false)

  useEffect(() => {
    void window.api.scan.latest().then((result) => {
      if (result.ok && result.data) {
        setItems(result.data.items)
        setScanAt(result.data.createdAt)
        // FIX 3: có kết quả cũ thì mở thẳng khối kết quả; nút "Quét nội dung khác" đưa về vùng nhập.
        setView('result')
      }
    })
  }, [])

  useEffect(() => {
    // Tiến trình riêng của kênh Scan cho thanh "Tiến độ quét" dưới Activity Log.
    let active = true
    void window.api.ai.getLog('scan').then((result) => {
      if (active && result.ok) {
        setProgress(result.data.progress)
      }
    })
    const offLog = window.api.events.onAiLog((event) => {
      if (event.channel === 'scan') {
        setProgress(event.progress)
      }
    })
    const offProgress = window.api.events.onAiProgress((event) => {
      if (event.channel === 'scan') {
        setProgress({ done: event.done, total: event.total, running: true })
      }
    })
    return () => {
      active = false
      offLog()
      offProgress()
    }
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

  const choices = listModelChoices(settings?.ai.providers ?? [])
  const scanChain = effectiveChain(
    'scan',
    settings?.ai.taskModels.scan ?? [],
    settings?.ai.lastSelection ?? null
  )
  // Scan cần Web Search gốc của model, không dùng Web Search của app.
  const scanWarnings = chainWarnings('scan', scanChain, choices, false)
  const scanRunnable = firstRunnable('scan', scanChain, choices, false)
  const modelLabel = scanRunnable ? scanRunnable.label : null

  const scanBusy = isBusy('scan')

  let scanDisabledReason: string | null = null
  if (!isAiEnabled) {
    scanDisabledReason = 'Vui lòng bật AI Mode trong Settings để sử dụng Scan.'
  } else if (!scanRunnable) {
    scanDisabledReason =
      scanChain.length === 0
        ? 'Chưa có Model cho Scan Project. Vào Settings → Model Configuration để chọn A1.'
        : `${scanWarnings[0]?.message ?? 'Không có Model nào dùng được cho Scan Project.'} Vào Settings → Model Configuration để chọn model khác.`
  }

  async function acceptFile(file: File): Promise<void> {
    if (!isScanFileName(file.name)) {
      pushToast('Chỉ nhận file .txt, .md hoặc .json', 'error')
      return
    }
    if (file.size > SCAN_FILE_MAX_BYTES) {
      pushToast('File lớn hơn 1 MB', 'error')
      return
    }
    const content = await file.text()
    setText(content)
    setFileName(file.name)
    setView('input')
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) {
      await acceptFile(file)
    }
  }

  function handleDragEnter(event: React.DragEvent): void {
    event.preventDefault()
    dragDepth.current += 1
    setDragActive(true)
  }

  function handleDragOver(event: React.DragEvent): void {
    event.preventDefault()
  }

  function handleDragLeave(event: React.DragEvent): void {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) {
      setDragActive(false)
    }
  }

  function handleDrop(event: React.DragEvent): void {
    event.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) {
      void acceptFile(file)
      return
    }
    const droppedText = event.dataTransfer.getData('text/plain')
    if (droppedText.trim().length > 0) {
      setText(droppedText)
      setFileName(null)
      setView('input')
    }
  }

  /** Log nằm cuối trang: cuộn tới để người dùng thấy tiến trình khi vừa bấm Scan. */
  function revealLog(): void {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    logRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  async function handleScan(): Promise<void> {
    if (!isAiEnabled) {
      pushToast('Vui lòng bật AI Mode trong Settings để sử dụng Scan.', 'info')
      return
    }
    if (scanBusy || scanning || text.trim().length === 0 || scanDisabledReason !== null) {
      return
    }
    revealLog()
    setScanning(true)
    setLoadError(null)
    setSubmitMessage(null)
    setItems(null)
    const result = await window.api.scan.start({ text, fileName: fileName ?? undefined })
    setScanning(false)
    if (!result.ok) {
      setLoadError(result.error.message)
      return
    }
    setItems(result.data.items)
    setScanAt(new Date().toISOString())
    setMessage(result.data.message)
    setSelected(new Set())
    setView('result')
    refreshData()
  }

  async function handleCancel(): Promise<void> {
    const result = await window.api.scan.cancel()
    if (!result.ok) {
      pushToast(result.error.message, 'error')
    }
  }

  function handleScanNew(): void {
    setView('input')
    setText('')
    setFileName(null)
    setMessage(null)
    setSubmitMessage(null)
    setLoadError(null)
    setSelected(new Set())
  }

  function toggleItem(index: number): void {
    setSelected((current) => toggleScanIndex(current, index))
  }

  function selectableIndexes(): number[] {
    return selectableScanIndexes(items ?? [])
  }

  function toggleAll(): void {
    setSelected((current) => toggleScanIndexes(current, selectableIndexes()))
  }

  async function handleSubmit(): Promise<void> {
    if (selected.size === 0 || submitting) {
      return
    }
    setSubmitting(true)
    const result = await window.api.scan.submit(selectedScanNames(selected, items ?? []))
    setSubmitting(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    const data = result.data
    setSubmitMessage(
      `Đã thêm ${data.addedCount} dự án vào danh sách${data.duplicateCount > 0 ? `, ${data.duplicateCount} đã có sẵn` : ''}${
        data.failedCount > 0 ? `, ${data.failedCount} lỗi` : ''
      }`
    )
    const failed = data.results.filter((entry) => entry.error)
    if (failed.length > 0) {
      pushToast(`Không thêm được: ${failed.map((entry) => `${entry.name} (${entry.error})`).join('; ')}`, 'error')
    }
    setSelected(new Set())
    refreshData()
  }

  const canScan = isAiEnabled && !scanBusy && !scanning && text.trim().length > 0 && scanDisabledReason === null
  const allSelectable = selectableIndexes()
  const allSelected = allSelectable.length > 0 && allSelectable.every((index) => selected.has(index))

  // Chip đếm theo loại: chỉ để xem nhanh, không nhóm lại bảng kết quả.
  const scanCounts = {
    event_mmo: (items ?? []).filter((item) => item.category === 'event_mmo').length,
    airdrop: (items ?? []).filter((item) => item.category === 'airdrop').length,
    insufficient: (items ?? []).filter((item) => item.category === 'insufficient').length
  }

  const percent = progressPercent(progress.done, progress.total)

  return (
    <div className="scan-page">
      <div className="page-header scan-page__head">
        <div className="scan-page__heading">
          <span className="scan-page__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8V6a2 2 0 0 1 2-2h2" />
              <path d="M16 4h2a2 2 0 0 1 2 2v2" />
              <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
              <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
              <path d="M7 12h10" />
            </svg>
          </span>
          <div className="page-header__title">
            <h1>Scan Project</h1>
            <span className="page-header__subtitle">
              {modelLabel ? `Model: ${modelLabel}` : 'Chưa có Model'} · AI đọc, tra cứu web và báo cáo trùng lặp
            </span>
          </div>
        </div>
        <div className="row">
          {scanning ? (
            <Button variant="secondary" loading={false} onClick={() => void handleCancel()}>
              Hủy
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={scanning}
              disabled={!canScan}
              title={scanDisabledReason ?? undefined}
              onClick={() => void handleScan()}
            >
              Scan
            </Button>
          )}
        </div>
      </div>

      {scanDisabledReason ? (
        <div className="banner banner--warning" role="alert">
          {scanDisabledReason}
        </div>
      ) : null}

      {loadError ? (
        <ErrorBlock
          message={loadError}
          action={!scanning ? <Button onClick={() => void handleScan()}>Thử lại</Button> : undefined}
        />
      ) : null}

      {view === 'input' ? (
        <>
          <section
            className={`scan-drop${dragActive ? ' scan-drop--active' : ''}${fileName ? ' scan-drop--file' : ''}`}
            aria-label="Vùng dán nội dung"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {text.trim().length === 0 && !fileName ? (
              <div className="scan-drop__placeholder" aria-hidden="true">
                <span className="scan-drop__placeholder-icon">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 16V4" />
                    <path d="M7 9l5-5 5 5" />
                    <path d="M5 20h14" />
                  </svg>
                </span>
                <p className="scan-drop__hint">Dán nội dung (TXT/MD/JSON) hoặc kéo thả file vào đây</p>
              </div>
            ) : null}
            {fileName ? (
              <span className="chip scan-drop__chip">
                {fileName}
                <button
                  type="button"
                  aria-label="Bỏ file"
                  disabled={scanning}
                  onClick={() => {
                    setFileName(null)
                    setText('')
                  }}
                >
                  ✕
                </button>
              </span>
            ) : null}
            <textarea
              className="scan-drop__input"
              aria-label="Nội dung cần quét"
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={scanning}
            />
          </section>

          <div className="scan-page__foot">
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={scanning}>
              📎 Đính kèm TXT/MD/JSON
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={SCAN_FILE_ACCEPT}
              className="visually-hidden"
              onChange={(event) => void handleFileChange(event)}
            />
            <span className="spacer" />
            <span className="muted">Tối đa 1 MB · AI không tự thêm dự án cho đến khi bạn xác nhận</span>
          </div>
        </>
      ) : (
        <section className="scan-results">
          <div className="scan-results__head">
            <div>
              <h2>Kết quả quét</h2>
              <span className="muted">{formatScanAt(scanAt)}</span>
            </div>
            <Button variant="secondary" onClick={handleScanNew} disabled={scanning}>
              Quét nội dung khác
            </Button>
          </div>

          {items && items.length > 0 ? (
            <>
              <p className="muted scan-results__hint">
                Chọn dự án muốn thêm vào danh sách rồi bấm OK. AI chỉ thêm những dự án bạn đã chọn.
              </p>
              <div className="scan-results__counts">
                <span className="chip">Event MMO {scanCounts.event_mmo}</span>
                <span className="chip">Airdrop {scanCounts.airdrop}</span>
                <span className="chip">Không đủ bằng chứng {scanCounts.insufficient}</span>
              </div>
              <div className="scan-table" role="table" aria-label="Kết quả quét">
                <div className="scan-table__head" role="row">
                  <span role="columnheader">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={allSelectable.length === 0}
                      onChange={toggleAll}
                      aria-label="Chọn tất cả dự án có thể thêm"
                    />
                  </span>
                  <span role="columnheader">Dự án</span>
                  <span role="columnheader">Đánh giá ngắn</span>
                  <span role="columnheader">Chi phí · Rủi ro</span>
                </div>
                {items.map((item, index) => (
                  <ScanRow
                    key={scanRowKey(item, index)}
                    item={item}
                    selected={selected.has(index)}
                    onToggle={() => toggleItem(index)}
                  />
                ))}
              </div>

              <div className="scan-submit-bar">
                <span>{submitMessage ?? `Đã chọn ${selected.size}/${allSelectable.length} dự án`}</span>
                <span className="spacer" />
                <Button
                  variant="primary"
                  disabled={selected.size === 0 || submitting || isAiBusy}
                  loading={submitting}
                  onClick={() => void handleSubmit()}
                >
                  {selected.size > 0 ? `OK – Thêm ${selected.size} dự án` : 'OK'}
                </Button>
              </div>
            </>
          ) : items && items.length === 0 ? (
            <EmptyState
              title="Không có dự án mới để thêm"
              message={message ?? 'Không tìm thấy dự án nào, hoặc tất cả đã có trong app.'}
            />
          ) : null}
        </section>
      )}

      {progress.total > 0 ? (
        <div className="scan-progress">
          <div className="scan-progress__head">
            <span>Tiến độ quét</span>
            <span className="scan-progress__value">{percent}%</span>
          </div>
          <div
            className="scan-progress__track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Tiến độ quét"
          >
            <div className="scan-progress__fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : null}

      <div ref={logRef}>
        <AiActivityLog
          channel="scan"
          showProgress={false}
          className={logExpanded ? 'ai-log--expanded' : undefined}
          emptyText="Chưa có hoạt động. Dán nội dung rồi bấm Scan để bắt đầu."
        />
      </div>

      <div className="ai-log-actions">
        <button
          type="button"
          className="ai-log-actions__button"
          aria-expanded={logExpanded}
          onClick={() => setLogExpanded((current) => !current)}
        >
          {logExpanded ? 'Thu gọn nhật ký' : 'Mở rộng nhật ký'}
        </button>
      </div>
    </div>
  )
}

function ScanRow({ item, selected, onToggle }: { item: ScanItem; selected: boolean; onToggle: () => void }): React.JSX.Element {
  const selectable = isScanRowSelectable(item)
  const insufficient = item.category === 'insufficient'
  return (
    <label className={`scan-table__row${selectable ? '' : ' scan-table__row--disabled'}`} role="row">
      <span role="cell">
        <input type="checkbox" checked={selected} disabled={!selectable} onChange={onToggle} aria-label={`Chọn ${item.name}`} />
      </span>
      <span role="cell" className="scan-table__name">
        <strong>{item.name}</strong>
        <Badge tone="neutral">{insufficient ? 'Không đủ bằng chứng' : CATEGORY_LABELS[item.category] ?? item.category}</Badge>
      </span>
      <span role="cell" className="scan-table__note">
        {item.summary || item.taskSummary || 'Chưa có đánh giá'}
      </span>
      <span role="cell" className="scan-table__meta">
        {insufficient ? null : (
          <>
            <CostBadge costType={item.costType} amountUsd={item.costType === 'paid' ? item.costAmountUsd : null} />
            <RiskBadge level={item.riskLevel} />
          </>
        )}
      </span>
    </label>
  )
}
