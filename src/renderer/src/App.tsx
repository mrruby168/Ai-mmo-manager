import { EmptyState } from './common/EmptyState'
import { SettingsPage } from './features/settings/SettingsPage'
import { ScanPage } from './features/scan/ScanPage'
import { NewsPage } from './features/news/NewsPage'
import { ChatPanel } from './features/chat/ChatPanel'
import { RevenuePage } from './features/revenue/RevenuePage'
import { RevenueDetailPage } from './features/revenue/RevenueDetailPage'
import { ProjectDetailPage } from './features/projects/ProjectDetailPage'
import { ProjectListPage } from './features/projects/ProjectListPage'
import { AppShell } from './layout/AppShell'
import { AppProvider, useApp } from './state/AppContext'
import { AppearanceProvider } from './state/AppearanceProvider'
import { LockProvider } from './state/LockContext'
import { ToastProvider } from './state/ToastContext'

function Router(): React.JSX.Element {
  const { route } = useApp()

  if (route.projectId) {
    return (
      <>
        <ProjectDetailPage projectId={route.projectId} />
        <ChatPanel />
      </>
    )
  }

  if (route.revenueId !== null && route.revenueId !== undefined) {
    return (
      <>
        <RevenueDetailPage revenueId={route.revenueId} />
        <ChatPanel />
      </>
    )
  }

  const page = ((): React.JSX.Element => {
    switch (route.tab) {
      case 'event_mmo':
        return <ProjectListPage category="event_mmo" />
      case 'airdrop':
        return <ProjectListPage category="airdrop" />
      case 'scan':
        return <ScanPage />
      case 'news':
        return <NewsPage />
      case 'revenue':
        return <RevenuePage />
      case 'settings':
        return <SettingsPage />
      default:
        return <EmptyState title="MMO Manager" message="Chọn một mục ở thanh bên để bắt đầu." />
    }
  })()

  const chatHidden = route.tab === 'scan' || route.tab === 'news'

  return (
    <>
      {page}
      {route.tab !== 'settings' ? <ChatPanel hidden={chatHidden} /> : null}
    </>
  )
}

export default function App(): React.JSX.Element {
  return (
    <AppearanceProvider>
      <ToastProvider>
        <LockProvider>
          <AppProvider>
            <AppShell>
              <Router />
            </AppShell>
          </AppProvider>
        </LockProvider>
      </ToastProvider>
    </AppearanceProvider>
  )
}
