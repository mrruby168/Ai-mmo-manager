import type { ReactNode } from 'react'
import { useLock } from '../state/LockContext'
import { useToast } from '../state/ToastContext'
import { LockBanner } from './LockBanner'
import { Sidebar } from './Sidebar'

export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  const { isAiBusy } = useLock()
  const { toasts, dismissToast } = useToast()

  return (
    <div className={`app-shell${isAiBusy ? ' app--locked' : ''}`}>
      <Sidebar />
      <div className="app-main">
        <LockBanner />
        <main className="app-content">
          <div className="app-content__inner">{children}</div>
        </main>
      </div>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`} role="status" onClick={() => dismissToast(toast.id)}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}
