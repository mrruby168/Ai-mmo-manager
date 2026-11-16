/**
 * v0.1.4: hai chế độ Check News.
 * - `daily`: quét nhanh, cửa sổ 2–3 ngày, bỏ qua dự án vừa quét (3/12/24 giờ).
 * - `full`: quét sâu như trước v0.1.4, cửa sổ 7 ngày.
 *
 * Module thuần (không Electron/Node/DOM) để test được bằng dữ liệu giả.
 */

import type { NewsCheckOutcome } from './costControl'
import { COST_LIMITS, isCacheFresh, newsCacheTtlForOutcome } from './costControl'
import type { NewsScanMode, NewsScanSettings } from './types'
import { DEFAULT_NEWS_SCAN_SETTINGS } from './types'

export interface NewsScanProfile {
  mode: NewsScanMode
  /** Số ngày của cửa sổ tin, tính cả hôm nay (daily 2–3, full 7). */
  windowDays: number
  /** Sàn/trần ngân sách tìm kiếm của cả lần chạy. */
  minSearches: number
  maxSearches: number
  /** Cap `web_search` của app trong một lô. */
  maxSearchesPerBatch: number
  /** Cap `web_fetch` trong một lô. */
  maxFetchesPerBatch: number
  /** Cap `web_fetch` của cả lần chạy (chống mở bài vô hạn). */
  maxFetchesPerRun: number
  /** Số bước agent tối đa mỗi lô. */
  maxSteps: number
  /** Phần ngân sách còn lại dành cho vòng 2 (0 = không chạy vòng 2). */
  round2BudgetShare: number
  /** Daily: khoảng cách tối thiểu giữa hai lần quét cùng dự án. */
  dailyMinIntervalMs: number
}

const HOUR_MS = 3_600_000

function hoursToMs(hours: number): number {
  return Math.max(1, Math.round(hours)) * HOUR_MS
}

/**
 * Hồ sơ của một mode. `settings` có thể thiếu (settings.json cũ hoặc test cũ)
 * và luôn rơi về `DEFAULT_NEWS_SCAN_SETTINGS`.
 */
export function profileFor(
  mode: NewsScanMode,
  settings: Partial<NewsScanSettings> | undefined = DEFAULT_NEWS_SCAN_SETTINGS
): NewsScanProfile {
  const resolved = settings ?? DEFAULT_NEWS_SCAN_SETTINGS
  const dailyMinIntervalMs = hoursToMs(resolved.dailyMinIntervalHours ?? DEFAULT_NEWS_SCAN_SETTINGS.dailyMinIntervalHours)

  if (mode === 'daily') {
    return {
      mode: 'daily',
      windowDays: resolved.dailyWindowDays ?? DEFAULT_NEWS_SCAN_SETTINGS.dailyWindowDays,
      minSearches: 12,
      maxSearches: 40,
      maxSearchesPerBatch: 4,
      maxFetchesPerBatch: 4,
      maxFetchesPerRun: 60,
      maxSteps: 12,
      round2BudgetShare: 0.25,
      dailyMinIntervalMs
    }
  }

  return {
    mode: 'full',
    windowDays: 7,
    minSearches: COST_LIMITS.newsMaxSearchesPerRun,
    maxSearches: 80,
    maxSearchesPerBatch: COST_LIMITS.newsMaxSearchesPerBatch,
    maxFetchesPerBatch: COST_LIMITS.newsMaxFetchesPerBatch,
    maxFetchesPerRun: 150,
    maxSteps: COST_LIMITS.agentMaxSteps,
    round2BudgetShare: 0.3,
    dailyMinIntervalMs
  }
}

/** Ngân sách tìm kiếm của lần chạy: 2 lượt/dự án, kẹp trong sàn/trần của mode. */
export function searchBudgetFor(profile: NewsScanProfile, projectCount: number): number {
  const count = Number.isFinite(projectCount) ? Math.max(0, Math.floor(projectCount)) : 0
  return Math.min(profile.maxSearches, Math.max(profile.minSearches, 2 * count))
}

/** Số lượt `web_fetch` còn được cấp cho lô tiếp theo, theo cap của cả lần chạy. */
export function fetchCapForBatch(profile: NewsScanProfile, fetchesUsed: number): number {
  const used = Number.isFinite(fetchesUsed) ? Math.max(0, Math.floor(fetchesUsed)) : 0
  return Math.max(0, Math.min(profile.maxFetchesPerBatch, profile.maxFetchesPerRun - used))
}

/** Entry cache tối thiểu mà `selectNewsScope` cần; khớp với `NewsCheckEntry` của main. */
export interface NewsScopeEntry {
  fingerprint: string
  checkedAt: string
  /** null = lần trước nộp tin nhưng bị loại hết, không được coi là cache. */
  outcome?: NewsCheckOutcome | null
}

export interface NewsScopeInput<T extends { id: string }> {
  /** Danh sách dự án đã sắp thứ tự (dự án hoàn thành xếp cuối). */
  projects: readonly T[]
  mode: NewsScanMode
  fingerprints: ReadonlyMap<string, string>
  /** Entry của chính mode đang chạy (`news` cho full, `newsd` cho daily). */
  entries: ReadonlyMap<string, NewsScopeEntry>
  /** Daily: entry của Full để tái dùng, tránh quét lại việc vừa quét sâu. */
  fullEntries?: ReadonlyMap<string, NewsScopeEntry>
  nowMs: number
  /** TTL cache Full do người dùng chọn (1 phút / 3 giờ / 8 giờ). */
  fullTtlMs: number
  /** Daily: 3 / 12 / 24 giờ. */
  dailyMinIntervalMs: number
  force?: boolean
}

export interface NewsScopeResult<T> {
  scope: T[]
  cachedCount: number
}

function fullEntryFresh(
  entry: NewsScopeEntry | undefined,
  fingerprint: string | undefined,
  nowMs: number,
  fullTtlMs: number
): boolean {
  if (!entry || entry.fingerprint !== fingerprint) {
    return false
  }
  return isCacheFresh(entry.checkedAt, nowMs, newsCacheTtlForOutcome(entry.outcome, fullTtlMs))
}

function dailyEntryFresh(
  entry: NewsScopeEntry | undefined,
  fingerprint: string | undefined,
  nowMs: number,
  dailyMinIntervalMs: number
): boolean {
  if (!entry || entry.fingerprint !== fingerprint || entry.outcome === null) {
    return false
  }
  return isCacheFresh(entry.checkedAt, nowMs, dailyMinIntervalMs)
}

/**
 * Chọn dự án cần quét.
 * - Full chỉ tin entry `news` của chính nó (TTL theo outcome như trước).
 * - Daily bỏ qua dự án đã có entry `newsd` trong 3/12/24 giờ, hoặc entry `news`
 *   còn tươi theo TTL Full và link không đổi. Daily không bao giờ chặn Full.
 */
export function selectNewsScope<T extends { id: string }>(input: NewsScopeInput<T>): NewsScopeResult<T> {
  if (input.force) {
    return { scope: [...input.projects], cachedCount: 0 }
  }

  const scope: T[] = []
  let cachedCount = 0
  for (const project of input.projects) {
    const fingerprint = input.fingerprints.get(project.id)
    const own = input.entries.get(project.id)
    const fresh =
      input.mode === 'daily'
        ? dailyEntryFresh(own, fingerprint, input.nowMs, input.dailyMinIntervalMs) ||
          fullEntryFresh(input.fullEntries?.get(project.id), fingerprint, input.nowMs, input.fullTtlMs)
        : fullEntryFresh(own, fingerprint, input.nowMs, input.fullTtlMs)

    if (fresh) {
      cachedCount += 1
    } else {
      scope.push(project)
    }
  }
  return { scope, cachedCount }
}

/** Ngân sách con: không vượt quá `max` và vẫn trừ vào ngân sách cha. */
export function createSubBudget(parent: SearchBudgetLike, max: number): SearchBudgetLike {
  const limit = Math.max(0, Math.floor(max))
  let used = 0
  return {
    max: limit,
    used: () => used,
    remaining: () => Math.max(0, Math.min(limit - used, parent.remaining())),
    exhausted: () => used >= limit || parent.exhausted(),
    tryConsume(count = 1) {
      if (count <= 0) {
        return true
      }
      if (used + count > limit || !parent.tryConsume(count)) {
        return false
      }
      used += count
      return true
    },
    record(count) {
      if (count > 0) {
        parent.record(count)
        used += count
      }
    }
  }
}

/** Tối thiểu những gì `createSubBudget` cần; khớp `SearchBudget` của main. */
export interface SearchBudgetLike {
  readonly max: number
  used(): number
  remaining(): number
  exhausted(): boolean
  tryConsume(count?: number): boolean
  record(count: number): void
}

/**
 * Daily chỉ giữ todo có hạn trong cửa sổ (hoặc đã quá hạn); todo xa hơn để
 * Full Scan lo, tránh Daily kéo về một danh sách việc quá dài.
 */
export function keepDailyTodo(todoDeadline: string | null, windowDays: number, today: string): boolean {
  if (!todoDeadline) {
    return false
  }
  const [year, month, day] = todoDeadline.slice(0, 10).split('-').map(Number)
  const [todayYear, todayMonth, todayDay] = today.slice(0, 10).split('-').map(Number)
  if (![year, month, day, todayYear, todayMonth, todayDay].every((value) => Number.isFinite(value))) {
    return false
  }
  const left = Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86_400_000
  )
  return left <= Math.max(0, Math.floor(windowDays))
}
