import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FailoverCandidate } from '../src/main/ai/failoverClient'

const { buildTaskChain, createFailoverClient, runAgent, runAiTask, listProjects, saveScanLatest, purgeAiCache } =
  vi.hoisted(() => ({
    buildTaskChain: vi.fn(),
    createFailoverClient: vi.fn(),
    runAgent: vi.fn(),
    runAiTask: vi.fn(),
    listProjects: vi.fn(),
    saveScanLatest: vi.fn(),
    purgeAiCache: vi.fn()
  }))

vi.mock('electron', () => ({ app: { getPath: () => process.cwd() } }))
vi.mock('../src/main/services/settingsStore', () => ({
  getSettings: () => ({ ai: { newsCacheTtlMs: 60_000 } })
}))
vi.mock('../src/main/ai/providerService', () => ({ buildTaskChain }))
vi.mock('../src/main/ai/failoverClient', () => ({ createFailoverClient }))
vi.mock('../src/main/ai/agentRunner', () => ({
  runAgent,
  haltWithSubmit: vi.fn(),
  haltWithPendingAction: vi.fn(),
  haltWithChoice: vi.fn()
}))
vi.mock('../src/main/ai/aiTaskRunner', () => ({ runAiTask }))
vi.mock('../src/main/ai/aiMode', () => ({ assertAiEnabled: vi.fn() }))
vi.mock('../src/main/services/webSearchService', () => ({ loadSearchProvider: () => null }))
vi.mock('../src/main/ipc/guard', () => ({ broadcastToRenderers: vi.fn() }))
vi.mock('../src/main/db/projectsRepo', () => ({
  listProjects,
  findProjectByDomainKey: () => null,
  findProjectByNameKey: () => null,
  listProjectIndex: () => [],
  getProject: () => null
}))
vi.mock('../src/main/db/newsRepo', () => ({ listNews: () => [], setLastNewsCheckedAt: vi.fn() }))
vi.mock('../src/main/db/scanRepo', () => ({ saveScanLatest, getScanLatest: () => null }))
vi.mock('../src/main/db/aiCacheRepo', () => ({
  getNewsCheckEntries: () => new Map(),
  markNewsChecked: vi.fn(),
  purgeAiCache,
  getScanCacheEntries: () => new Map(),
  putScanCacheEntries: vi.fn()
}))
vi.mock('../src/main/services/newsService', () => ({ saveNewsBatch: () => ({ added: 0, rejected: 0 }) }))
vi.mock('../src/main/services/projectService', () => ({
  addProjects: () => [],
  getProject: () => null,
  setProjectLogo: vi.fn()
}))
vi.mock('../src/main/services/logoService', () => ({ fetchLogoForProject: vi.fn() }))
vi.mock('../src/main/services/logger', () => ({ logError: vi.fn(), logInfo: vi.fn() }))

import { runCheckNews } from '../src/main/ai/checkNewsService'
import { runScan } from '../src/main/ai/scanService'
import type { TaskChain } from '../src/main/ai/providerService'
import type { Project } from '../src/shared/types'

const project: Project = {
  id: 'PRJ-001',
  category: 'airdrop',
  name: 'Alpha Drop',
  nameKey: 'alpha drop',
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
  rowVersion: 1,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z'
}

function candidate(providerId: string, modelId: string): FailoverCandidate & { providerId: string; modelId: string } {
  return {
    providerId,
    modelId,
    label: `${providerId} · ${modelId}`,
    providerType: 'openai',
    supportsTools: true,
    supportsWebSearch: true,
    createClient: () => ({ complete: vi.fn() })
  }
}

function chain(providerId: string, modelId: string): TaskChain {
  return {
    candidates: [candidate(providerId, modelId)],
    providerType: 'openai',
    nativeSearch: true,
    skipped: []
  }
}

const newsChain = chain('p-news', 'm-news')
const scanChain = chain('p-scan', 'm-scan')

beforeEach(() => {
  vi.clearAllMocks()
  buildTaskChain.mockImplementation((task: 'news' | 'scan' | 'chat') => {
    if (task === 'news') {
      return newsChain
    }
    if (task === 'scan') {
      return scanChain
    }
    return chain('p-chat', 'm-chat')
  })
  createFailoverClient.mockReturnValue({
    complete: vi.fn(async () => ({ text: '', toolCalls: [], usage: null }))
  })
  runAiTask.mockImplementation(async (_label: string, _task: string, fn: Function) =>
    fn({ aborted: false }, { report: vi.fn() })
  )
  runAgent.mockResolvedValue({ outcome: 'completed', text: '', messages: [], webSearch: [] })
  listProjects.mockReturnValue([project])
})

describe('nối chuỗi model theo từng tác vụ (FIX 2)', () => {
  it('Check News dựng chuỗi "news" (cần tool calling + Web Search của app) và chạy qua failover', async () => {
    await runCheckNews()

    expect(buildTaskChain).toHaveBeenCalledWith('news', { requireTools: true, webSearch: 'native-or-app' }, false)
    expect(createFailoverClient).toHaveBeenCalledWith(newsChain.candidates, expect.any(Object))
  })

  it('Scan Project dựng chuỗi "scan" (bắt buộc Web Search gốc) và chạy qua failover', async () => {
    await runScan({ text: 'Alpha Drop\nBeta Drop' })

    expect(buildTaskChain).toHaveBeenCalledWith('scan', { requireTools: true, webSearch: 'native' })
    expect(createFailoverClient).toHaveBeenCalledWith(scanChain.candidates, expect.any(Object))
    expect(saveScanLatest).toHaveBeenCalled()
  })

  it('News và Scan dùng đúng chuỗi của mình, không lẫn model', async () => {
    await runCheckNews()
    await runScan({ text: 'Alpha Drop' })

    const passed = createFailoverClient.mock.calls.map((call) => call[0])
    expect(passed).toContainEqual(newsChain.candidates)
    expect(passed).toContainEqual(scanChain.candidates)
  })

  it('TTL cache News lấy từ settings (1 phút) chứ không dùng hằng số 12 giờ', async () => {
    await runCheckNews()

    expect(purgeAiCache).toHaveBeenCalledWith(expect.any(Number), 60_000, expect.any(Number))
  })
})
