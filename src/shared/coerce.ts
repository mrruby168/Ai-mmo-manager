import type { ZodError } from 'zod'
import type { ProjectCategory, CostType, ProjectStatus, VerificationState } from './constants'

/**
 * Lenient normalisation applied *before* zod, so hand-written or
 * AI-generated data ("Airdrop", "31/12/2026", "abc.com", "@handle", "$5")
 * does not fail the strict schemas.
 */

export type UrlKind = 'website' | 'x' | 'discord' | 'telegram' | 'other'

const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,50}$/

export function coerceUrl(value: unknown, kind: UrlKind = 'website'): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  let text = value.trim()
  if (text.length === 0) {
    return undefined
  }

  if (text.startsWith('@')) {
    const handle = text.slice(1).trim()
    if (!HANDLE_PATTERN.test(handle)) {
      return undefined
    }
    return kind === 'telegram' ? `https://t.me/${handle}` : `https://x.com/${handle}`
  }

  if (text.startsWith('//')) {
    text = `https:${text}`
  } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text)) {
    text = `https://${text.replace(/^\/+/, '')}`
  }

  try {
    const url = new URL(text)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined
    }
    if (!url.hostname.includes('.')) {
      return undefined
    }
    const normalized = url.toString()
    return url.pathname === '/' && url.search === '' && url.hash === '' ? normalized.replace(/\/$/, '') : normalized
  } catch {
    return undefined
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Accepts yyyy-mm-dd, yyyy/mm/dd, dd/mm/yyyy and dd-mm-yyyy. */
export function coerceDate(value: unknown): string | null | undefined {
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    return undefined
  }
  const text = value.trim()
  if (text.length === 0) {
    return undefined
  }

  const yearFirst = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (yearFirst) {
    return buildDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3])) ?? undefined
  }
  const dayFirst = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (dayFirst) {
    return buildDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1])) ?? undefined
  }
  return undefined
}

function coerceText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const text = value.replace(/^\uFEFF/, '').trim()
  return text.length > 0 ? text : undefined
}

const CATEGORY_ALIASES: Record<string, ProjectCategory> = {
  event: 'event_mmo',
  eventmmo: 'event_mmo',
  event_mmo: 'event_mmo',
  mmo: 'event_mmo',
  airdrop: 'airdrop',
  air_drop: 'airdrop',
  airdrops: 'airdrop',
  drop: 'airdrop'
}

const COST_ALIASES: Record<string, CostType> = {
  free: 'free',
  '0': 'free',
  paid: 'paid',
  pay: 'paid',
  unverified: 'unverified',
  unknown: 'unverified'
}

const STATUS_ALIASES: Record<string, ProjectStatus> = {
  not_joined: 'not_joined',
  notjoined: 'not_joined',
  pending: 'not_joined',
  in_progress: 'in_progress',
  inprogress: 'in_progress',
  doing: 'in_progress',
  completed: 'completed',
  complete: 'completed',
  done: 'completed'
}

const VERIFICATION_ALIASES: Record<string, VerificationState> = {
  verified: 'verified',
  true: 'verified',
  unverified: 'unverified',
  false: 'unverified',
  unknown: 'unverified'
}

function normalizeKey(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function coerceCategory(value: unknown): ProjectCategory | undefined {
  const key = normalizeKey(value)
  return CATEGORY_ALIASES[key] ?? CATEGORY_ALIASES[key.replace(/_/g, '')]
}

function coerceCostType(value: unknown): CostType | undefined {
  return COST_ALIASES[normalizeKey(value)]
}

function coerceStatus(value: unknown): ProjectStatus | undefined {
  return STATUS_ALIASES[normalizeKey(value)]
}

function coerceVerification(value: unknown): VerificationState | undefined {
  return VERIFICATION_ALIASES[normalizeKey(value)]
}

function coerceAmount(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value !== 'string') {
    return undefined
  }
  const text = value
    .trim()
    .toLowerCase()
    .replace(/usd|\$|,/g, (match) => (match === ',' ? '.' : ''))
    .replace(/\s/g, '')
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return undefined
  }
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coerceSocials(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const source = { ...value }
  if (source.twitter !== undefined && source.x === undefined) {
    source.x = source.twitter
  }
  const result: Record<string, unknown> = {}
  const x = coerceUrl(source.x, 'x')
  const discord = coerceUrl(source.discord, 'discord')
  const telegram = coerceUrl(source.telegram, 'telegram')
  if (x) {
    result.x = x
  }
  if (discord) {
    result.discord = discord
  }
  if (telegram) {
    result.telegram = telegram
  }

  const rawOther = source.other
  const otherList = Array.isArray(rawOther)
    ? rawOther
    : typeof rawOther === 'string'
      ? rawOther.split(/[\n,]/)
      : []
  const other = otherList
    .map((entry) => coerceUrl(entry, 'other'))
    .filter((entry): entry is string => entry !== undefined)
  if (other.length > 0) {
    result.other = Array.from(new Set(other))
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function coerceSources(value: unknown): string[] | undefined {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,]/) : []
  const urls = list
    .map((entry) => coerceUrl(entry, 'other'))
    .filter((entry): entry is string => entry !== undefined)
  const unique = Array.from(new Set(urls))
  return unique.length > 0 ? unique : undefined
}

/**
 * Normalises one project-shaped object. Returns a plain object that the
 * strict `projectImportItemSchema` can safely parse.
 */
export function coerceProjectItem(raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === '' || typeof raw !== 'object') {
    return {}
  }
  const source = { ...(raw as Record<string, unknown>) }

  const category = coerceCategory(source.category ?? source.type)
  const website = coerceUrl(source.website ?? source.url ?? source.link, 'website')

  // Accept social links either nested under `socials` or at the top level.
  const socialSource: Record<string, unknown> = isRecord(source.socials) ? { ...source.socials } : {}
  for (const key of ['x', 'discord', 'telegram', 'other'] as const) {
    if (socialSource[key] === undefined && source[key] !== undefined) {
      socialSource[key] = source[key]
    }
  }
  if (socialSource.x === undefined && source.twitter !== undefined) {
    socialSource.x = source.twitter
  }
  const socials = coerceSocials(socialSource)

  const startDate = coerceDate(source.startDate ?? source.start_date ?? source.start)
  const endDate = coerceDate(source.endDate ?? source.end_date ?? source.end)
  const costAmountUsd = coerceAmount(source.costAmountUsd ?? source.cost_amount_usd ?? source.cost)
  let costType = coerceCostType(source.costType ?? source.cost_type)

  if (costType === 'paid' && costAmountUsd === undefined) {
    costType = 'unverified'
  }
  if (!costType && costAmountUsd !== undefined && costAmountUsd > 0) {
    costType = 'paid'
  }

  const notes = coerceText(source.notes)
  const taskSummary = coerceText(source.taskSummary ?? source.task_summary ?? source.task)
  const howToJoin = coerceText(source.howToJoin ?? source.how_to_join ?? source.how_to)
  const name = coerceText(source.name ?? source.title)

  return {
    category,
    name,
    website,
    socials,
    taskSummary,
    howToJoin,
    startDate,
    endDate,
    costType,
    costAmountUsd,
    status: coerceStatus(source.status),
    verification: coerceVerification(source.verification ?? source.verified),
    sources: coerceSources(source.sources),
    notes
  }
}

function balancedSlice(text: string, start: number, open: string, close: string): string | null {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === open) {
      depth += 1
    } else if (char === close) {
      depth -= 1
      if (depth === 0) {
        return text.slice(start, index + 1)
      }
    }
  }
  return null
}

/** Pulls a JSON block out of markdown or free text. Returns null when none. */
export function extractJsonText(input: string): string | null {
  if (typeof input !== 'string') {
    return null
  }
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : input

  const objectStart = candidate.indexOf('{')
  const arrayStart = candidate.indexOf('[')
  const useObject = objectStart !== -1 && (arrayStart === -1 || objectStart < arrayStart)
  if (useObject) {
    return balancedSlice(candidate, objectStart, '{', '}')
  }
  if (arrayStart !== -1) {
    return balancedSlice(candidate, arrayStart, '[', ']')
  }
  return null
}

/** Accepts {projects:[…]}, […], {items:[…]}, {data:[…]} or a single project object. */
export function extractProjectItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }
  if (!isRecord(payload)) {
    return []
  }
  for (const key of ['projects', 'items', 'data'] as const) {
    if (Array.isArray(payload[key])) {
      return payload[key] as unknown[]
    }
  }
  if (isRecord(payload.project)) {
    return [payload.project]
  }
  if (typeof payload.name === 'string' || typeof payload.title === 'string') {
    return [payload]
  }
  return []
}

/** Parses JSON text, tolerating a UTF-8 BOM (Windows Notepad). */
export function parseJsonText(raw: string): unknown {
  const cleaned = raw.replace(/^\uFEFF/, '')
  try {
    return JSON.parse(cleaned) as unknown
  } catch (error) {
    throw new Error(`JSON không hợp lệ: ${error instanceof Error ? error.message : 'không đọc được nội dung'}`)
  }
}

/** Short zod error for UI/IPC: at most three issues, `path: message`. */
export function formatZodError(error: ZodError): string {
  const issues = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    return `${path}: ${issue.message}`
  })
  const extra = error.issues.length > 3 ? ` (+${error.issues.length - 3} lỗi nữa)` : ''
  return `${issues.join('; ')}${extra}`
}
