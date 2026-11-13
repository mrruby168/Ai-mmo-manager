import { describe, expect, it, vi } from 'vitest'
import { parseNewsSubmission, verifyNewsSources } from '../src/main/ai/newsCheck'
import type { VerifiedNewsItem } from '../src/main/ai/newsCheck'
import { X_EPOCH_MS } from '../src/shared/xLinks'

const RECENT_MS = Date.now() - 86_400_000
const RECENT_ID = ((BigInt(RECENT_MS - X_EPOCH_MS) << 22n) | 1n).toString()
const RECENT_ISO = new Date(RECENT_MS).toISOString()

function xItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId: 'PRJ-001',
    kind: 'important',
    summary: 'Dự án mở snapshot',
    verification: 'verified',
    sourceUrl: `https://x.com/Alpha/status/${RECENT_ID}`,
    publishedAt: RECENT_ISO,
    ...overrides
  }
}

function parse(items: unknown[], handles?: Map<string, string | null>) {
  return parseNewsSubmission(items, new Set(['PRJ-001']), () => true, handles)
}

const verifiedItem: VerifiedNewsItem = {
  projectId: 'PRJ-001',
  kind: 'important',
  summary: 'Tin X',
  verification: 'verified',
  sourceUrl: `https://x.com/Alpha/status/${RECENT_ID}`,
  sourceName: 'Alpha',
  publishedAt: RECENT_ISO,
  todoDeadline: null,
  milestoneKind: null,
  milestoneDate: null
}

describe('ngày đăng bài X (9c)', () => {
  it('bài X thiếu publishedAt được suy từ status ID', () => {
    const { items, rejected } = parse([xItem({ publishedAt: undefined })])
    expect(rejected).toBe(0)
    expect(items).toHaveLength(1)
    expect(items[0].publishedAt).toBe(RECENT_ISO)
  })

  it('model lệch hơn 1 ngày thì dùng ngày suy từ ID', () => {
    const wrong = new Date(RECENT_MS - 5 * 86_400_000).toISOString()
    const { items } = parse([xItem({ publishedAt: wrong })])
    expect(items[0].publishedAt).toBe(RECENT_ISO)
  })

  it('model lệch dưới 1 ngày thì giữ ngày model đọc được', () => {
    const close = new Date(RECENT_MS - 3_600_000).toISOString()
    const { items } = parse([xItem({ publishedAt: close })])
    expect(items[0].publishedAt).toBe(close)
  })

  it('bài X luôn unverified dù model khai verified', () => {
    const { items } = parse([xItem()])
    expect(items[0].verification).toBe('unverified')
  })

  it('bài không phải X mà thiếu publishedAt thì bị loại', () => {
    const { items, rejected } = parse([
      xItem({ sourceUrl: 'https://alpha.example.com/news', publishedAt: undefined })
    ])
    expect(items).toHaveLength(0)
    expect(rejected).toBe(1)
  })
})

describe('handle X của dự án (9c)', () => {
  it('loại bài X của tài khoản khác với handle dự án', () => {
    const { items, rejected } = parse([xItem()], new Map([['PRJ-001', 'Beta']]))
    expect(items).toHaveLength(0)
    expect(rejected).toBe(1)
  })

  it('nhận bài đúng handle, không phân biệt hoa/thường', () => {
    const { items } = parse([xItem()], new Map([['PRJ-001', 'alpha']]))
    expect(items).toHaveLength(1)
  })

  it('dự án chưa có handle X vẫn nhận bài X (đánh dấu unverified)', () => {
    const { items } = parse([xItem()], new Map([['PRJ-001', null]]))
    expect(items).toHaveLength(1)
    expect(items[0].verification).toBe('unverified')
  })
})

describe('verifyNewsSources với bài X', () => {
  it('không gọi fetch, giữ tin ở trạng thái unverified', async () => {
    const fetcher = vi.fn(async () => ({ status: 200, text: 'Alpha' }))
    const result = await verifyNewsSources([verifiedItem], new Map([['PRJ-001', 'Alpha']]), fetcher)
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.rejected).toBe(0)
    expect(result.unverified).toBe(1)
    expect(result.items[0].verification).toBe('unverified')
  })
})
