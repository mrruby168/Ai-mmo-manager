import { afterAll, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase, withTransaction } from '../src/main/db/connection'
import { allocateProjectId, deleteProject, getProject, insertProject, listProjects, updateProject } from '../src/main/db/projectsRepo'
import type { ProjectRecord } from '../src/main/db/projectsRepo'
import { deleteRevenue, insertRevenue, listRevenue } from '../src/main/db/revenueRepo'
import { getLastNewsFetchAt, insertNews, listNews, setLastNewsCheckedAt, toggleNewsTodo } from '../src/main/db/newsRepo'
import { getScanLatest, saveScanLatest } from '../src/main/db/scanRepo'

openDatabase(':memory:')

afterAll(() => {
  closeDatabase()
})

function buildProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'PRJ-001',
    category: 'airdrop',
    name: 'Demo Project',
    nameKey: 'demo project',
    domainKey: 'example.com',
    website: 'https://example.com',
    socials: { x: 'https://x.com/demo' },
    taskSummary: 'Nhiệm vụ A',
    howToJoin: 'Tham gia B',
    startDate: '2026-11-01',
    endDate: '2026-11-10',
    costType: 'free',
    costAmountUsd: null,
    status: 'not_joined',
    verification: 'unverified',
    sources: [],
    logoPath: null,
    notes: '',
    origin: 'manual',
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
    ...overrides
  }
}

describe('projects repo', () => {
  it('allocates sequential ids inside a transaction', () => {
    const first = withTransaction(() => allocateProjectId())
    const second = withTransaction(() => allocateProjectId())
    expect(first).toBe('PRJ-001')
    expect(second).toBe('PRJ-002')
  })

  it('inserts, reads and updates with optimistic row versions', () => {
    insertProject(buildProject({ id: 'PRJ-101', nameKey: 'demo 101' }))

    const loaded = getProject('PRJ-101')
    expect(loaded?.name).toBe('Demo Project')
    expect(loaded?.socials.x).toBe('https://x.com/demo')
    expect(listProjects('airdrop').some((project) => project.id === 'PRJ-101')).toBe(true)

    const updated = updateProject(
      'PRJ-101',
      {
        category: 'airdrop',
        name: 'Demo Renamed',
        nameKey: 'demo renamed',
        domainKey: 'example.com',
        website: 'https://example.com',
        socials: {},
        taskSummary: 'Nhiệm vụ A',
        howToJoin: 'Tham gia B',
        startDate: '2026-11-01',
        endDate: '2026-11-10',
        costType: 'free',
        costAmountUsd: null,
        status: 'in_progress',
        verification: 'unverified',
        sources: [],
        notes: 'ghi chú',
        updatedAt: '2026-11-05T01:00:00.000Z'
      },
      1
    )

    expect(updated).toBe(true)
    expect(getProject('PRJ-101')?.rowVersion).toBe(2)
    expect(
      updateProject(
        'PRJ-101',
        {
          category: 'airdrop',
          name: 'Stale',
          nameKey: 'stale',
          domainKey: null,
          website: null,
          socials: {},
          taskSummary: '',
          howToJoin: '',
          startDate: null,
          endDate: null,
          costType: 'unverified',
          costAmountUsd: null,
          status: 'not_joined',
          verification: 'unverified',
          sources: [],
          notes: '',
          updatedAt: '2026-11-05T02:00:00.000Z'
        },
        1
      )
    ).toBe(false)
  })
})

describe('revenue and news repos', () => {
  it('keeps revenue snapshots when the project is deleted', () => {
    insertProject(buildProject({ id: 'PRJ-201', nameKey: 'demo 201' }))
    const revenueId = insertRevenue({
      projectId: 'PRJ-201',
      projectNameSnapshot: 'Demo Project',
      rewardKind: 'cash',
      rewardSymbol: 'USD',
      estimatedAmount: null,
      estimatedUsd: null,
      receivedAmount: 10,
      receivedUsd: 10,
      receivedAt: '2026-11-05',
      claimStatus: 'claimed',
      participationCostUsd: 0,
      txFeeUsd: 0,
      txHash: null,
      evidenceNote: null,
      evidenceFile: null,
      note: '',
      createdAt: '2026-11-05T00:00:00.000Z',
      updatedAt: '2026-11-05T00:00:00.000Z'
    })

    expect(deleteProject('PRJ-201')).toBe(true)
    const [entry] = listRevenue()
    expect(entry?.id).toBe(revenueId)
    expect(entry?.projectId).toBeNull()
    expect(deleteRevenue(revenueId)).toBe(true)
  })

  it('deduplicates news and toggles todo state', () => {
    insertProject(buildProject({ id: 'PRJ-301', nameKey: 'demo 301' }))
    const record = {
      projectId: 'PRJ-301',
      kind: 'todo' as const,
      summary: 'Làm nhiệm vụ',
      verification: 'unverified' as const,
      sourceUrl: 'https://example.com/post',
      sourceName: 'Example',
      publishedAt: '2026-11-05T08:00:00.000Z',
      fetchedAt: '2026-11-05T08:05:00.000Z',
      todoDeadline: '2026-11-07',
      dedupeHash: 'hash-1',
      milestoneKind: 'snapshot' as const,
      milestoneDate: '2026-11-10'
    }

    expect(insertNews(record)).toBe(true)
    expect(insertNews(record)).toBe(false)

    const [item] = listNews('todo')
    expect(item?.isDone).toBe(false)
    expect(item?.milestoneKind).toBe('snapshot')
    expect(item?.milestoneDate).toBe('2026-11-10')
    expect(toggleNewsTodo(item!.id, true)).toBe(true)
    expect(listNews('todo')[0]?.isDone).toBe(true)
  })

  it('keeps the last checked timestamp even when no news was added', () => {
    expect(getLastNewsFetchAt()).toBe('2026-11-05T08:05:00.000Z')

    setLastNewsCheckedAt('2026-11-07T01:00:00.000Z')
    setLastNewsCheckedAt('2026-11-07T02:00:00.000Z')

    expect(getLastNewsFetchAt()).toBe('2026-11-07T02:00:00.000Z')
  })
})

describe('scan repo', () => {
  it('stores the latest scan result in a single row', () => {
    saveScanLatest(
      [
        {
          name: 'Demo',
          category: 'airdrop',
          website: null,
          summary: '',
          taskSummary: '',
          howToJoin: '',
          startDate: null,
          endDate: null,
          costType: 'unverified',
          costAmountUsd: null,
          riskLevel: 'unknown',
          riskReason: null,
          potential: null,
          verification: 'unverified',
          sources: [],
          duplicateOf: null
        }
      ],
      '2026-11-05T00:00:00.000Z'
    )

    expect(getScanLatest()?.items).toHaveLength(1)
  })
})
