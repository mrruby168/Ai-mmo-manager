import { describe, expect, it } from 'vitest'
import { DEFAULT_NEWS_SCAN_SETTINGS } from '../src/shared/types'
import type { NewsScanSettings } from '../src/shared/types'
import {
  createSubBudget,
  fetchCapForBatch,
  keepDailyTodo,
  profileFor,
  searchBudgetFor,
  selectNewsScope
} from '../src/shared/newsScanMode'
import type { NewsScopeEntry } from '../src/shared/newsScanMode'
import { createSearchBudget } from '../src/main/ai/searchBudget'
import { recencyBucket, searxngSearchUrl } from '../src/main/services/searchProviders'

const DAILY: NewsScanSettings = { defaultMode: 'daily', dailyMinIntervalHours: 3, dailyWindowDays: 2 }

const projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const fingerprints = new Map([
  ['a', 'fa'],
  ['b', 'fb'],
  ['c', 'fc']
])

function entry(overrides: Partial<NewsScopeEntry> = {}): NewsScopeEntry {
  return { fingerprint: 'fa', checkedAt: '2026-11-16T00:00:00.000Z', outcome: 'found', ...overrides }
}

const NOW = Date.parse('2026-11-16T06:00:00.000Z')

describe('profileFor', () => {
  it('Full giữ nguyên hành vi cũ: 7 ngày, 150 lượt mở bài, 16 bước', () => {
    const profile = profileFor('full')
    expect(profile.mode).toBe('full')
    expect(profile.windowDays).toBe(7)
    expect(profile.maxFetchesPerRun).toBe(150)
    expect(profile.maxSteps).toBe(16)
    expect(profile.maxSearchesPerBatch).toBe(6)
  })

  it('Daily đọc cửa sổ và khoảng nghỉ từ settings', () => {
    const profile = profileFor('daily', DAILY)
    expect(profile.mode).toBe('daily')
    expect(profile.windowDays).toBe(2)
    expect(profile.dailyMinIntervalMs).toBe(3 * 3_600_000)
    expect(profile.maxFetchesPerRun).toBe(60)
    expect(profile.maxSteps).toBeLessThan(16)
  })

  it('settings thiếu hoặc rỗng vẫn trả hồ sơ hợp lệ (settings.json cũ)', () => {
    expect(profileFor('full', undefined).windowDays).toBe(7)
    expect(profileFor('daily', {}).windowDays).toBe(DEFAULT_NEWS_SCAN_SETTINGS.dailyWindowDays)
    expect(profileFor('daily', {}).dailyMinIntervalMs).toBe(12 * 3_600_000)
  })
})

describe('searchBudgetFor', () => {
  it('Full: 2 lượt/dự án, sàn 30, trần 80', () => {
    const full = profileFor('full')
    expect(searchBudgetFor(full, 5)).toBe(30)
    expect(searchBudgetFor(full, 11)).toBe(30)
    expect(searchBudgetFor(full, 25)).toBe(50)
    expect(searchBudgetFor(full, 100)).toBe(80)
  })

  it('Daily rẻ hơn: sàn 12, trần 40', () => {
    const daily = profileFor('daily', DAILY)
    expect(searchBudgetFor(daily, 2)).toBe(12)
    expect(searchBudgetFor(daily, 10)).toBe(20)
    expect(searchBudgetFor(daily, 100)).toBe(40)
  })

  it('số dự án không hợp lệ coi như 0', () => {
    expect(searchBudgetFor(profileFor('full'), Number.NaN)).toBe(30)
    expect(searchBudgetFor(profileFor('daily', DAILY), -5)).toBe(12)
  })
})

describe('fetchCapForBatch', () => {
  it('giảm dần theo số lượt mở bài đã dùng và dừng ở 0', () => {
    const full = profileFor('full')
    expect(fetchCapForBatch(full, 0)).toBe(6)
    expect(fetchCapForBatch(full, 148)).toBe(2)
    expect(fetchCapForBatch(full, 150)).toBe(0)
    expect(fetchCapForBatch(full, 999)).toBe(0)
  })

  it('Daily có cap thấp hơn', () => {
    const daily = profileFor('daily', DAILY)
    expect(fetchCapForBatch(daily, 0)).toBe(4)
    expect(fetchCapForBatch(daily, 59)).toBe(1)
  })
})

describe('selectNewsScope', () => {
  const base = {
    projects,
    fingerprints,
    nowMs: NOW,
    fullTtlMs: 3 * 3_600_000,
    dailyMinIntervalMs: 12 * 3_600_000
  }

  it('Full chỉ dùng entry Full: còn tươi + cùng fingerprint thì bỏ qua', () => {
    const entries = new Map([['a', entry({ checkedAt: '2026-11-16T04:00:00.000Z' })]])
    const result = selectNewsScope({ ...base, mode: 'full', entries })
    expect(result.cachedCount).toBe(1)
    expect(result.scope.map((project) => project.id)).toEqual(['b', 'c'])
  })

  it('Full bỏ qua entry khi fingerprint đổi', () => {
    const entries = new Map([['a', entry({ fingerprint: 'old', checkedAt: '2026-11-16T04:00:00.000Z' })]])
    const result = selectNewsScope({ ...base, mode: 'full', entries })
    expect(result.scope.map((project) => project.id)).toEqual(['a', 'b', 'c'])
  })

  it('Full không đọc cache Daily', () => {
    const dailyEntries = new Map([['a', entry({ checkedAt: '2026-11-16T04:00:00.000Z' })]])
    const result = selectNewsScope({ ...base, mode: 'full', entries: new Map(), fullEntries: dailyEntries })
    expect(result.scope.map((project) => project.id)).toEqual(['a', 'b', 'c'])
  })

  it('Daily bỏ qua dự án đã quét trong 12 giờ', () => {
    const entries = new Map([['a', entry({ checkedAt: '2026-11-16T00:00:00.000Z' })]])
    const result = selectNewsScope({ ...base, mode: 'daily', entries })
    expect(result.cachedCount).toBe(1)
    expect(result.scope.map((project) => project.id)).toEqual(['b', 'c'])
  })

  it('Daily quét lại khi entry cũ hơn khoảng nghỉ', () => {
    const entries = new Map([['a', entry({ checkedAt: '2026-11-15T12:00:00.000Z' })]])
    const result = selectNewsScope({ ...base, mode: 'daily', entries })
    expect(result.scope.map((project) => project.id)).toEqual(['a', 'b', 'c'])
  })

  it('Daily tái dùng entry Full còn tươi (link không đổi)', () => {
    const fullEntries = new Map([['b', entry({ fingerprint: 'fb', checkedAt: '2026-11-16T04:00:00.000Z' })]])
    const result = selectNewsScope({ ...base, mode: 'daily', entries: new Map(), fullEntries })
    expect(result.cachedCount).toBe(1)
    expect(result.scope.map((project) => project.id)).toEqual(['a', 'c'])
  })

  it('Daily không coi entry outcome=null là cache', () => {
    const entries = new Map([['a', entry({ checkedAt: '2026-11-16T05:00:00.000Z', outcome: null })]])
    const result = selectNewsScope({ ...base, mode: 'daily', entries })
    expect(result.scope.map((project) => project.id)).toEqual(['a', 'b', 'c'])
  })

  it('force bỏ qua toàn bộ cache', () => {
    const entries = new Map([['a', entry({ checkedAt: '2026-11-16T05:00:00.000Z' })]])
    const result = selectNewsScope({ ...base, mode: 'full', entries, force: true })
    expect(result.cachedCount).toBe(0)
    expect(result.scope).toHaveLength(3)
  })
})

describe('createSubBudget', () => {
  it('không vượt cap riêng và vẫn trừ ngân sách cha', () => {
    const parent = createSearchBudget(10)
    const sub = createSubBudget(parent, 3)
    expect(sub.tryConsume()).toBe(true)
    expect(sub.tryConsume(2)).toBe(true)
    expect(sub.tryConsume()).toBe(false)
    expect(sub.used()).toBe(3)
    expect(parent.used()).toBe(3)
    expect(sub.remaining()).toBe(0)
  })

  it('dừng khi ngân sách cha cạn trước', () => {
    const parent = createSearchBudget(2)
    const sub = createSubBudget(parent, 5)
    expect(sub.tryConsume(2)).toBe(true)
    expect(sub.tryConsume()).toBe(false)
    expect(sub.exhausted()).toBe(true)
  })

  it('record cộng vào cả hai', () => {
    const parent = createSearchBudget(10)
    const sub = createSubBudget(parent, 5)
    sub.record(2)
    expect(sub.used()).toBe(2)
    expect(parent.used()).toBe(2)
  })
})

describe('keepDailyTodo', () => {
  const today = '2026-11-16'

  it('giữ todo có hạn trong cửa sổ hoặc đã quá hạn', () => {
    expect(keepDailyTodo('2026-11-18', 2, today)).toBe(true)
    expect(keepDailyTodo('2026-11-16', 2, today)).toBe(true)
    expect(keepDailyTodo('2026-11-10', 2, today)).toBe(true)
  })

  it('bỏ todo không có hạn hoặc hạn xa hơn cửa sổ', () => {
    expect(keepDailyTodo(null, 3, today)).toBe(false)
    expect(keepDailyTodo('2026-11-20', 3, today)).toBe(false)
    expect(keepDailyTodo('không phải ngày', 3, today)).toBe(false)
  })
})

describe('cửa sổ mode → bộ lọc thời gian của Web Search', () => {
  it('map số ngày sang bucket mà cả ba provider đều hiểu', () => {
    expect(recencyBucket(undefined)).toBeNull()
    expect(recencyBucket(0)).toBeNull()
    expect(recencyBucket(1)).toBe('day')
    expect(recencyBucket(2)).toBe('week')
    expect(recencyBucket(7)).toBe('week')
    expect(recencyBucket(8)).toBe('month')
  })

  it('SearXNG nhận time_range theo cửa sổ của mode', () => {
    const daily = new URL(searxngSearchUrl('https://searx.example.org', 'alpha airdrop', profileFor('daily', DAILY).windowDays))
    expect(daily.searchParams.get('time_range')).toBe('week')

    const full = new URL(searxngSearchUrl('https://searx.example.org', 'alpha airdrop', profileFor('full').windowDays))
    expect(full.searchParams.get('time_range')).toBe('week')

    const noFilter = new URL(searxngSearchUrl('https://searx.example.org', 'alpha airdrop'))
    expect(noFilter.searchParams.get('time_range')).toBeNull()
  })
})
