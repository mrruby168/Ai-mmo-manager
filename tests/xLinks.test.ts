import { describe, expect, it } from 'vitest'
import {
  X_DATE_FROM_ID_ENABLED,
  X_EPOCH_MS,
  normalizeXHandle,
  parseXStatusUrl,
  xDateFromStatusId
} from '../src/shared/xLinks'

describe('cổng D23 — ngày đăng X từ status ID', () => {
  it('đang bật và tính đúng mốc kiểm chứng 2012-11-07T04:16:17.756Z', () => {
    expect(X_DATE_FROM_ID_ENABLED).toBe(true)
    expect(xDateFromStatusId('266031293945503744')).toBe('2012-11-07T04:16:17.756Z')
  })

  it('tính đúng ID tự tạo từ một mốc gần đây', () => {
    const ms = Date.now() - 86_400_000
    const id = ((BigInt(ms - X_EPOCH_MS) << 22n) | 1n).toString()
    expect(xDateFromStatusId(id)).toBe(new Date(ms).toISOString())
  })

  it('trả null với ID rác, ID 0, ID quá lớn hoặc không phải số', () => {
    expect(xDateFromStatusId('abc')).toBeNull()
    expect(xDateFromStatusId('0')).toBeNull()
    expect(xDateFromStatusId('999999999999999999999')).toBeNull()
    expect(xDateFromStatusId('')).toBeNull()
    expect(xDateFromStatusId(null)).toBeNull()
  })
})

describe('parseXStatusUrl', () => {
  it('nhận URL bài đăng x.com/twitter.com kèm query', () => {
    expect(parseXStatusUrl('https://x.com/Alpha_Drop/status/1234567890?s=20')).toEqual({
      handle: 'Alpha_Drop',
      statusId: '1234567890'
    })
    expect(parseXStatusUrl('https://twitter.com/Alpha/status/42')).toEqual({
      handle: 'Alpha',
      statusId: '42'
    })
    expect(parseXStatusUrl('https://mobile.twitter.com/Alpha/status/42')).toEqual({
      handle: 'Alpha',
      statusId: '42'
    })
  })

  it('từ chối profile, domain khác, URL hỏng và đường dẫn i/web', () => {
    expect(parseXStatusUrl('https://x.com/Alpha')).toBeNull()
    expect(parseXStatusUrl('https://example.com/Alpha/status/42')).toBeNull()
    expect(parseXStatusUrl('https://x.com/i/web/status/42')).toBeNull()
    expect(parseXStatusUrl('không phải url')).toBeNull()
    expect(parseXStatusUrl(null)).toBeNull()
  })
})

describe('normalizeXHandle', () => {
  it('nhận URL profile, URL bài đăng, @handle và handle trần', () => {
    expect(normalizeXHandle('https://x.com/Alpha_Drop')).toBe('Alpha_Drop')
    expect(normalizeXHandle('https://x.com/Alpha_Drop/status/42')).toBe('Alpha_Drop')
    expect(normalizeXHandle('@Alpha_Drop')).toBe('Alpha_Drop')
    expect(normalizeXHandle('Alpha_Drop')).toBe('Alpha_Drop')
  })

  it('từ chối domain khác và handle không hợp lệ', () => {
    expect(normalizeXHandle('https://example.com/Alpha')).toBeNull()
    expect(normalizeXHandle('@handle-quá-dài-1234567890')).toBeNull()
    expect(normalizeXHandle('   ')).toBeNull()
  })
})
