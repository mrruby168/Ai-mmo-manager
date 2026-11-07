import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  DEFAULT_FONT_FAMILY,
  FONT_SIZE_RANGE,
  FONT_WEIGHT_RANGE,
  SAFE_FONT_FAMILIES
} from '@shared/constants'
import type { AiMode } from '@shared/constants'
import type { AiSettings, AppSettings, AppearanceSettings } from '@shared/types'

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
  return { providers: [], lastSelection: null }
}

function buildDefaults(): AppSettings {
  return {
    schemaVersion: 1,
    dataPath: defaultDataPath(),
    appearance: defaultAppearance(),
    ai: defaultAiSettings(),
    aiMode: 'ai'
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
    lastSelection: value.lastSelection ?? null
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
    aiMode: value.aiMode === 'noai' ? 'noai' : 'ai'
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

export function saveAiMode(aiMode: AiMode): AppSettings {
  return updateSettings({ aiMode: aiMode === 'noai' ? 'noai' : 'ai' })
}
