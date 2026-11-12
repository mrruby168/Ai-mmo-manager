/**
 * Cost-control constants and pure helpers shared by Scan and Check News.
 * No Electron / Node / DOM imports, so everything here is unit-testable.
 */

export const COST_LIMITS = {
  /** A scan result for the same name + website is reused inside this window. */
  scanCacheTtlMs: 24 * 60 * 60 * 1000,

  /** Hard cap on web searches per Check News / Scan run (shared by all batches). */
  newsMaxSearchesPerRun: 30,
  scanMaxSearchesPerRun: 20,
  /** Cap on the app-side `web_search` tool per batch (the grouped prefetch is extra). */
  newsMaxSearchesPerBatch: 6,

  newsBatchSize: 5,
  /** Anthropic native web search allows 5 uses per request, so keep room for a retry. */
  newsBatchSizeAnthropicNative: 3,

  newsMaxFetchesPerBatch: 6,
  scanMaxFetchesPerBatch: 6,

  /** web_fetch output for Scan/News is reduced to the lines about airdrop/deadline/milestone. */
  focusedFetchMaxChars: 6_000,

  /** Older tool results are shortened before being re-sent to the model. */
  toolResultFullTurns: 2,
  toolResultCompactChars: 1_200,

  agentMaxSteps: 16
} as const

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size))
  const result: T[][] = []
  for (let index = 0; index < items.length; index += step) {
    result.push(items.slice(index, index + step))
  }
  return result
}

export function pickNewsBatchSize(providerType: string, nativeSearch: boolean): number {
  return providerType === 'anthropic' && nativeSearch
    ? COST_LIMITS.newsBatchSizeAnthropicNative
    : COST_LIMITS.newsBatchSize
}

/** True when `checkedAtIso` is a valid timestamp that is not older than `ttlMs`. */
export function isCacheFresh(checkedAtIso: string | null | undefined, nowMs: number, ttlMs: number): boolean {
  if (!checkedAtIso) {
    return false
  }
  const checkedAt = Date.parse(checkedAtIso)
  if (Number.isNaN(checkedAt)) {
    return false
  }
  const age = nowMs - checkedAt
  return age >= 0 && age <= ttlMs
}

/**
 * Kết quả một lô Check News: có tin mới hay không.
 * Lô nộp tin nhưng bị loại hết thì không ghi cache (xem `decideNewsCacheOutcome`).
 */
export type NewsCheckOutcome = 'found' | 'empty'

/** Lô không có tin mới chỉ khóa cache tối đa 2 giờ, không khóa hết TTL 3/8 giờ. */
export const NEWS_EMPTY_CACHE_MAX_MS = 2 * 60 * 60 * 1000

/**
 * TTL thật của một mục cache News theo kết quả lần trước.
 * `null` = lần trước có nộp nhưng bị loại hết, không được coi là cache.
 */
export function newsCacheTtlForOutcome(
  outcome: NewsCheckOutcome | null | undefined,
  configuredTtlMs: number
): number {
  if (outcome === null) {
    return 0
  }
  if (outcome === 'empty') {
    return Math.min(configuredTtlMs, NEWS_EMPTY_CACHE_MAX_MS)
  }
  return configuredTtlMs
}

/**
 * Quyết định ghi cache sau một lô:
 * - có tin mới -> `found`
 * - không có tin và cũng không có tin bị loại -> `empty`
 * - có nộp nhưng bị loại hết -> `null` (không ghi, lần sau kiểm lại)
 */
export function decideNewsCacheOutcome(added: number, rejected: number): NewsCheckOutcome | null {
  if (added > 0) {
    return 'found'
  }
  if (rejected > 0) {
    return null
  }
  return 'empty'
}

/** Ngân sách tìm kiếm mỗi lần Check News: 2 lượt/dự án, tối thiểu 30, tối đa 80. */
export function newsSearchBudgetForProjects(projectCount: number): number {
  const count = Number.isFinite(projectCount) ? Math.max(0, Math.floor(projectCount)) : 0
  return Math.min(80, Math.max(COST_LIMITS.newsMaxSearchesPerRun, 2 * count))
}

/** "1 phút" / "3 giờ" / "8 giờ" cho thông báo cache Check News. */
export function formatNewsCacheTtl(ttlMs: number): string {
  const minutes = Math.max(1, Math.round(ttlMs / 60_000))
  return minutes < 60 ? `${minutes} phút` : `${Math.round(minutes / 60)} giờ`
}

function cleanTerm(name: string): string {
  return name.replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim()
}

function renderTerm(name: string): string {
  return /\s/.test(name) ? `"${name}"` : name
}

function renderGroup(group: readonly string[], suffix: string): string {
  const tail = suffix.trim()
  const head = group.length === 1 ? renderTerm(group[0]) : `(${group.map(renderTerm).join(' OR ')})`
  return tail.length > 0 ? `${head} ${tail}` : head
}

/**
 * Merges several project names into as few boolean queries as possible:
 * `("Alpha Net" OR Beta OR Gamma) airdrop snapshot claim`.
 * Groups stay small (default 3) because search engines rank one project far
 * above the others when too many are OR-ed together, which hurts recall.
 */
export function buildGroupedSearchQueries(
  names: readonly string[],
  suffix: string,
  options: { maxNamesPerQuery?: number; maxLength?: number } = {}
): string[] {
  const maxNames = Math.max(1, options.maxNamesPerQuery ?? 3)
  const maxLength = Math.max(40, options.maxLength ?? 300)

  const unique: string[] = []
  const seen = new Set<string>()
  for (const raw of names) {
    const cleaned = cleanTerm(raw)
    const key = cleaned.toLowerCase()
    if (cleaned.length === 0 || seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(cleaned)
  }

  const queries: string[] = []
  let current: string[] = []
  for (const name of unique) {
    const candidate = [...current, name]
    const tooMany = candidate.length > maxNames
    const tooLong = current.length > 0 && renderGroup(candidate, suffix).length > maxLength
    if (current.length > 0 && (tooMany || tooLong)) {
      queries.push(renderGroup(current, suffix))
      current = [name]
    } else {
      current = candidate
    }
  }
  if (current.length > 0) {
    queries.push(renderGroup(current, suffix))
  }
  return queries
}
