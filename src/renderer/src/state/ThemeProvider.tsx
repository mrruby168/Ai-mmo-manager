import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { applyTheme, readThemeMode, saveThemeMode } from './theme'
import type { ThemeMode } from './theme'

interface ThemeContextValue {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(() => readThemeMode())

  useEffect(() => {
    applyTheme(mode)
    if (mode !== 'system') {
      return undefined
    }
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (): void => {
      applyTheme('system')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    saveThemeMode(next)
    setModeState(next)
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({ mode, setMode }), [mode, setMode])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme phải dùng bên trong ThemeProvider')
  }
  return context
}
