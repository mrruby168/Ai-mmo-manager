import type { ReactNode } from 'react'

export function EmptyState({
  title,
  message,
  action
}: {
  title: string
  message: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <span className="empty-state__title">{title}</span>
      <span>{message}</span>
      {action}
    </div>
  )
}

export function LoadingBlock({ message = 'Đang tải…' }: { message?: string }): React.JSX.Element {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <span className="lock-banner__spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

export function ErrorBlock({ message, action }: { message: string; action?: ReactNode }): React.JSX.Element {
  return (
    <div className="empty-state" role="alert">
      <span className="empty-state__title">Đã xảy ra lỗi</span>
      <span>{message}</span>
      {action}
    </div>
  )
}
