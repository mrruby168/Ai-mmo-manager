import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getTaskModelMeta,
  getModelConnection,
  createModelClient,
  runAgent,
  runAiTask,
  listProjects,
  saveScanLatest
} = vi.hoisted(() => ({
  getTaskModelMeta: vi.fn(),
  getModelConnection: vi.fn(),
  createModelClient: vi.fn(),
  runAgent: vi.fn(),
  runAiTask: vi.fn(),
  listProjects: vi.fn(),
  saveScanLatest: vi.fn()
}))

vi.mock('electron', () => ({ app: { getPath: () => process.cwd() } }))
vi.mock('../src/main/ai/providerService', () => ({ getTaskModelMeta, getModelConnection }))
vi.mock('../src/main/ai/providers', () => ({ createModelClient }))
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

const newsMeta = {
  providerId: 'p-news',
  modelId: 'm-news',
  providerName: 'News Provider',
  modelLabel: 'News Model',
  supportsTools: true,
  supportsWebSearch: true
}

const scanMeta = {
  providerId: 'p-scan',
  modelId: 'm-scan',
  providerName: 'Scan Provider',
  modelLabel: 'Scan Model',
  supportsTools: true,
  supportsWebSearch: true
}

beforeEach(() => {
  vi.clearAllMocks()
  getTaskModelMeta.mockImplementation((task: 'news' | 'scan') => (task === 'news' ? newsMeta : scanMeta))
  getModelConnection.mockImplementation((providerId: string, modelId: string) => ({
    providerId,
    modelId,
    providerType: 'openai',
    baseUrl: 'https://example.com',
    apiKey: 'test-key'
  }))
  createModelClient.mockReturnValue({
    complete: vi.fn(async () => ({ text: '', toolCalls: [], usage: null }))
  })
  runAiTask.mockImplementation(async (_label: string, _task: string, fn: Function) =>
    fn({ aborted: false }, { report: vi.fn() })
  )
  runAgent.mockResolvedValue({ outcome: 'completed', text: '', messages: [], webSearch: [] })
  listProjects.mockReturnValue([project])
})

describe('routing model theo từng tác vụ (FIX 2)', () => {
  it('Check News đọc getTaskModelMeta("news") và dùng connection của News', async () => {
    await runCheckNews()

    expect(getTaskModelMeta).toHaveBeenCalledWith('news')
    expect(getModelConnection).toHaveBeenCalledWith('p-news', 'm-news')
    expect(createModelClient).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'p-news', modelId: 'm-news' })
    )
  })

  it('Scan Project đọc getTaskModelMeta("scan") và dùng connection của Scan', async () => {
    await runScan({ text: 'Alpha Drop\nBeta Drop' })

    expect(getTaskModelMeta).toHaveBeenCalledWith('scan')
    expect(getModelConnection).toHaveBeenCalledWith('p-scan', 'm-scan')
    expect(createModelClient).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'p-scan', modelId: 'm-scan' })
    )
    expect(saveScanLatest).toHaveBeenCalled()
  })

  it('News không bị ảnh hưởng bởi model Scan và ngược lại', async () => {
    await runCheckNews()
    await runScan({ text: 'Alpha Drop' })

    const newsCall = createModelClient.mock.calls.find((call) => call[0].modelId === 'm-news')
    const scanCall = createModelClient.mock.calls.find((call) => call[0].modelId === 'm-scan')

    expect(newsCall).toBeTruthy()
    expect(scanCall).toBeTruthy()
    expect(newsCall?.[0].providerId).toBe('p-news')
    expect(scanCall?.[0].providerId).toBe('p-scan')
  })
})
