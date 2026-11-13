import { describe, expect, it } from 'vitest'
import { saveNewsBatch } from '../src/main/services/newsService'
import type { NewsBatchInput } from '../src/main/services/newsService'
import { closeDatabase, openDatabase } from '../src/main/db/connection'
import { insertProject } from '../src/main/db/projectsRepo'
import type { ProjectRecord } from '../src/main/db/projectsRepo'

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

  it('đếm tin trùng vào rejected và duplicates (9d)', () => {
    openDatabase(':memory:')
    try {
      const record: ProjectRecord = {
        id: 'PRJ-001',
        category: 'airdrop',
        name: 'Alpha',
        nameKey: 'alpha',
        domainKey: 'alpha.example.com',
        website: 'https://alpha.example.com',
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
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z'
      }
      insertProject(record)

      const first = saveNewsBatch([item()], '2026-11-06T09:00:00.000Z', isToday, new Set(['PRJ-001']))
      const second = saveNewsBatch([item()], '2026-11-06T09:00:00.000Z', isToday, new Set(['PRJ-001']))

      expect(first).toEqual({ added: 1, rejected: 0 })
      expect(second).toEqual({ added: 0, rejected: 1, duplicates: 1 })
    } finally {
      closeDatabase()
    }
  })
})
