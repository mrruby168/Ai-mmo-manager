import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AiMode } from '@shared/constants'

export type TabId = 'event_mmo' | 'airdrop' | 'scan' | 'news' | 'revenue' | 'settings'

export interface AppRoute {
  tab: TabId
  projectId: string | null
  revenueId: number | null
}

interface AppContextValue {
  route: AppRoute
  dataVersion: number
  aiMode: AiMode
  isAiEnabled: boolean
  navigateTab: (tab: TabId) => void
  openProject: (projectId: string) => void
  closeProject: () => void
  openRevenue: (revenueId: number) => void
  closeRevenue: () => void
  refreshData: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

const initialRoute: AppRoute = { tab: 'event_mmo', projectId: null, revenueId: null }

export function AppProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [route, setRoute] = useState<AppRoute>(initialRoute)
  const [dataVersion, setDataVersion] = useState(0)
  const [aiMode, setAiMode] = useState<AiMode>('ai')

  const refreshData = useCallback(() => {
    setDataVersion((current) => current + 1)
  }, [])

  useEffect(() => {
    return window.api.events.onDataChanged(() => {
      refreshData()
    })
  }, [refreshData])

  // Settings changes are broadcast as dataChanged, so aiMode follows the main
  // process after switching modes. Legacy files report "ai".
  useEffect(() => {
    let active = true
    void window.api.settings.get().then((result) => {
      if (active && result.ok) {
        setAiMode(result.data.aiMode)
      }
    })
    return () => {
      active = false
    }
  }, [dataVersion])

  const navigateTab = useCallback((tab: TabId) => {
    setRoute({ tab, projectId: null, revenueId: null })
  }, [])

  const openProject = useCallback((projectId: string) => {
    setRoute((current) => ({ ...current, projectId, revenueId: null }))
  }, [])

  const closeProject = useCallback(() => {
    setRoute((current) => ({ ...current, projectId: null }))
  }, [])

  const openRevenue = useCallback((revenueId: number) => {
    setRoute((current) => ({ ...current, revenueId }))
  }, [])

  const closeRevenue = useCallback(() => {
    setRoute((current) => ({ ...current, revenueId: null }))
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      route,
      dataVersion,
      aiMode,
      isAiEnabled: aiMode === 'ai',
      navigateTab,
      openProject,
      closeProject,
      openRevenue,
      closeRevenue,
      refreshData
    }),
    [route, dataVersion, aiMode, navigateTab, openProject, closeProject, openRevenue, closeRevenue, refreshData]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp phải dùng bên trong AppProvider')
  }
  return context
}
