import { useId, useState } from 'react'
import type { ReactNode } from 'react'

export interface TaskModelCardProps {
  /** Card heading, e.g. "Model cho Check News". */
  title: string
  /** Current effective model shown on the collapsed row. */
  summary: string
  /** Muted note kept visible while the picker is collapsed. */
  hint?: string | null
  /** Warning kept visible even while the picker is collapsed. */
  warning?: string | null
  /** Start expanded. News/Scan default to collapsed to save vertical space. */
  defaultOpen?: boolean
  children: ReactNode
}

function ChevronIcon({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  )
}

/**
 * Collapsible wrapper around the shared ModelPicker used by News and Scan.
 * The collapsed row keeps the card title, the effective model summary and the
 * warning visible; only the Provider/Model selects are folded away.
 */
export function TaskModelCard({
  title,
  summary,
  hint,
  warning,
  defaultOpen = false,
  children
}: TaskModelCardProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = `${useId()}-body`

  return (
    <div className={`card stack ai-task-picker task-model-card${open ? ' task-model-card--open' : ''}`}>
      <div className="section-title task-model-card__header">
        <h2>{title}</h2>
        <div className="task-model-card__meta">
          <span className="muted task-model-card__summary" title={summary}>
            {summary}
          </span>
          <button
            type="button"
            className="task-model-card__toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? `Thu gọn ${title}` : `Mở rộng ${title}`}
            title={open ? 'Thu gọn' : 'Mở rộng'}
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronIcon open={open} />
          </button>
        </div>
      </div>
      {!open && hint ? <p className="muted task-model-card__hint">{hint}</p> : null}
      <div id={bodyId} className="task-model-card__body" hidden={!open}>
        {children}
      </div>
      {warning ? (
        <p className="ai-task-picker__warning" role="alert">
          {warning}
        </p>
      ) : null}
    </div>
  )
}
