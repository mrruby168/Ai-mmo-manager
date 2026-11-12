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
  newsMaxSearchesPerBatch: 4,

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
