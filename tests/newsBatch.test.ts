import { describe, expect, it } from 'vitest'
import { saveNewsBatch } from '../src/main/services/newsService'
import type { NewsBatchInput } from '../src/main/services/newsService'

const isToday = (iso: string): boolean => iso.startsWith('2026-11-06')

function item(overrides: Partial<NewsBatchInput> = {}): NewsBatchInput {
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

describe('saveNewsBatch batch guard', () => {
  it('rejects a projectId that was not part of the batch', () => {
    const result = saveNewsBatch([item({ projectId: 'PRJ-999' })], '2026-11-06T09:00:00.000Z', isToday, new Set(['PRJ-001']))

    expect(result).toEqual({ added: 0, rejected: 1 })
  })

  it('rejects news that is not from today before touching the database', () => {
    const result = saveNewsBatch(
      [item({ publishedAt: '2026-11-05T08:00:00.000Z' })],
      '2026-11-06T09:00:00.000Z',
      isToday,
      new Set(['PRJ-001'])
    )

    expect(result).toEqual({ added: 0, rejected: 1 })
  })
})
