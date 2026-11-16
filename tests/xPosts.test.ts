import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { X_EPOCH_MS } from '../src/shared/xLinks'
import {
  compareStatusIdDesc,
  isOwnStatusUrl,
  pickLatestPosts,
  startOfDayUtc7Ms
} from '../src/shared/xPosts'

// 2026-11-12T20:00:00Z = 03:00 ngày 13/11 (UTC+7)
const NOW = Date.parse('2026-11-12T20:00:00Z')

function statusId(ms: number): string {
  return String((BigInt(ms - X_EPOCH_MS) << 22n) + 5n)
}

function post(handle: string, ms: number) {
  return { title: 't', url: `https://x.com/${handle}/status/${statusId(ms)}`, snippet: 's', publishedAt: null }
}

describe('xPosts', () => {
  it('startOfDayUtc7Ms: 00:00 UTC+7 của hôm nay và 2 ngày trước', () => {
    expect(new Date(startOfDayUtc7Ms(NOW, 0)).toISOString()).toBe('2026-11-12T17:00:00.000Z')
    expect(new Date(startOfDayUtc7Ms(NOW, 2)).toISOString()).toBe('2026-11-10T17:00:00.000Z')
  })

  it('compareStatusIdDesc: ID dài hơn / lớn hơn là mới hơn, không dùng Number', () => {
    expect(compareStatusIdDesc('9', '10')).toBeGreaterThan(0)
    expect(compareStatusIdDesc('20', '10')).toBeLessThan(0)
    expect(compareStatusIdDesc('5', '5')).toBe(0)
    expect(compareStatusIdDesc('1900000000000000002', '1900000000000000001')).toBeLessThan(0)
  })

  it('isOwnStatusUrl: đúng handle (không phân biệt hoa thường), không nhận profile', () => {
    expect(isOwnStatusUrl('https://x.com/Alpha/status/123', 'alpha')).toBe(true)
    expect(isOwnStatusUrl('https://x.com/Alpha', 'alpha')).toBe(false)
    expect(isOwnStatusUrl('https://x.com/Beta/status/123', 'alpha')).toBe(false)
  })

  it('pickLatestPosts: chỉ bài của handle, trong ngày, bỏ trùng, mới nhất trước, tối đa limit', () => {
    const results = [
      post('Alpha', NOW - 3_600_000),
      post('alpha', NOW - 7_200_000),
      post('Alpha', NOW - 30 * 3_600_000), // quá cũ
      post('Other', NOW - 1_000), // sai tài khoản
      post('Alpha', NOW - 3_600_000), // trùng
      post('Alpha', NOW - 2 * 3_600_000)
    ]
    const picked = pickLatestPosts(results, 'alpha', startOfDayUtc7Ms(NOW, 0), 3)
    expect(picked.map((p) => p.postedAt)).toEqual(['2026-11-12T19:00:00.000Z', '2026-11-12T18:00:00.000Z'])
    expect(pickLatestPosts(results, 'alpha', startOfDayUtc7Ms(NOW, 0), 1)).toHaveLength(1)
  })

  it('pickLatestPosts: không có ngày thì bỏ, không đoán', () => {
    // Status ID 20 chữ số vượt 2^63-1 nên xDateFromStatusId() trả null (không suy được ngày).
    const noDate = [{ title: 't', url: 'https://x.com/alpha/status/99999999999999999999', snippet: '', publishedAt: null }]
    expect(pickLatestPosts(noDate, 'alpha', 0, 3)).toEqual([])
  })
})

describe('Daily đọc bài X (nối trong checkNewsService)', () => {
  const src = readFileSync(resolve(__dirname, '..', 'src', 'main', 'ai', 'checkNewsService.ts'), 'utf8').replace(/\r\n/g, '\n')

  it('có prefetchDailyXPosts, chỉ gọi ở Daily vòng 1', () => {
    expect(src).toContain('async function prefetchDailyXPosts(')
    expect(src).toContain("else if (profile.mode === 'daily')")
  })

  it('log nói thật về bài ghim, không giả vờ đã đọc', () => {
    expect(src).toContain('bài ghim: chưa đọc được')
  })

  it('giới hạn 3 bài và lọc bằng pickLatestPosts', () => {
    expect(src).toContain('const DAILY_X_POST_LIMIT = 3')
    expect(src).toContain('pickLatestPosts(list, handle, windowStartMs, DAILY_X_POST_LIMIT)')
  })
})
