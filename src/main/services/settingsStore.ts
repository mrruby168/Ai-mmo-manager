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
import { DEFAULT_NEWS_CACHE_TTL_MS, NEWS_CACHE_TTL_OPTIONS_MS } from '@shared/types'
import type {
  AiSettings,
  AiTask,
  AppSettings,
  AppearanceSettings,
  ModelChain,
  ModelSelection,
  ModelTask,
  ProviderConfig,
  TaskModels,
  WebSearchSettings
} from '@shared/types'

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
  return {
    providers: [],
    lastSelection: null,
    newsSelection: null,
    scanSelection: null,
    taskModels: { news: [], scan: [], chat: [] },
    newsCacheTtlMs: DEFAULT_NEWS_CACHE_TTL_MS
  }
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

function isModelSelection(value: unknown): value is ModelSelection {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<ModelSelection>
  return typeof record.providerId === 'string' && typeof record.modelId === 'string'
}

function modelExists(providers: ProviderConfig[], selection: ModelSelection): boolean {
  const provider = providers.find((entry) => entry.id === selection.providerId)
  return !!provider?.models.some((entry) => entry.id === selection.modelId)
}

function sameModel(a: ModelSelection, b: ModelSelection): boolean {
  return a.providerId === b.providerId && a.modelId === b.modelId
}

/**
 * Chuỗi A1–A3: bỏ mục trùng, bỏ mục trỏ tới model đã bị xóa khỏi AI Settings, tối đa 3.
 * Chưa có danh sách provider (máy mới) thì giữ nguyên để không xóa cấu hình khi chưa cấu hình lại.
 */
function normalizeChain(
  providers: ProviderConfig[],
  chain: ModelChain | undefined,
  fallback: ModelSelection | null
): ModelChain {
  const cleaned: ModelChain = []
  for (const item of Array.isArray(chain) ? chain : []) {
    if (!isModelSelection(item) || cleaned.some((entry) => sameModel(entry, item))) {
      continue
    }
    if (providers.length > 0 && !modelExists(providers, item)) {
      continue
    }
    cleaned.push({ providerId: item.providerId, modelId: item.modelId })
    if (cleaned.length === 3) {
      break
    }
  }
  if (cleaned.length === 0 && fallback && (providers.length === 0 || modelExists(providers, fallback))) {
    cleaned.push({ ...fallback })
  }
  return cleaned
}

function normalizeNewsCacheTtl(value: unknown): number {
  return typeof value === 'number' && (NEWS_CACHE_TTL_OPTIONS_MS as readonly number[]).includes(value)
    ? value
    : DEFAULT_NEWS_CACHE_TTL_MS
}

/**
 * `settings.json` cũ chỉ có newsSelection/scanSelection/lastSelection: đọc y như trước,
 * suy A1 của chuỗi từ các trường đó. File mới có `taskModels` thì chuẩn hóa chuỗi và
 * đồng bộ ngược các trường cũ = A1 (bất biến để mã cũ tiếp tục chạy).
 */
function normalizeAi(value: Partial<AiSettings> | undefined): AiSettings {
  const fallback = defaultAiSettings()
  if (!value || !Array.isArray(value.providers)) {
    return fallback
  }
  const providers = value.providers
  const lastSelection = value.lastSelection ?? null
  const newsSelection = value.newsSelection ?? null
  const scanSelection = value.scanSelection ?? null
  const newsCacheTtlMs = normalizeNewsCacheTtl(value.newsCacheTtlMs)

  if (!value.taskModels) {
    return {
      providers,
      lastSelection,
      newsSelection,
      scanSelection,
      taskModels: {
        news: newsSelection ? [newsSelection] : [],
        scan: scanSelection ? [scanSelection] : [],
        chat: lastSelection ? [lastSelection] : []
      },
      newsCacheTtlMs
    }
  }

  const taskModels: TaskModels = {
    news: normalizeChain(providers, value.taskModels.news, newsSelection),
    scan: normalizeChain(providers, value.taskModels.scan, scanSelection),
    chat: normalizeChain(providers, value.taskModels.chat, lastSelection)
  }
  return {
    providers,
    lastSelection: taskModels.chat[0] ?? null,
    newsSelection: taskModels.news[0] ?? null,
    scanSelection: taskModels.scan[0] ?? null,
    taskModels,
    newsCacheTtlMs
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

function withChainHead(chain: ModelChain, selection: ModelSelection | null): ModelChain {
  const rest = selection ? chain.filter((entry) => !sameModel(entry, selection)) : chain
  return selection ? [selection, ...rest].slice(0, 3) : rest
}

export function saveLastSelection(selection: AiSettings['lastSelection']): AppSettings {
  const current = getSettings().ai
  const taskModels: TaskModels = { ...current.taskModels, chat: withChainHead(current.taskModels.chat, selection) }
  return updateSettings({ ai: normalizeAi({ ...current, lastSelection: selection, taskModels }) })
}

/**
 * FIX 2: News and Scan keep their own model. A stale selection is preserved on
 * purpose so the renderer can tell the user it fell back to the default.
 */
export function saveTaskSelection(task: AiTask, selection: ModelSelection | null): AppSettings {
  const current = getSettings().ai
  const patch = task === 'news' ? { newsSelection: selection } : { scanSelection: selection }
  const taskModels: TaskModels = { ...current.taskModels, [task]: withChainHead(current.taskModels[task], selection) }
  return updateSettings({ ai: normalizeAi({ ...current, ...patch, taskModels }) })
}

/** FIX 2: lưu cả chuỗi A1–A3 của một tác vụ, kèm TTL cache News khi có. */
export function saveModelConfig(task: ModelTask, chain: ModelChain, newsCacheTtlMs?: number): AppSettings {
  const current = getSettings().ai
  const taskModels: TaskModels = { ...current.taskModels, [task]: chain }
  const next = newsCacheTtlMs === undefined ? { ...current, taskModels } : { ...current, taskModels, newsCacheTtlMs }
  return updateSettings({ ai: normalizeAi(next) })
}

export function saveAiMode(aiMode: AiMode): AppSettings {
  return updateSettings({ aiMode: aiMode === 'noai' ? 'noai' : 'ai' })
}

export function saveWebSearchSettings(webSearch: WebSearchSettings): AppSettings {
  return updateSettings({ webSearch: normalizeWebSearch(webSearch) })
}
