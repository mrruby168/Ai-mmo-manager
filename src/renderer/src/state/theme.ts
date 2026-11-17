export type ThemeMode = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'mmo-theme'
export const DEFAULT_THEME_MODE: ThemeMode = 'dark'

/**
 * Khai báo tối thiểu phần DOM mà module này dùng, để file dùng được cả trong
 * test chạy bằng Node (tsconfig.node.json không bật lib DOM).
 */
interface ThemeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface ThemeMediaQueryList {
  matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

interface ThemeWindow {
  localStorage: ThemeStorage
  matchMedia(query: string): ThemeMediaQueryList
}

interface ThemeDocument {
  documentElement: { dataset: { theme?: string } }
}

function getWindow(): ThemeWindow | null {
  return (globalThis as { window?: ThemeWindow }).window ?? null
}

function getDocument(): ThemeDocument | null {
  return (globalThis as { document?: ThemeDocument }).document ?? null
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system'
}

export function resolveTheme(mode: ThemeMode, systemPrefersLight: boolean): ResolvedTheme {
  if (mode === 'system') {
    return systemPrefersLight ? 'light' : 'dark'
  }
  return mode
}

export function readThemeMode(): ThemeMode {
  try {
    const raw = getWindow()?.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(raw) ? raw : DEFAULT_THEME_MODE
  } catch {
    return DEFAULT_THEME_MODE
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    getWindow()?.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Không lưu được thì chỉ mất ghi nhớ, giao diện vẫn đúng.
  }
}

export function systemPrefersLight(): boolean {
  try {
    return getWindow()?.matchMedia('(prefers-color-scheme: light)').matches ?? false
  } catch {
    return false
  }
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode, systemPrefersLight())
  const document = getDocument()
  if (document) {
    document.documentElement.dataset.theme = resolved
  }
  return resolved
}
