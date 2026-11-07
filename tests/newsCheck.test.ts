import { describe, expect, it, vi } from 'vitest'
import {
  buildNewsCheckMessage,
  parseNewsSubmission,
  verifyNewsSources
} from '../src/main/ai/newsCheck'
import type { VerifiedNewsItem } from '../src/main/ai/newsCheck'
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
