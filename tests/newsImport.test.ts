import { afterAll, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../src/main/db/connection'
import { insertProject } from '../src/main/db/projectsRepo'
import type { ProjectRecord } from '../src/main/db/projectsRepo'
import { insertNews } from '../src/main/db/newsRepo'
import { parseNewsImportText, previewNewsImport } from '../src/main/services/newsImportService'
import { newsDedupeHash } from '../src/main/services/newsService'

const now = new Date('2026-11-06T03:00:00.000Z') // 10:00 in Asia/Bangkok
const allowed = new Set(['PRJ-001'])

function rawItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId: 'PRJ-001',
    kind: 'important',
    summary: 'Có tin mới',
    verification: 'verified',
    sourceUrl: 'https://alpha.example.com/news',
    sourceName: 'Alpha',
    publishedAt: '2026-11-06T08:00:00+07:00',
    todoDeadline: null,
    ...overrides
  }
}

function fileWith(...items: Array<Record<string, unknown>>): string {
  return JSON.stringify({ items })
}

describe('parseNewsImportText', () => {
  it('accepts a valid file and strips the BOM', () => {
    const result = parseNewsImportText(`\uFEFF${fileWith(rawItem())}`, allowed, now)

    expect(result.total).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.rejections).toEqual([])
  })

  it('accepts an empty items array', () => {
    const result = parseNewsImportText('{"items": []}', allowed, now)

    expect(result.total).toBe(0)
    expect(result.items).toEqual([])
    expect(result.rejections).toEqual([])
  })

  it('rejects broken JSON', () => {
    expect(parseNewsImportText('not json', allowed, now).rejections[0].reason).toBe('invalid_json')
  })

  it('rejects a payload that does not match newsResultSchema', () => {
    const result = parseNewsImportText('{"items": [{"projectId": "PRJ-001"}]}', allowed, now)
    expect(result.rejections[0].reason).toBe('invalid_schema')
  })

  it('rejects only the item with a bad URL and keeps the valid one', () => {
    const result = parseNewsImportText(
      fileWith(rawItem({ sourceUrl: 'not-a-url' }), rawItem({ sourceUrl: 'https://alpha.example.com/ok' })),
      allowed,
      now
    )

    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(1)
    expect(result.rejections[0]).toMatchObject({ reason: 'invalid_schema', index: 0 })
  })

  it('rejects an unknown projectId', () => {
    const result = parseNewsImportText(fileWith(rawItem({ projectId: 'PRJ-999' })), allowed, now)
    expect(result.items).toEqual([])
    expect(result.rejections[0].reason).toBe('unknown_project')
  })

  it('rejects news older than the 7-day window', () => {
    const result = parseNewsImportText(fileWith(rawItem({ publishedAt: '2026-10-29T08:00:00+07:00' })), allowed, now)
    expect(result.rejections[0].reason).toBe('out_of_window')
  })

  it('rejects duplicates inside the same file', () => {
    const duplicate = rawItem({ summary: 'Bản sao' })
    const result = parseNewsImportText(fileWith(rawItem(), duplicate), allowed, now)

    expect(result.items).toHaveLength(1)
    expect(result.rejections).toHaveLength(1)
    expect(result.rejections[0].reason).toBe('duplicate')
  })
})

openDatabase(':memory:')

afterAll(() => {
  closeDatabase()
})

function buildProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'PRJ-001',
    category: 'airdrop',
    name: 'Alpha Drop',
    nameKey: 'alpha drop',
    domainKey: 'alpha.example.com',
    website: 'https://alpha.example.com',
    socials: { x: 'https://x.com/alpha' },
    taskSummary: '',
    howToJoin: '',
    startDate: null,
    endDate: null,
    costType: 'free',
    costAmountUsd: null,
    status: 'in_progress',
    verification: 'unverified',
    sources: [],
    logoPath: null,
    notes: '',
    origin: 'manual',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides
  }
}

describe('previewNewsImport', () => {
  it('marks a news row that already exists in the database as duplicate', () => {
    insertProject(buildProject())
    insertNews({
      projectId: 'PRJ-001',
      kind: 'important',
      summary: 'Tin cũ',
      verification: 'verified',
      sourceUrl: 'https://alpha.example.com/news',
      sourceName: 'Alpha',
      publishedAt: '2026-11-06T08:00:00+07:00',
      fetchedAt: '2026-11-06T09:00:00.000Z',
      todoDeadline: null,
      dedupeHash: newsDedupeHash('PRJ-001', 'https://alpha.example.com/news')
    })

    const preview = previewNewsImport(fileWith(rawItem()), now)

    expect(preview.total).toBe(1)
    expect(preview.items).toHaveLength(0)
    expect(preview.rejections.some((rejection) => rejection.reason === 'duplicate')).toBe(true)
  })

  it('keeps a new item and drops a stale one', () => {
    const preview = previewNewsImport(
      fileWith(
        rawItem({ sourceUrl: 'https://alpha.example.com/new' }),
        rawItem({ sourceUrl: 'https://alpha.example.com/old', publishedAt: '2026-10-01T08:00:00+07:00' })
      ),
      now
    )

    expect(preview.total).toBe(2)
    expect(preview.items).toHaveLength(1)
    expect(preview.rejections.some((rejection) => rejection.reason === 'out_of_window')).toBe(true)
  })
})
