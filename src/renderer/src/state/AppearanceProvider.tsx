import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_FONT_FAMILY, FONT_SIZE_RANGE, FONT_WEIGHT_RANGE } from '@shared/constants'
import type { AppearanceSettings } from '@shared/types'

export const defaultAppearance: AppearanceSettings = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: FONT_SIZE_RANGE.defaultValue,
  fontWeight: FONT_WEIGHT_RANGE.defaultValue
}

interface AppearanceContextValue {
  appearance: AppearanceSettings
  preview: (next: AppearanceSettings) => void
  apply: (next: AppearanceSettings) => Promise<boolean>
  reset: () => Promise<boolean>
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

function applyToDocument(appearance: AppearanceSettings): void {
  const root = document.documentElement
  root.style.setProperty('--font-ui', appearance.fontFamily)
  root.style.setProperty('--font-size-base', `${appearance.fontSize}px`)
  root.style.setProperty('--font-weight-base', String(appearance.fontWeight))
}

export function AppearanceProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [appearance, setAppearance] = useState<AppearanceSettings>(defaultAppearance)

  useEffect(() => {
    let active = true
    void window.api.settings.get().then((result) => {
      if (active && result.ok) {
        setAppearance(result.data.appearance)
      }
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    applyToDocument(appearance)
  }, [appearance])

  const preview = useCallback((next: AppearanceSettings) => {
    setAppearance(next)
  }, [])

  const apply = useCallback(async (next: AppearanceSettings): Promise<boolean> => {
    const result = await window.api.settings.setAppearance(next)
    if (!result.ok) {
      return false
    }
    setAppearance(result.data.appearance)
    return true
  }, [])

  const reset = useCallback(async (): Promise<boolean> => {
    return apply(defaultAppearance)
  }, [apply])

  const value = useMemo<AppearanceContextValue>(
    () => ({ appearance, preview, apply, reset }),
    [appearance, preview, apply, reset]
  )

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext)
  if (!context) {
    throw new Error('useAppearance phải dùng bên trong AppearanceProvider')
  }
  return context
}
