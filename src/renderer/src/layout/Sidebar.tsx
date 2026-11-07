import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext'
import type { TabId } from '../state/AppContext'
import { useLock } from '../state/LockContext'

interface TabDefinition {
  id: TabId
  label: string
  icon: React.JSX.Element
}

function Icon({ path, emoji }: { path?: string; emoji?: string }): React.JSX.Element {
  if (emoji) {
    return <span style={{ fontSize: 20, lineHeight: 1 }}>{emoji}</span>
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RefreshIcon(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" strokeLinecap="round" />
      <path d="M20 5v6h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const TABS: TabDefinition[] = [
  {
    id: 'news',
    label: 'News',
    icon: <Icon emoji="📰" />
  },
  {
    id: 'event_mmo',
    label: 'Event MMO',
    icon: <Icon emoji="🏆" />
  },
  {
    id: 'airdrop',
    label: 'Airdrop',
    icon: <Icon emoji="🎁" />
  },
  {
    id: 'scan',
    label: 'Scan Project',
    icon: <Icon emoji="🔍" />
  },
  {
    id: 'revenue',
    label: 'Doanh thu',
    icon: <Icon emoji="📊" />
  }
]

const settingsTab: TabDefinition = {
  id: 'settings',
  label: 'Settings',
  icon: <Icon path="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.6h5l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z" />
}

export function Sidebar(): React.JSX.Element {
  const { route, navigateTab, refreshData } = useApp()
  const { isAiBusy } = useLock()
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!refreshing) {
      return
    }
    const timer = window.setTimeout(() => setRefreshing(false), 700)
    return () => window.clearTimeout(timer)
  }, [refreshing])

  function handleRefresh(forceReload: boolean): void {
    if (forceReload) {
      window.location.reload()
      return
    }
    refreshData()
    setRefreshing(true)
  }

  function renderItem(tab: TabDefinition): React.JSX.Element {
    const active = route.tab === tab.id
    return (
      <button
        key={tab.id}
        type="button"
        className={`sidebar__item${active ? ' sidebar__item--active' : ''}`}
        aria-current={active ? 'page' : undefined}
        title={tab.label}
        disabled={isAiBusy}
        onClick={() => navigateTab(tab.id)}
      >
        <span className="sidebar__icon">{tab.icon}</span>
        <span className="sidebar__label">{tab.label}</span>
      </button>
    )
  }

  return (
    <nav className="sidebar" aria-label="Điều hướng chính">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark" aria-hidden="true">
          M
        </span>
        <span className="sidebar__brand-text">MMO Manager</span>
      </div>
      {TABS.map(renderItem)}
      <div className="spacer" />
      <button
        type="button"
        className="sidebar__item"
        title="Làm mới dữ liệu và logo (Shift+Click: tải lại toàn bộ app)"
        aria-label="Làm mới dữ liệu"
        onClick={(event) => handleRefresh(event.shiftKey)}
      >
        <span className="sidebar__icon" aria-hidden="true">
          {refreshing ? <span className="sidebar__spinner" /> : <RefreshIcon />}
        </span>
        <span className="sidebar__label">Làm mới</span>
      </button>
      {renderItem(settingsTab)}
    </nav>
  )
}
