import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  DEFAULT_FONT_FAMILY,
  FONT_SIZE_RANGE,
  FONT_WEIGHT_RANGE,
  SAFE_FONT_FAMILIES,
  WEB_SEARCH_PROVIDERS
} from '@shared/constants'
import type { AiMode, WebSearchProvider } from '@shared/constants'
import type { AiSettings, AiTask, AppSettings, AppearanceSettings, ModelSelection, WebSearchSettings } from '@shared/types'

let cache: AppSettings | null = null

function settingsFilePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function defaultDataPath(): string {
  return join(app.getPath('documents'), 'MMO-APP-DATA')
}

export function defaultAppearance(): AppearanceSettings {
  return {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: FONT_SIZE_RANGE.defaultValue,
    fontWeight: FONT_WEIGHT_RANGE.defaultValue
  }
}

export function defaultAiSettings(): AiSettings {
  return { providers: [], lastSelection: null, newsSelection: null, scanSelection: null }
}

function buildDefaults(): AppSettings {
  return {
    schemaVersion: 1,
    dataPath: defaultDataPath(),
    appearance: defaultAppearance(),
    ai: defaultAiSettings(),
    aiMode: 'ai',
    webSearch: defaultWebSearch()
  }
}

export function defaultWebSearch(): WebSearchSettings {
  return { provider: 'none', baseUrl: null }
}

function isWebSearchProvider(value: unknown): value is WebSearchProvider {
  return typeof value === 'string' && (WEB_SEARCH_PROVIDERS as readonly string[]).includes(value)
}

/**
 * File cũ không có `webSearch` phải chạy y như trước: mặc định `none`.
 * baseUrl chỉ giữ cho SearXNG để tránh ghi nhầm URL của provider khác.
 */
function normalizeWebSearch(value: Partial<WebSearchSettings> | undefined): WebSearchSettings {
  if (!value || !isWebSearchProvider(value.provider)) {
    return defaultWebSearch()
  }
  const provider = value.provider
  const rawBaseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : ''
  return {
    provider,
    baseUrl: provider === 'searxng' && rawBaseUrl.length > 0 ? rawBaseUrl : null
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

function normalizeAppearance(value: Partial<AppearanceSettings> | undefined): AppearanceSettings {
  const fallback = defaultAppearance()
  if (!value) {
    return fallback
  }
  const fontFamily = typeof value.fontFamily === 'string' && value.fontFamily.trim().length > 0 ? value.fontFamily : fallback.fontFamily
  return {
    fontFamily: (SAFE_FONT_FAMILIES as readonly string[]).includes(fontFamily) ? fontFamily : fallback.fontFamily,
    fontSize: clamp(Number(value.fontSize), FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, fallback.fontSize),
    fontWeight: clamp(Number(value.fontWeight), FONT_WEIGHT_RANGE.min, FONT_WEIGHT_RANGE.max, fallback.fontWeight)
  }
}

function normalizeAi(value: Partial<AiSettings> | undefined): AiSettings {
  const fallback = defaultAiSettings()
  if (!value || !Array.isArray(value.providers)) {
    return fallback
  }
  return {
    providers: value.providers,
    lastSelection: value.lastSelection ?? null,
    newsSelection: value.newsSelection ?? null,
    scanSelection: value.scanSelection ?? null
  }
}

export function normalizeSettings(value: Partial<AppSettings>): AppSettings {
  const defaults = buildDefaults()
  return {
    schemaVersion: 1,
    dataPath: typeof value.dataPath === 'string' && value.dataPath.trim().length > 0 ? value.dataPath : defaults.dataPath,
    appearance: normalizeAppearance(value.appearance),
    ai: normalizeAi(value.ai),
    // Files written before AI modes existed have no field; they must keep
    // behaving exactly as before, i.e. AI enabled.
    aiMode: value.aiMode === 'noai' ? 'noai' : 'ai',
    webSearch: normalizeWebSearch(value.webSearch)
  }
}

function persist(settings: AppSettings): void {
  const file = settingsFilePath()
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  writeFileSync(temporary, JSON.stringify(settings, null, 2), 'utf8')
  renameSync(temporary, file)
}

function readFromDisk(): AppSettings {
  const file = settingsFilePath()
  if (!existsSync(file)) {
    const defaults = buildDefaults()
    persist(defaults)
    return defaults
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppSettings>
  return normalizeSettings(parsed)
}

export function getSettings(): AppSettings {
  if (!cache) {
    cache = readFromDisk()
  }
  return cache
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const merged = normalizeSettings({ ...getSettings(), ...patch })
  persist(merged)
  cache = merged
  return merged
}

export function saveAppearance(appearance: Partial<AppearanceSettings>): AppSettings {
  const current = getSettings()
  return updateSettings({ appearance: normalizeAppearance({ ...current.appearance, ...appearance }) })
}

export function saveAiSettings(ai: AiSettings): AppSettings {
  return updateSettings({ ai: normalizeAi(ai) })
}

export function saveLastSelection(selection: AiSettings['lastSelection']): AppSettings {
  const current = getSettings().ai
  return updateSettings({ ai: normalizeAi({ ...current, lastSelection: selection }) })
}

/**
 * FIX 2: News and Scan keep their own model. A stale selection is preserved on
 * purpose so the renderer can tell the user it fell back to the default.
 */
export function saveTaskSelection(task: AiTask, selection: ModelSelection | null): AppSettings {
  const current = getSettings().ai
  const patch = task === 'news' ? { newsSelection: selection } : { scanSelection: selection }
  return updateSettings({ ai: normalizeAi({ ...current, ...patch }) })
}

export function saveAiMode(aiMode: AiMode): AppSettings {
  return updateSettings({ aiMode: aiMode === 'noai' ? 'noai' : 'ai' })
}

export function saveWebSearchSettings(webSearch: WebSearchSettings): AppSettings {
  return updateSettings({ webSearch: normalizeWebSearch(webSearch) })
}
