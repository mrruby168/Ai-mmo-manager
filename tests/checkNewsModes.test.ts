import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FailoverCandidate } from '../src/main/ai/failoverClient'

const {
  buildTaskChain,
  createFailoverClient,
  runAgent,
  runAiTask,
  listProjects,
  listNews,
  saveNewsBatch,
  loadSearchProvider,
  getNewsCheckEntries,
  getDailyCheckEntries,
  markNewsChecked,
  markDailyChecked,
  purgeAiCache,
  getSettings
} = vi.hoisted(() => ({
  buildTaskChain: vi.fn(),
  createFailoverClient: vi.fn(),
  runAgent: vi.fn(),
  runAiTask: vi.fn(),
  listProjects: vi.fn(),
  listNews: vi.fn(),
  saveNewsBatch: vi.fn(),
  loadSearchProvider: vi.fn(),
  getNewsCheckEntries: vi.fn(),
  getDailyCheckEntries: vi.fn(),
  markNewsChecked: vi.fn(),
  markDailyChecked: vi.fn(),
  purgeAiCache: vi.fn(),
  getSettings: vi.fn()
}))

vi.mock('electron', () => ({ app: { getPath: () => process.cwd() } }))
vi.mock('../src/main/services/settingsStore', () => ({ getSettings }))
vi.mock('../src/main/ai/providerService', () => ({ buildTaskChain }))
vi.mock('../src/main/ai/failoverClient', () => ({ createFailoverClient }))
vi.mock('../src/main/ai/agentRunner', () => ({
  runAgent,
  AgentStepLimitError: class AgentStepLimitError extends Error {},
  haltWithSubmit: vi.fn(),
  haltWithPendingAction: vi.fn(),
  haltWithChoice: vi.fn()
}))
vi.mock('../src/main/ai/aiTaskRunner', () => ({ runAiTask }))
vi.mock('../src/main/ai/aiMode', () => ({ assertAiEnabled: vi.fn() }))
vi.mock('../src/main/services/webSearchService', () => ({ loadSearchProvider }))
vi.mock('../src/main/ipc/guard', () => ({ broadcastToRenderers: vi.fn() }))
vi.mock('../src/main/db/projectsRepo', () => ({
  listProjects,
  findProjectByDomainKey: () => null,
  findProjectByNameKey: () => null,
  listProjectIndex: () => [],
  getProject: () => null
}))
vi.mock('../src/main/db/newsRepo', () => ({ listNews, setLastNewsCheckedAt: vi.fn() }))
vi.mock('../src/main/services/newsService', () => ({ saveNewsBatch }))
vi.mock('../src/main/db/aiCacheRepo', () => ({
  getNewsCheckEntries,
  getDailyCheckEntries,
  markNewsChecked,
  markDailyChecked,
  purgeAiCache
}))
vi.mock('../src/main/services/logger', () => ({ logInfo: vi.fn(), logError: vi.fn() }))
vi.mock('../src/main/ai/aiActivityLog', () => ({
  appendAiLog: vi.fn(),
  beginAiLog: vi.fn(),
  finishAiLog: vi.fn(),
  setAiLogProgress: vi.fn()
}))
vi.mock('../src/main/services/safeFetch', () => ({
  safeFetch: vi.fn(async () => ({ status: 200, text: 'Alpha airdrop deadline' })),
  SafeFetchError: class SafeFetchError extends Error {
    code = 'HTTP_ERROR'
  }
}))

import { runCheckNews } from '../src/main/ai/checkNewsService'
import type { TaskChain } from '../src/main/ai/providerService'
import type { SearchResultItem } from '../src/main/services/searchProviders'
import type { Project } from '../src/shared/types'

const HOUR = 3_600_000

function project(index: number): Project {
  return {
    id: `PRJ-${index}`,
    category: 'airdrop',
    name: `Alpha ${index}`,
    nameKey: `alpha ${index}`,
    domainKey: null,
    website: null,
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
    rowVersion: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z'
  }
}

const candidate: FailoverCandidate & { providerId: string; modelId: string } = {
  providerId: 'p-news',
  modelId: 'm-news',
  label: 'p-news · m-news',
  providerType: 'openai',
  supportsTools: true,
  supportsWebSearch: true,
  createClient: () => ({ complete: vi.fn() })
}

const chain: TaskChain = {
  candidates: [candidate],
  providerType: 'openai',
  nativeSearch: true,
  skipped: []
}

const DEFAULT_SETTINGS = {
  ai: { newsCacheTtlMs: 3 * HOUR },
  newsScan: { defaultMode: 'full' as const, dailyMinIntervalHours: 12 as const, dailyWindowDays: 3 as const }
}

/** Search giả: trả `results` (mặc định rỗng) nhưng vẫn ghi nhận bằng chứng và cửa sổ được truyền. */
function searchMock(results: SearchResultItem[] = []) {
  return vi.fn(async (_query: string, _options?: { recencyDays?: number }): Promise<SearchResultItem[]> => results)
}

beforeEach(() => {
  vi.clearAllMocks()
  buildTaskChain.mockReturnValue(chain)
  createFailoverClient.mockReturnValue({ complete: vi.fn() })
  runAiTask.mockImplementation(async (_label: string, _task: string, fn: Function) =>
    fn({ aborted: false }, { report: vi.fn() })
  )
  runAgent.mockResolvedValue({
    outcome: 'submit',
    payload: { kind: 'news', data: { items: [], notes: 'đã tìm' } },
    messages: [],
    webSearch: []
  })
  listProjects.mockReturnValue([project(1)])
  listNews.mockReturnValue([])
  saveNewsBatch.mockReturnValue({ added: 0, rejected: 0, duplicates: 0 })
  loadSearchProvider.mockReturnValue(null)
  getNewsCheckEntries.mockReturnValue(new Map())
  getDailyCheckEntries.mockReturnValue(new Map())
  getSettings.mockReturnValue(DEFAULT_SETTINGS)
})

describe('Check News modes (v0.1.4)', () => {
  it('Full mặc định: purge 3 tham số, không đụng cache Daily, 7 ngày / 16 bước', async () => {
    await runCheckNews()

    expect(purgeAiCache).toHaveBeenCalledTimes(1)
    expect(purgeAiCache.mock.calls[0]).toHaveLength(3)
    expect(getDailyCheckEntries).not.toHaveBeenCalled()
    expect(markDailyChecked).not.toHaveBeenCalled()
    expect(getNewsCheckEntries).toHaveBeenCalled()

    const request = runAgent.mock.calls[0][0] as { system: string; maxSteps: number }
    expect(request.maxSteps).toBe(24)
    expect(request.system).toContain('Chế độ Full')
    expect(request.system).toContain('7 ngày')
  })

  it('Daily: purge 4 tham số với khoảng nghỉ, đọc cache Daily, 3 ngày / 12 bước', async () => {
    getSettings.mockReturnValue({
      ai: { newsCacheTtlMs: 3 * HOUR },
      newsScan: { defaultMode: 'daily', dailyMinIntervalHours: 12, dailyWindowDays: 3 }
    })

    await runCheckNews()

    expect(purgeAiCache).toHaveBeenCalledTimes(1)
    const purgeArgs = purgeAiCache.mock.calls[0] as unknown[]
    expect(purgeArgs).toHaveLength(4)
    expect(purgeArgs[3]).toBe(12 * HOUR)
    expect(getDailyCheckEntries).toHaveBeenCalled()
    expect(getNewsCheckEntries).toHaveBeenCalled()

    const request = runAgent.mock.calls[0][0] as { system: string; maxSteps: number; messages: Array<{ content: string }> }
    expect(request.maxSteps).toBe(10)
    expect(request.system).toContain('Chế độ Daily')
    expect(request.system).toContain('3 ngày')
    expect(request.messages[0].content).toContain('3 ngày')
  })

  it('Daily dùng cửa sổ 2 ngày và cache newsd khi được chọn rõ', async () => {
    getSettings.mockReturnValue({
      ai: { newsCacheTtlMs: 3 * HOUR },
      newsScan: { defaultMode: 'full', dailyMinIntervalHours: 3, dailyWindowDays: 2 }
    })

    await runCheckNews({ mode: 'daily' })

    expect(purgeAiCache.mock.calls[0][3]).toBe(3 * HOUR)
    const request = runAgent.mock.calls[0][0] as { system: string; messages: Array<{ content: string }> }
    expect(request.system).toContain('2 ngày')
    expect(request.messages[0].content).toContain('2 ngày')
  })

  it('Daily ghi cache Daily, Full ghi cache Full', async () => {
    // Prefetch rỗng vẫn tính là bằng chứng tìm kiếm, nếu không lô bị bỏ và không ghi cache.
    loadSearchProvider.mockReturnValue({ provider: 'tavily', search: searchMock() })
    getSettings.mockReturnValue({
      ai: { newsCacheTtlMs: 3 * HOUR },
      newsScan: { defaultMode: 'daily', dailyMinIntervalHours: 12, dailyWindowDays: 3 }
    })

    await runCheckNews({ mode: 'daily' })
    expect(markDailyChecked).toHaveBeenCalled()
    expect(markNewsChecked).not.toHaveBeenCalled()

    vi.clearAllMocks()
    loadSearchProvider.mockReturnValue({ provider: 'tavily', search: searchMock() })
    getSettings.mockReturnValue(DEFAULT_SETTINGS)
    runAgent.mockResolvedValue({
      outcome: 'submit',
      payload: { kind: 'news', data: { items: [], notes: 'đã tìm' } },
      messages: [],
      webSearch: []
    })
    getNewsCheckEntries.mockReturnValue(new Map())
    saveNewsBatch.mockReturnValue({ added: 0, rejected: 0, duplicates: 0 })

    await runCheckNews({ mode: 'full' })
    expect(markNewsChecked).toHaveBeenCalled()
    expect(markDailyChecked).not.toHaveBeenCalled()
  })

  it('Daily truyền cửa sổ 2–3 ngày cho Web Search, Full dùng 7 ngày', async () => {
    getSettings.mockReturnValue({
      ai: { newsCacheTtlMs: 3 * HOUR },
      newsScan: { defaultMode: 'daily', dailyMinIntervalHours: 12, dailyWindowDays: 2 }
    })
    const dailySearch = searchMock()
    loadSearchProvider.mockReturnValue({ provider: 'tavily', search: dailySearch })

    await runCheckNews({ mode: 'daily' })
    expect(dailySearch).toHaveBeenCalled()
    for (const call of dailySearch.mock.calls) {
      expect(call[1]?.recencyDays).toBe(2)
    }

    vi.clearAllMocks()
    getSettings.mockReturnValue(DEFAULT_SETTINGS)
    runAgent.mockResolvedValue({
      outcome: 'submit',
      payload: { kind: 'news', data: { items: [], notes: 'đã tìm' } },
      messages: [],
      webSearch: []
    })
    getNewsCheckEntries.mockReturnValue(new Map())
    const fullSearch = searchMock()
    loadSearchProvider.mockReturnValue({ provider: 'tavily', search: fullSearch })

    await runCheckNews({ mode: 'full' })
    expect(fullSearch).toHaveBeenCalled()
    for (const call of fullSearch.mock.calls) {
      expect(call[1]?.recencyDays).toBe(7)
    }
  })

  it('Daily lọc toàn bộ todo AI nộp, đếm riêng và không lưu vào Full flow', async () => {
    const newsUrl = 'https://alpha.example.com/airdrop-2026'
    const search = searchMock([{ title: 'Jingle Alpha', url: newsUrl, snippet: 'airdrop season', publishedAt: null }])
    loadSearchProvider.mockReturnValue({ provider: 'tavily', search })
    getSettings.mockReturnValue({
      ai: { newsCacheTtlMs: 3 * HOUR },
      newsScan: { defaultMode: 'daily', dailyMinIntervalHours: 12, dailyWindowDays: 3 }
    })
    runAgent.mockResolvedValue({
      outcome: 'submit',
      payload: {
        kind: 'news',
        data: {
          items: [
            {
              projectId: 'PRJ-1',
              kind: 'todo',
              summary: 'Làm nhiệm vụ ngày "Lễ hội"',
              verification: 'verified',
              sourceUrl: newsUrl,
              sourceName: 'Alpha',
              publishedAt: new Date().toISOString(),
              todoDeadline: '2026-11-20',
              milestoneKind: null,
              milestoneDate: null
            }
          ],
          notes: ''
        }
      },
      messages: [],
      webSearch: []
    })
    saveNewsBatch.mockReturnValue({ added: 0, rejected: 0, duplicates: 0 })

    const result = await runCheckNews({ mode: 'daily' })

    expect(saveNewsBatch).toHaveBeenCalledTimes(1)
    const savedItems = saveNewsBatch.mock.calls[0][0] as Array<{ kind: string }>
    expect(savedItems).toHaveLength(0)
    expect(result.rejected).toBe(0)
    expect(result.message).toContain('việc cần làm')
  })

  it('Full Scan chạy vòng 2, Daily Scan không chạy vòng 2 dù có dự án trống', async () => {
    listProjects.mockReturnValue([1, 2, 3, 4, 5, 6].map(project))
    const search = searchMock()
    loadSearchProvider.mockReturnValue({ provider: 'tavily', search })

    await runCheckNews({ mode: 'daily' })

    expect(search.mock.calls.some((call) => String(call[0]).includes('season ends'))).toBe(false)
    expect(markDailyChecked).toHaveBeenCalled()
    expect(markNewsChecked).not.toHaveBeenCalled()
  })

  it('vòng 2 chỉ chạy khi có nhiều lô và dùng truy vấn sâu snapshot/TGE', async () => {
    listProjects.mockReturnValue([1, 2, 3, 4, 5, 6].map(project))
    const search = searchMock()
    loadSearchProvider.mockReturnValue({ provider: 'tavily', search })

    const result = await runCheckNews({ mode: 'full' })

    expect(search.mock.calls.some((call) => String(call[0]).includes('season ends'))).toBe(true)
    expect(result.message).toContain('vòng 2')
    // 2 lô vòng 1 + 2 lô vòng 2, mỗi lô có thể thử lại một lần.
    expect(runAgent.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  it('vòng 2 không chạy khi chỉ có một dự án', async () => {
    listProjects.mockReturnValue([project(1)])
    const search = searchMock()
    loadSearchProvider.mockReturnValue({ provider: 'tavily', search })

    await runCheckNews({ mode: 'full' })

    expect(search.mock.calls.some((call) => String(call[0]).includes('season ends'))).toBe(false)
  })
})
