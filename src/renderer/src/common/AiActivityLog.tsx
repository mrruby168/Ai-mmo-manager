import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AiChannel, AiLogEntry, AiLogProgress } from '@shared/types'
import { AI_LOG_LEVEL_SYMBOL, AI_LOG_LEVEL_TONE, formatLogProgress, progressPercent } from '@shared/aiLog'

export interface AiActivityLogProps {
  channel: AiChannel
  /** Dòng hướng dẫn khi chưa có hoạt động nào. */
  emptyText: string
  /** Scan hiển thị thanh "Tiến độ quét" riêng bên dưới nên tắt footer của log. */
  showProgress?: boolean
  /**
   * `card`: ô grid của News 2×2 (điền đầy chiều cao ô). `inline` (mặc định):
   * khối riêng cao cố định như hiện có, dùng cho Scan.
   */
  layout?: 'inline' | 'card'
  /** Nút/điều khiển đặt bên phải của đầu khung (News: "Mở rộng nhật ký"). */
  headerExtra?: ReactNode
  className?: string
}

const IDLE_PROGRESS: AiLogProgress = { done: 0, total: 0, running: false }

/**
 * FIX 3: khung Activity Log dùng chung cho News và Scan.
 * - Lấy lại log + tiến trình khi mở tab (`ai:getLog`), sau đó nghe `ai:log`/`ai:progress`.
 * - Tự cuộn xuống cuối trừ khi người dùng đã cuộn lên.
 * - Pill Live khi đang chạy; "Xong"/"Sẵn sàng" khi rảnh.
 */
export function AiActivityLog({
  channel,
  emptyText,
  showProgress = true,
  layout = 'inline',
  headerExtra,
  className
}: AiActivityLogProps): React.JSX.Element {
  const [entries, setEntries] = useState<AiLogEntry[]>([])
  const [progress, setProgress] = useState<AiLogProgress>(IDLE_PROGRESS)
  const [loaded, setLoaded] = useState(false)

  const bodyRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    void window.api.ai.getLog(channel).then((result) => {
      if (cancelled) {
        return
      }
      if (result.ok) {
        setEntries(result.data.entries)
        setProgress(result.data.progress)
      }
      stickRef.current = true
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [channel])

  useEffect(() => {
    const offLog = window.api.events.onAiLog((event) => {
      if (event.channel !== channel) {
        return
      }
      if (event.reset) {
        setEntries([])
        stickRef.current = true
      }
      if (event.entry) {
        const entry = event.entry
        setEntries((current) => [...current, entry].slice(-200))
      }
      setProgress(event.progress)
    })

    const offProgress = window.api.events.onAiProgress((event) => {
      if (event.channel !== channel) {
        return
      }
      setProgress({ done: event.done, total: event.total, running: true })
    })

    return () => {
      offLog()
      offProgress()
    }
  }, [channel])

  useEffect(() => {
    const body = bodyRef.current
    if (body && stickRef.current) {
      body.scrollTop = body.scrollHeight
    }
  }, [entries])

  function handleScroll(): void {
    const body = bodyRef.current
    if (!body) {
      return
    }
    stickRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 24
  }

  const percent = progressPercent(progress.done, progress.total)
  const pillLabel = progress.running ? 'Live' : entries.length > 0 ? 'Xong' : 'Sẵn sàng'
  const countLabel = formatLogProgress(channel, progress.done, progress.total)

  return (
    <section
      className={`ai-log${layout === 'card' ? ' ai-log--card' : ''}${className ? ` ${className}` : ''}`}
      aria-label="Activity Log"
    >
      <header className="ai-log__head">
        <span className="ai-log__title">Activity Log</span>
        <div className="ai-log__head-end">
          <span className={`ai-log__pill${progress.running ? ' ai-log__pill--live' : ''}`} role="status">
            <span className="ai-log__pill-dot" aria-hidden="true" />
            {pillLabel}
          </span>
          {headerExtra}
        </div>
      </header>

      <div
        ref={bodyRef}
        className="ai-log__body"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Nhật ký hoạt động ${channel === 'news' ? 'Check News' : 'Scan Project'}`}
        onScroll={handleScroll}
      >
        {entries.length === 0 ? (
          <p className="ai-log__empty">{loaded ? emptyText : 'Đang tải hoạt động…'}</p>
        ) : (
          entries.map((entry) => (
            <p
              key={entry.id}
              className={`ai-log__line ai-log__line--${AI_LOG_LEVEL_TONE[entry.level]}`}
              title={new Date(entry.at).toLocaleTimeString('vi-VN')}
            >
              <span className="ai-log__symbol" aria-hidden="true">
                {AI_LOG_LEVEL_SYMBOL[entry.level]}
              </span>
              <span className="ai-log__text">{entry.text}</span>
            </p>
          ))
        )}
      </div>

      {showProgress ? (
        <footer className="ai-log__foot">
          <div
            className="ai-log__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Tiến trình"
          >
            <div className="ai-log__bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="ai-log__count">{countLabel}</span>
        </footer>
      ) : null}
    </section>
  )
}
