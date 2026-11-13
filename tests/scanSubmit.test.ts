import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScanItem } from '../src/shared/types'

const { getScanLatest, addProjects, getProject, fetchLogoForProject, scanLatest } = vi.hoisted(() => ({
  getScanLatest: vi.fn(),
  addProjects: vi.fn(),
  getProject: vi.fn(),
  fetchLogoForProject: vi.fn(),
  scanLatest: { current: null as null | { items: ScanItem[]; createdAt: string } }
}))

vi.mock('electron', () => ({ app: { getPath: () => process.cwd() } }))
vi.mock('../src/main/services/settingsStore', () => ({
  getSettings: () => ({ ai: { newsCacheTtlMs: 60_000 } })
}))
vi.mock('../src/main/ai/providerService', () => ({
  buildTaskChain: vi.fn(() => ({ candidates: [], providerType: 'openai', nativeSearch: false, skipped: [] }))
}))
vi.mock('../src/main/ai/failoverClient', () => ({ createFailoverClient: vi.fn() }))
vi.mock('../src/main/ai/agentRunner', () => ({
  runAgent: vi.fn(),
  AgentStepLimitError: class AgentStepLimitError extends Error {},
  haltWithSubmit: vi.fn(),
  haltWithPendingAction: vi.fn(),
  haltWithChoice: vi.fn()
}))
vi.mock('../src/main/ai/aiTaskRunner', () => ({
  runAiTask: vi.fn(async (_label: string, _task: string, fn: Function) =>
    fn({ aborted: false }, { report: vi.fn() })
  )
}))
vi.mock('../src/main/ai/aiMode', () => ({ assertAiEnabled: vi.fn() }))
vi.mock('../src/main/ai/aiActivityLog', () => ({
  appendAiLog: vi.fn(),
  beginAiLog: vi.fn(),
  finishAiLog: vi.fn(),
  setAiLogProgress: vi.fn()
}))
vi.mock('../src/main/services/webSearchService', () => ({ loadSearchProvider: () => null }))
vi.mock('../src/main/services/logger', () => ({ logError: vi.fn(), logInfo: vi.fn() }))
vi.mock('../src/main/db/projectsRepo', () => ({
  listProjects: () => [],
  findProjectByDomainKey: () => null,
  findProjectByNameKey: () => null,
  listProjectIndex: () => [],
  getProject
}))
vi.mock('../src/main/db/scanRepo', () => ({ saveScanLatest: vi.fn(), getScanLatest: () => scanLatest.current }))
vi.mock('../src/main/db/aiCacheRepo', () => ({
  getScanCacheEntries: () => new Map(),
  putScanCacheEntries: vi.fn()
}))
vi.mock('../src/main/services/projectService', () => ({
  addProjects,
  getProject,
  setProjectLogo: vi.fn()
}))
vi.mock('../src/main/services/logoService', () => ({ fetchLogoForProject }))

import { submitScanSelection } from '../src/main/ai/scanService'

function item(overrides: Partial<ScanItem> = {}): ScanItem {
  return {
    name: 'Bullshot',
    category: 'insufficient',
    website: 'https://bullshot.example.com',
    summary: 'Chưa đủ bằng chứng về airdrop',
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
    duplicateOf: null,
    ...overrides
  }
}

function useLatest(...items: ScanItem[]): void {
  scanLatest.current = { items, createdAt: '2026-11-13T10:00:00.000Z' }
  getScanLatest.mockReturnValue(scanLatest.current)
}

beforeEach(() => {
  vi.clearAllMocks()
  scanLatest.current = null
  getProject.mockReturnValue(null)
  fetchLogoForProject.mockResolvedValue(null)
  addProjects.mockImplementation((items: Array<{ name: string }>) =>
    items.map((entry, index) => ({
      name: entry.name,
      project: { id: `PRJ-NEW-${index}`, name: entry.name },
      duplicateOf: null,
      warning: null,
      error: null
    }))
  )
})

describe('submitScanSelection cho phép thêm dự án chưa xác minh', () => {
  it('dự án "insufficient" không trùng, được chọn loại Event MMO, thêm được và giữ verification unverified', async () => {
    useLatest(item({ sources: ['https://bullshot.example.com/about'] }))

    const outcome = await submitScanSelection(['Bullshot'], { bullshot: 'event_mmo' })

    expect(addProjects).toHaveBeenCalledTimes(1)
    const sent = addProjects.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(sent).toHaveLength(1)
    expect(sent[0].category).toBe('event_mmo')
    expect(sent[0].verification).toBe('unverified')
    expect(sent[0].website).toBe('https://bullshot.example.com')
    expect(sent[0].sources).toEqual(['https://bullshot.example.com/about'])
    expect(outcome.addedCount).toBe(1)
    expect(outcome.results[0].error).toBeNull()
  })

  it('dự án "insufficient" không chọn loại → báo lỗi, không thêm, không crash', async () => {
    useLatest(item())

    const outcome = await submitScanSelection(['Bullshot'])

    expect(addProjects).not.toHaveBeenCalled()
    expect(outcome.addedCount).toBe(0)
    expect(outcome.failedCount).toBe(1)
    expect(outcome.results[0].error).toContain('Chưa chọn loại')
  })

  it('dự án trùng trong app bị khóa ở UI và bị chặn lại ở Main dù cố thêm', async () => {
    useLatest(item({ name: 'Celadon', category: 'airdrop', duplicateOf: 'PRJ-001' }))

    const outcome = await submitScanSelection(['Celadon'])

    expect(addProjects).not.toHaveBeenCalled()
    expect(outcome.duplicateCount).toBe(1)
    expect(outcome.results[0].duplicateOf).toBe('PRJ-001')
    expect(outcome.results[0].error).toBeNull()
  })

  it('chỉ thêm đúng các dự án được tick; dự án không được tick không vào danh sách', async () => {
    useLatest(
      item({ name: 'Bullshot', category: 'airdrop' }),
      item({ name: 'Gamma', category: 'airdrop', website: 'https://gamma.example.com' })
    )

    const outcome = await submitScanSelection(['Gamma'])

    expect(addProjects).toHaveBeenCalledTimes(1)
    expect(addProjects.mock.calls[0][0]).toHaveLength(1)
    expect(outcome.results.map((entry) => entry.name)).toEqual(['Gamma'])
  })

  it('dự án đã xác minh không cần categories và giữ nguyên loại', async () => {
    useLatest(item({ name: 'Gamma', category: 'airdrop', website: 'https://gamma.example.com' }))

    const outcome = await submitScanSelection(['Gamma'])

    expect(addProjects.mock.calls[0][0][0].category).toBe('airdrop')
    expect(outcome.addedCount).toBe(1)
  })

  it('tên không có trong kết quả scan gần nhất → báo lỗi rõ, không thêm', async () => {
    useLatest(item({ name: 'Bullshot' }))

    const outcome = await submitScanSelection(['Không Có'])

    expect(addProjects).not.toHaveBeenCalled()
    expect(outcome.failedCount).toBe(1)
    expect(outcome.results[0].error).toContain('Không tìm thấy trong kết quả scan gần nhất')
  })
})
