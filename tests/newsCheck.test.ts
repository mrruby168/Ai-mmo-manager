import { describe, expect, it, vi } from 'vitest'
import {
  buildNewsCheckMessage,
  buildNewsRejectLogLine,
  createNewsRejectReasons,
  parseNewsSubmission,
  sanitizeLogLine,
  verifyNewsSources
} from '../src/main/ai/newsCheck'
import type { VerifiedNewsItem } from '../src/main/ai/newsCheck'
import { newsSubmissionResultSchema } from '../src/shared/schemas'
import { SafeFetchError } from '../src/main/services/safeFetch'

const isToday = (iso: string): boolean => iso.startsWith('2026-11-06')

function rawItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId: 'PRJ-001',
    kind: 'important',
    summary: 'Có tin mới',
    verification: 'verified',
    sourceUrl: 'https://alpha.example.com/news',
    sourceName: 'Alpha',
    publishedAt: '2026-11-06T08:00:00.000Z',
    todoDeadline: null,
    milestoneKind: null,
    milestoneDate: null,
    ...overrides
  }
}

function verifiedItem(overrides: Partial<VerifiedNewsItem> = {}): VerifiedNewsItem {
  return {
    projectId: 'PRJ-001',
    kind: 'important',
    summary: 'Có tin mới',
    verification: 'verified',
    sourceUrl: 'https://alpha.example.com/news',
    sourceName: 'Alpha',
    publishedAt: '2026-11-06T08:00:00.000Z',
    todoDeadline: null,
    milestoneKind: null,
    milestoneDate: null,
    ...overrides
  }
}

describe('parseNewsSubmission', () => {
  it('accepts an item whose projectId belongs to the batch', () => {
    const result = parseNewsSubmission([rawItem()], new Set(['PRJ-001']), isToday)

    expect(result.rejected).toBe(0)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].projectId).toBe('PRJ-001')
  })

  it('rejects a projectId outside the batch even if the project exists', () => {
    const result = parseNewsSubmission([rawItem({ projectId: 'PRJ-999' })], new Set(['PRJ-001']), isToday)

    expect(result.rejected).toBe(1)
    expect(result.items).toEqual([])
  })

  it('rejects wrong schema, non-http sources and news that is not from today', () => {
    const result = parseNewsSubmission(
      [
        rawItem({ summary: '' }),
        rawItem({ sourceUrl: 'ftp://alpha.example.com' }),
        rawItem({ publishedAt: '2026-11-05T08:00:00.000Z' })
      ],
      new Set(['PRJ-001']),
      isToday
    )

    expect(result.rejected).toBe(3)
    expect(result.items).toEqual([])
  })
})

describe('verifyNewsSources', () => {
  const names = new Map([['PRJ-001', 'Alpha Drop']])

  it('drops a 404 source', async () => {
    const fetcher = vi.fn(async () => {
      throw new SafeFetchError('HTTP_ERROR', 'Máy chủ trả về HTTP 404')
    })

    const result = await verifyNewsSources([verifiedItem()], names, fetcher)

    expect(result.rejected).toBe(1)
    expect(result.items).toEqual([])
  })

  it('drops a 410 source returned without throwing', async () => {
    const result = await verifyNewsSources([verifiedItem()], names, async () => ({ status: 410, text: 'gone' }))

    expect(result.rejected).toBe(1)
    expect(result.items).toEqual([])
  })

  it('keeps verification when the page mentions the project', async () => {
    const result = await verifyNewsSources([verifiedItem()], names, async () => ({
      status: 200,
      text: '<h1>Alpha Drop</h1><p>Thông báo mới</p>'
    }))

    expect(result.rejected).toBe(0)
    expect(result.unverified).toBe(0)
    expect(result.items[0].verification).toBe('verified')
  })

  it('downgrades to unverified when the page does not mention the project', async () => {
    const result = await verifyNewsSources([verifiedItem()], names, async () => ({
      status: 200,
      text: 'Một trang không liên quan'
    }))

    expect(result.items[0].verification).toBe('unverified')
    expect(result.unverified).toBe(1)
  })

  it('downgrades instead of dropping when the fetch fails (bot wall, timeout, X/Twitter)', async () => {
    const fetcher = vi.fn(async () => {
      throw new SafeFetchError('HTTP_ERROR', 'Máy chủ trả về HTTP 403')
    })

    const result = await verifyNewsSources([verifiedItem({ verification: 'verified' })], names, fetcher)

    expect(result.rejected).toBe(0)
    expect(result.unverified).toBe(1)
    expect(result.items[0].verification).toBe('unverified')
  })

  it('keeps verification when the page mentions both the milestone keyword and its date', async () => {
    const result = await verifyNewsSources(
      [verifiedItem({ milestoneKind: 'snapshot', milestoneDate: '2026-11-10' })],
      names,
      async () => ({ status: 200, text: 'Alpha Drop snapshot is on 10/11/2026 at 12:00 UTC' })
    )

    expect(result.unverified).toBe(0)
    expect(result.items[0].verification).toBe('verified')
  })

  it('downgrades when the page mentions the project but not the milestone keyword', async () => {
    const result = await verifyNewsSources(
      [verifiedItem({ milestoneKind: 'snapshot', milestoneDate: '2026-11-10' })],
      names,
      async () => ({ status: 200, text: 'Alpha Drop news on 2026-11-10' })
    )

    expect(result.unverified).toBe(1)
    expect(result.items[0].verification).toBe('unverified')
  })

  it('downgrades when the page mentions the milestone but a different date', async () => {
    const result = await verifyNewsSources(
      [verifiedItem({ milestoneKind: 'snapshot', milestoneDate: '2026-11-10' })],
      names,
      async () => ({ status: 200, text: 'Alpha Drop snapshot is on 2026-11-11' })
    )

    expect(result.unverified).toBe(1)
    expect(result.items[0].verification).toBe('unverified')
  })

  it('does not require milestone checks for news without a milestone', async () => {
    const result = await verifyNewsSources([verifiedItem()], names, async () => ({
      status: 200,
      text: 'Alpha Drop announces a new task'
    }))

    expect(result.unverified).toBe(0)
    expect(result.items[0].verification).toBe('verified')
  })
})

describe('lý do loại tin (9d)', () => {
  it('đếm đúng schema, sai dự án, thiếu ngày, sai handle X và ngoài cửa sổ', () => {
    const result = parseNewsSubmission(
      [
        rawItem({ summary: '' }),
        rawItem({ projectId: 'PRJ-999' }),
        rawItem({ sourceUrl: 'https://alpha.example.com/no-date', publishedAt: undefined }),
        rawItem({ sourceUrl: 'https://x.com/Beta/status/1234567890' }),
        rawItem({ publishedAt: '2026-11-05T08:00:00.000Z' })
      ],
      new Set(['PRJ-001']),
      isToday,
      new Map([['PRJ-001', 'Alpha']])
    )

    expect(result.rejected).toBe(5)
    expect(result.reasons).toEqual({
      schema: 1,
      outsideWindow: 1,
      wrongProject: 1,
      urlNotSeen: 0,
      source404: 0,
      xHandleMismatch: 1,
      noDate: 1,
      duplicate: 0,
      noEvidence: 0
    })
  })

  it('đếm nguồn 404 khi xác minh', async () => {
    const result = await verifyNewsSources([verifiedItem()], new Map([['PRJ-001', 'Alpha']]), async () => ({
      status: 404,
      text: ''
    }))
    expect(result.rejected).toBe(1)
    expect(result.reasons.source404).toBe(1)
  })

  it('hiển thị lý do trong thông báo tổng hợp', () => {
    const reasons = createNewsRejectReasons()
    reasons.schema = 2
    reasons.duplicate = 1
    const message = buildNewsCheckMessage({
      added: 0,
      rejected: 3,
      failedBatches: 0,
      totalBatches: 1,
      searchUnverifiedBatches: 0,
      reasons
    })
    expect(message).toContain('Đã thêm 0 tin, bỏ 3 tin')
    expect(message).toContain('Lý do bỏ: sai cấu trúc 2, trùng 1')
  })

  it('dòng Activity Log được làm sạch và cắt còn tối đa 200 ký tự', () => {
    const reasons = createNewsRejectReasons()
    reasons.schema = 500
    reasons.noEvidence = 200
    const line = buildNewsRejectLogLine(reasons)
    expect(line).not.toBeNull()
    expect(line!.length).toBeLessThanOrEqual(200)
    expect(line!).not.toContain('\n')
    expect(line!).toContain('sai cấu trúc 500')
    expect(sanitizeLogLine('a\nb\tc', 10)).toBe('a b c')
    expect(sanitizeLogLine('x'.repeat(300), 20)).toHaveLength(20)
    expect(buildNewsRejectLogLine(createNewsRejectReasons())).toBeNull()
  })

  it('submit_news cho phép thiếu publishedAt và notes tối đa 200 ký tự', () => {
    expect(newsSubmissionResultSchema.safeParse({ items: [], notes: 'đã tìm 3 từ khóa' }).success).toBe(true)
    expect(
      newsSubmissionResultSchema.safeParse({
        items: [],
        notes: 'x'.repeat(201)
      }).success
    ).toBe(false)
    expect(
      newsSubmissionResultSchema.safeParse({
        items: [rawItem({ publishedAt: undefined, notes: 'bài X' })]
      }).success
    ).toBe(true)
  })
})

describe('buildNewsCheckMessage', () => {
  it('never claims "no news" when some batches failed', () => {
    const message = buildNewsCheckMessage({
      added: 0,
      rejected: 0,
      failedBatches: 2,
      totalBatches: 3,
      searchUnverifiedBatches: 0
    })

    expect(message).not.toBe('Không có tin mới trong 7 ngày gần nhất')
    expect(message).toContain('2/3 lô AI không trả kết quả hợp lệ')
  })

  it('warns when no web search trace was detected', () => {
    const message = buildNewsCheckMessage({
      added: 1,
      rejected: 2,
      failedBatches: 0,
      totalBatches: 2,
      searchUnverifiedBatches: 2
    })

    expect(message).toContain('không có dấu vết tìm kiếm web')
  })

  it('reports batches dropped for missing evidence and the first failure reason', () => {
    const message = buildNewsCheckMessage({
      added: 0,
      rejected: 3,
      failedBatches: 1,
      totalBatches: 2,
      searchUnverifiedBatches: 0,
      noEvidenceBatches: 1,
      firstFailure: 'Lô 2: không có bằng chứng web search nên bỏ 3 tin AI tự khai'
    })

    expect(message).toContain('1/2 lô không có bằng chứng web search')
    expect(message).toContain('Lỗi đầu tiên: Lô 2')
  })

  it('reports no news only when every batch succeeded and nothing was found', () => {
    expect(
      buildNewsCheckMessage({
        added: 0,
        rejected: 0,
        failedBatches: 0,
        totalBatches: 2,
        searchUnverifiedBatches: 0
      })
    ).toBe('Không có tin mới trong 7 ngày gần nhất')
  })
})
