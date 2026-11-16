import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext'
import type { TabId } from '../state/AppContext'
import { useUpdate } from '../state/UpdateContext'
import { clearUnseen, useNewsBadge } from '../state/newsBadgeStore'
import appIcon from '../assets/new-icon.svg'

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

function DownloadIcon(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 4v10" strokeLinecap="round" />
      <path d="M8 10l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
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
  const { state: updateState, openDialog } = useUpdate()
  const [refreshing, setRefreshing] = useState(false)
  const { unseen } = useNewsBadge()

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
    const showDot = tab.id === 'news' && unseen && !active
    return (
      <button
        key={tab.id}
        type="button"
        className={`sidebar__item${active ? ' sidebar__item--active' : ''}`}
        aria-current={active ? 'page' : undefined}
        title={showDot ? `${tab.label} · có tin mới` : tab.label}
        onClick={() => {
          if (tab.id === 'news') {
            clearUnseen()
          }
          navigateTab(tab.id)
        }}
      >
        <span className="sidebar__icon">
          {tab.icon}
          {showDot ? <span className="sidebar__dot" aria-label="Có tin mới" /> : null}
        </span>
        <span className="sidebar__label">{tab.label}</span>
      </button>
    )
  }

  const hasUpdate =
    updateState !== null &&
    (updateState.phase === 'available' || updateState.phase === 'downloading' || updateState.phase === 'downloaded') &&
    Boolean(updateState.latestVersion)
  const updateLabel =
    updateState?.phase === 'downloading'
      ? `Đang tải… ${Math.round(updateState.percent ?? 0)}%`
      : `Update v${updateState?.latestVersion ?? ''}`

  return (
    <nav className="sidebar" aria-label="Điều hướng chính">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark" aria-hidden="true">
          <img src={appIcon} width={28} height={28} alt="" aria-hidden="true" />
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
      <div className="sidebar__footer">
        {hasUpdate ? (
          <button
            type="button"
            className="sidebar__update"
            onClick={openDialog}
            aria-label={`Cập nhật lên v${updateState?.latestVersion ?? ''}`}
          >
            <span className="sidebar__update-icon" aria-hidden="true">
              <DownloadIcon />
            </span>
            <span className="sidebar__update-label">{updateLabel}</span>
            <span className="sidebar__update-badge">New</span>
          </button>
        ) : null}
        <div className="sidebar__version">{updateState ? `v${updateState.currentVersion}` : ''}</div>
      </div>
    </nav>
  )
}
