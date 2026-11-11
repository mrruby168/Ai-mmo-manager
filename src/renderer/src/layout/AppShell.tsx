import type { ReactNode } from 'react'
import { useApp } from '../state/AppContext'
import { useLock } from '../state/LockContext'
import { useToast } from '../state/ToastContext'
import { LockBanner } from './LockBanner'
import { Sidebar } from './Sidebar'

export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  const { isAiBusy } = useLock()
  const { route } = useApp()
  const { toasts, dismissToast } = useToast()

  const inDetail = Boolean(route.projectId) || (route.revenueId !== null && route.revenueId !== undefined)
  const onNewsOrScanTab = !inDetail && (route.tab === 'scan' || route.tab === 'news')
  // Ở tab Check News / Scan, bỏ khóa mù pointer-events để còn bấm chạy kênh kia.
  // Các nút ghi dữ liệu vẫn bị vô hiệu hóa riêng và bị chặn ở main process.
  const blindLock = isAiBusy && !onNewsOrScanTab

  return (
    <div className={`app-shell${blindLock ? ' app--locked' : ''}`}>
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
