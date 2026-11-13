import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FailoverCandidate } from '../src/main/ai/failoverClient'

const { buildTaskChain, createFailoverClient, runAgent, runAiTask, listProjects, saveScanLatest, purgeAiCache, loadSearchProvider } =
  vi.hoisted(() => ({
    buildTaskChain: vi.fn(),
    createFailoverClient: vi.fn(),
    runAgent: vi.fn(),
    runAiTask: vi.fn(),
    listProjects: vi.fn(),
    saveScanLatest: vi.fn(),
    purgeAiCache: vi.fn(),
    loadSearchProvider: vi.fn()
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
vi.mock('../src/main/services/webSearchService', () => ({ loadSearchProvider }))
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
  loadSearchProvider.mockReturnValue(null)
})

describe('nối chuỗi model theo từng tác vụ (FIX 2)', () => {
  it('Check News dựng chuỗi "news" (cần tool calling + Web Search của app) và chạy qua failover', async () => {
    await runCheckNews()

    expect(buildTaskChain).toHaveBeenCalledWith('news', { requireTools: true, webSearch: 'native-or-app' }, false)
    expect(createFailoverClient).toHaveBeenCalledWith(newsChain.candidates, expect.any(Object))
  })

  it('D25: có Web Search của app thì prefetch chạy cả khi model có Web Search gốc', async () => {
    const search = vi.fn(async (_query: string) => [
      { title: 'Alpha Drop news', url: 'https://alpha.example.com/news', snippet: 'airdrop snapshot' }
    ])
    loadSearchProvider.mockReturnValue({ search } as never)

    await runCheckNews()

    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0]).toContain('Alpha Drop')
  })

  it('9b: prefetch yếu (không khớp tên) thì tìm riêng từng dự án một lần nữa', async () => {
    const beta = {
      ...project,
      id: 'PRJ-002',
      name: 'Beta Net',
      nameKey: 'beta net',
      website: 'https://beta.example.com',
      domainKey: 'beta.example.com'
    }
    listProjects.mockReturnValue([project, beta])
    const search = vi.fn(async (_query: string) => [
      { title: 'Tin không liên quan', url: 'https://example.com/other', snippet: 'khác' }
    ])
    loadSearchProvider.mockReturnValue({ search } as never)

    await runCheckNews()

    expect(search).toHaveBeenCalledTimes(3)
    expect(search.mock.calls[0][0]).toContain('Alpha Drop')
    expect(search.mock.calls[0][0]).toContain('Beta Net')
    expect(search.mock.calls[0][0]).toContain(' OR ')
    expect(search.mock.calls[1][0]).toContain('"Alpha Drop"')
    expect(search.mock.calls[2][0]).toContain('"Beta Net"')
  })

  it('9d: nộp rỗng dù có bằng chứng thì thử lại một lần', async () => {
    const search = vi.fn(async (_query: string) => [
      { title: 'Alpha Drop news', url: 'https://alpha.example.com/news', snippet: 'airdrop' }
    ])
    loadSearchProvider.mockReturnValue({ search } as never)
    runAgent.mockResolvedValue({
      outcome: 'submit',
      payload: { kind: 'news', data: { items: [], notes: 'đã tìm' } },
      messages: [],
      webSearch: []
    })

    await runCheckNews()

    expect(runAgent).toHaveBeenCalledTimes(2)
    const retryRequest = runAgent.mock.calls[1][0] as { messages: Array<{ content: string }> }
    const last = retryRequest.messages[retryRequest.messages.length - 1]
    expect(last.content).toContain('nộp items rỗng')
  })

  it('9d: không thử lại khi lô không có bằng chứng tìm kiếm', async () => {
    loadSearchProvider.mockReturnValue(null)
    runAgent.mockResolvedValue({
      outcome: 'submit',
      payload: { kind: 'news', data: { items: [], notes: '' } },
      messages: [],
      webSearch: []
    })

    await runCheckNews()

    expect(runAgent).toHaveBeenCalledTimes(1)
  })

  it('Scan Project dựng chuỗi "scan" (tool calling + Web Search gốc hoặc Web Search của app) và chạy qua failover', async () => {
    await runScan({ text: 'Alpha Drop\nBeta Drop' })

    expect(buildTaskChain).toHaveBeenCalledWith('scan', { requireTools: true, webSearch: 'native-or-app' }, false)
    expect(createFailoverClient).toHaveBeenCalledWith(scanChain.candidates, expect.any(Object))
    expect(saveScanLatest).toHaveBeenCalled()
  })

  it('Scan với model thiếu Web Search gốc + App Search đã cấu hình: pre-flight, enableWebSearch=false, đăng ký web_search', async () => {
    const search = vi.fn(async (_query: string) => [
      { title: 'Alpha Drop', url: 'https://alpha.example.com', snippet: 'airdrop' }
    ])
    loadSearchProvider.mockReturnValue({ search } as never)
    const nonNativeScanChain: TaskChain = {
      ...scanChain,
      candidates: scanChain.candidates.map((entry) => ({ ...entry, supportsWebSearch: false })),
      nativeSearch: false
    }
    buildTaskChain.mockImplementation((task: 'news' | 'scan' | 'chat') => {
      if (task === 'scan') {
        return nonNativeScanChain
      }
      if (task === 'news') {
        return newsChain
      }
      return chain('p-chat', 'm-chat')
    })

    await runScan({ text: 'Alpha Drop\nBeta Drop' })

    expect(buildTaskChain).toHaveBeenCalledWith('scan', { requireTools: true, webSearch: 'native-or-app' }, true)
    expect(search).toHaveBeenCalledTimes(1) // pre-flight đúng một truy vấn
    const request = runAgent.mock.calls[0][0] as { enableWebSearch: boolean; tools: Array<{ name: string }> }
    expect(request.enableWebSearch).toBe(false)
    expect(request.tools.map((tool) => tool.name)).toEqual([
      'web_fetch',
      'web_search',
      'list_existing_projects',
      'submit_scan_result'
    ])
  })

  it('App Search đã cấu hình nhưng kết nối thất bại: Scan báo lỗi rõ, không gọi model', async () => {
    const search = vi.fn(async () => {
      throw new Error('HTTP 502')
    })
    loadSearchProvider.mockReturnValue({ search } as never)
    const nonNativeScanChain: TaskChain = {
      ...scanChain,
      candidates: scanChain.candidates.map((entry) => ({ ...entry, supportsWebSearch: false })),
      nativeSearch: false
    }
    buildTaskChain.mockImplementation((task: 'news' | 'scan' | 'chat') => {
      if (task === 'scan') {
        return nonNativeScanChain
      }
      if (task === 'news') {
        return newsChain
      }
      return chain('p-chat', 'm-chat')
    })

    await expect(runScan({ text: 'Alpha Drop' })).rejects.toThrow(
      'Web Search của app đã cấu hình nhưng không kết nối được'
    )
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('Scan khi model có Web Search gốc VÀ App Search đã cấu hình: không chạy pre-flight app search, web_search chỉ là dự phòng', async () => {
    const search = vi.fn(async (_query: string) => [
      { title: 'Alpha Drop', url: 'https://alpha.example.com', snippet: 'airdrop' }
    ])
    loadSearchProvider.mockReturnValue({ search } as never)

    await runScan({ text: 'Alpha Drop' })

    expect(search).not.toHaveBeenCalled()
    const request = runAgent.mock.calls[0][0] as { enableWebSearch: boolean; tools: Array<{ name: string }> }
    expect(request.enableWebSearch).toBe(true)
    expect(request.tools.map((tool) => tool.name)).toContain('web_search')
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
