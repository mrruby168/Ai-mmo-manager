import { afterAll, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../src/main/db/connection'
import { insertProject } from '../src/main/db/projectsRepo'
import {
  getDailyCheckEntries,
  getNewsCheckEntries,
  markDailyChecked,
  markNewsChecked,
  purgeAiCache
} from '../src/main/db/aiCacheRepo'

const HOUR = 3_600_000

function seedProject(id: string, name: string): void {
  insertProject({
    id,
    category: 'airdrop',
    name,
    nameKey: name.toLowerCase(),
    domainKey: null,
    website: null,
    socials: {},
    taskSummary: '',
    howToJoin: '',
    startDate: null,
    endDate: null,
    costType: 'free',
    costAmountUsd: null,
    status: 'not_joined',
    verification: 'unverified',
    sources: [],
    logoPath: null,
    notes: '',
    origin: 'manual',
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z'
  })
}

describe('ai_cache Daily (v0.1.4)', () => {
  openDatabase(':memory:')
  afterAll(() => closeDatabase())

  seedProject('PRJ-D1', 'Daily One')
  seedProject('PRJ-F1', 'Full One')
  seedProject('PRJ-D2', 'Daily Two')
  seedProject('PRJ-D3', 'Daily Three')

  it('ghi/đọc entry Daily riêng, không lẫn với entry Full', () => {
    markDailyChecked([{ projectId: 'PRJ-D1', fingerprint: 'd1' }], '2026-11-16T01:00:00.000Z', 'empty')
    markNewsChecked([{ projectId: 'PRJ-F1', fingerprint: 'f1' }], '2026-11-16T01:00:00.000Z', 'found')

    expect(getDailyCheckEntries().get('PRJ-D1')).toEqual({
      fingerprint: 'd1',
      checkedAt: '2026-11-16T01:00:00.000Z',
      outcome: 'empty'
    })
    expect(getDailyCheckEntries().has('PRJ-F1')).toBe(false)
    expect(getNewsCheckEntries().has('PRJ-D1')).toBe(false)
    expect(getNewsCheckEntries().get('PRJ-F1')?.fingerprint).toBe('f1')
  })

  it('purge 3 tham số cũ vẫn dùng TTL Full cho entry Daily', () => {
    markDailyChecked([{ projectId: 'PRJ-D2', fingerprint: 'd2' }], '2026-11-16T02:00:00.000Z')
    // 1 giờ sau, TTL Full 3 giờ: còn giữ.
    expect(purgeAiCache(Date.parse('2026-11-16T03:00:00.000Z'), 3 * HOUR, 24 * HOUR)).toBe(0)
    expect(getDailyCheckEntries().has('PRJ-D2')).toBe(true)
    // 4 giờ sau: entry Daily bị dọn theo TTL Full.
    expect(purgeAiCache(Date.parse('2026-11-16T06:00:00.000Z'), 3 * HOUR, 24 * HOUR)).toBeGreaterThan(0)
    expect(getDailyCheckEntries().has('PRJ-D2')).toBe(false)
  })

  it('purge 4 tham số dùng khoảng nghỉ Daily riêng', () => {
    markDailyChecked([{ projectId: 'PRJ-D3', fingerprint: 'd3' }], '2026-11-16T00:00:00.000Z')
    // 11 giờ sau, nghỉ Daily 12 giờ: còn giữ dù TTL Full chỉ 3 giờ.
    expect(purgeAiCache(Date.parse('2026-11-16T11:00:00.000Z'), 3 * HOUR, 24 * HOUR, 12 * HOUR)).toBe(0)
    expect(getDailyCheckEntries().has('PRJ-D3')).toBe(true)
    // 13 giờ sau: quá 12 giờ, bị dọn.
    expect(purgeAiCache(Date.parse('2026-11-16T13:00:00.000Z'), 3 * HOUR, 24 * HOUR, 12 * HOUR)).toBeGreaterThan(0)
    expect(getDailyCheckEntries().has('PRJ-D3')).toBe(false)
  })

  it('entry Daily của dự án đã xóa cũng bị dọn', () => {
    markDailyChecked([{ projectId: 'PRJ-GONE', fingerprint: 'x' }], '2026-11-16T12:00:00.000Z')
    expect(purgeAiCache(Date.parse('2026-11-16T12:30:00.000Z'), 3 * HOUR, 24 * HOUR, 12 * HOUR)).toBeGreaterThan(0)
    expect(getDailyCheckEntries().has('PRJ-GONE')).toBe(false)
  })
})
