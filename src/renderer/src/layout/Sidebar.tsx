import { useEffect, useState } from 'react'
import { BarChart3, Download, Gift, Newspaper, RefreshCw, ScanSearch, Settings, Trophy } from 'lucide-react'
import { useApp } from '../state/AppContext'
import type { TabId } from '../state/AppContext'
import { useUpdate } from '../state/UpdateContext'
import { clearUnseen, useNewsBadge } from '../state/newsBadgeStore'
import { ThemeToggle } from '../common/ThemeToggle'
import appIcon from '../assets/new-icon.svg'

interface TabDefinition {
  id: TabId
  label: string
  icon: React.JSX.Element
}

const TABS: TabDefinition[] = [
  {
    id: 'news',
    label: 'News',
    icon: <Newspaper size={20} strokeWidth={1.75} />
  },
  {
    id: 'event_mmo',
    label: 'Event MMO',
    icon: <Trophy size={20} strokeWidth={1.75} />
  },
  {
    id: 'airdrop',
    label: 'Airdrop',
    icon: <Gift size={20} strokeWidth={1.75} />
  },
  {
    id: 'scan',
    label: 'Scan Project',
    icon: <ScanSearch size={20} strokeWidth={1.75} />
  },
  {
    id: 'revenue',
    label: 'Doanh thu',
    icon: <BarChart3 size={20} strokeWidth={1.75} />
  }
]

const settingsTab: TabDefinition = {
  id: 'settings',
  label: 'Settings',
  icon: <Settings size={20} strokeWidth={1.75} />
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
        <span className="sidebar__brand-text">
          MMO Manager
          <span className="sidebar__brand-sub">Event · Airdrop · Doanh thu</span>
        </span>
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
          {refreshing ? <span className="sidebar__spinner" /> : <RefreshCw size={20} strokeWidth={1.75} />}
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
              <Download size={20} strokeWidth={1.75} />
            </span>
            <span className="sidebar__update-label">{updateLabel}</span>
            <span className="sidebar__update-badge">New</span>
          </button>
        ) : null}
        <ThemeToggle />
        <div className="sidebar__version">{updateState ? `v${updateState.currentVersion}` : ''}</div>
      </div>
    </nav>
  )
}
