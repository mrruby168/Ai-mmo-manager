import { describe, expect, it } from 'vitest'
import {
  createSearchProvider,
  describeSearchError,
  probeSearchProvider,
  WebSearchError
} from '../src/main/services/searchProviders'
import type { SearchFetch, SearchResponseLike } from '../src/main/services/searchProviders'
import { getScanTools } from '../src/main/ai/tools'
import { createSearchBudget } from '../src/main/ai/searchBudget'
import type { AgentTool, AgentToolContext } from '../src/main/ai/agentRunner'

interface Call {
  url: string
  init: RequestInit
}

function jsonResponse(body: unknown, status = 200): SearchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  }
}

function recordingFetch(response: () => SearchResponseLike | Promise<SearchResponseLike>): {
  fetchImpl: SearchFetch
  calls: Call[]
} {
  const calls: Call[] = []
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return response()
    }
  }
}

const CONTEXT: AgentToolContext = { signal: new AbortController().signal }

function webSearchTool(tools: AgentTool[]): AgentTool {
  const tool = tools.find((entry) => entry.name === 'web_search')
  if (!tool) {
    throw new Error('web_search tool chưa được đăng ký')
  }
  return tool
}

const HIT = {
  title: 'Alpha Drop Snapshot',
  url: 'https://alpha.example.com/snapshot',
  content: 'Snapshot chính thức'
}

describe('Scan web_search tool với từng provider', () => {
  it('đăng ký đủ web_fetch, list_existing_projects, submit_scan_result và web_search khi app có search', () => {
    const tools = getScanTools({ search: { provider: 'tavily', search: async () => [] } })

    expect(tools.map((tool) => tool.name)).toEqual([
      'web_fetch',
      'web_search',
      'list_existing_projects',
      'submit_scan_result'
    ])
  })

  it('không đăng ký web_search khi app chưa cấu hình search', () => {
    expect(getScanTools().map((tool) => tool.name)).toEqual([
      'web_fetch',
      'list_existing_projects',
      'submit_scan_result'
    ])
  })

  it('Tavily hoạt động: gọi đúng endpoint và trả nội dung cho model', async () => {
    const recorder = recordingFetch(() => jsonResponse({ results: [HIT] }))
    const provider = createSearchProvider({ provider: 'tavily', baseUrl: null, apiKey: 'tvly-secret' }, recorder.fetchImpl)!

    const result = await webSearchTool(getScanTools({ search: provider })).handler({ query: 'alpha snapshot' }, CONTEXT)

    expect(recorder.calls).toHaveLength(1)
    expect(recorder.calls[0].url).toBe('https://api.tavily.com/search')
    expect(String(result)).toContain('<untrusted_web_content')
    expect(String(result)).toContain('https://alpha.example.com/snapshot')
  })

  it('Brave hoạt động: gọi đúng endpoint với token và trả nội dung cho model', async () => {
    const recorder = recordingFetch(() =>
      jsonResponse({ web: { results: [{ title: HIT.title, url: HIT.url, description: HIT.content, page_age: '2026-11-01' }] } })
    )
    const provider = createSearchProvider({ provider: 'brave', baseUrl: null, apiKey: 'brave-secret' }, recorder.fetchImpl)!

    const result = await webSearchTool(getScanTools({ search: provider })).handler({ query: 'alpha snapshot' }, CONTEXT)

    expect(recorder.calls).toHaveLength(1)
    expect(recorder.calls[0].url).toContain('https://api.search.brave.com/res/v1/web/search')
    expect((recorder.calls[0].init.headers as Record<string, string>)['x-subscription-token']).toBe('brave-secret')
    expect(String(result)).toContain('https://alpha.example.com/snapshot')
  })

  it('SearXNG hoạt động: gọi instance với format=json và trả nội dung cho model', async () => {
    const recorder = recordingFetch(() =>
      jsonResponse({ results: [{ title: HIT.title, url: HIT.url, content: HIT.content, publishedDate: '2026-11-01' }] })
    )
    const provider = createSearchProvider(
      { provider: 'searxng', baseUrl: 'https://searx.example.org', apiKey: null },
      recorder.fetchImpl
    )!

    const result = await webSearchTool(getScanTools({ search: provider })).handler({ query: 'alpha snapshot' }, CONTEXT)

    expect(recorder.calls).toHaveLength(1)
    expect(recorder.calls[0].url).toContain('https://searx.example.org/search')
    expect(recorder.calls[0].url).toContain('format=json')
    expect(String(result)).toContain('https://alpha.example.com/snapshot')
  })

  it('App Search kết nối thất bại: tool trả lỗi rõ ràng thay vì ném ngoại lệ', async () => {
    const provider = createSearchProvider(
      { provider: 'tavily', baseUrl: null, apiKey: 'tvly-secret' },
      async () => {
        throw new TypeError('fetch failed')
      }
    )!

    const result = await webSearchTool(getScanTools({ search: provider })).handler({ query: 'alpha snapshot' }, CONTEXT)

    expect(String(result)).toContain('error')
    expect(String(result)).toContain('Không kết nối được')
  })

  it('probeSearchProvider ném WebSearchError khi không kết nối được (Scan fail pre-flight)', async () => {
    const provider = createSearchProvider(
      { provider: 'searxng', baseUrl: 'https://searx.example.org', apiKey: null },
      async () => {
        throw new TypeError('fetch failed')
      }
    )!

    await expect(probeSearchProvider(provider)).rejects.toBeInstanceOf(WebSearchError)
    await expect(probeSearchProvider(provider)).rejects.toThrow('Không kết nối được tới dịch vụ tìm kiếm')
  })

  it('probeSearchProvider không ném lỗi khi provider trả một kết quả', async () => {
    const recorder = recordingFetch(() => jsonResponse({ results: [HIT] }))
    const provider = createSearchProvider({ provider: 'tavily', baseUrl: null, apiKey: 'k' }, recorder.fetchImpl)!

    await expect(probeSearchProvider(provider)).resolves.toBeUndefined()
    expect(recorder.calls).toHaveLength(1)
  })

  it('không tìm thêm khi vượt giới hạn scanMaxSearchesPerRun của phiên', async () => {
    const recorder = recordingFetch(() => jsonResponse({ results: [HIT] }))
    const provider = createSearchProvider({ provider: 'tavily', baseUrl: null, apiKey: 'k' }, recorder.fetchImpl)!
    const budget = createSearchBudget(2)
    const tool = webSearchTool(getScanTools({ search: provider, costControl: { budget, maxSearches: 20 } }))

    const first = await tool.handler({ query: 'alpha one' }, CONTEXT)
    const second = await tool.handler({ query: 'alpha two' }, CONTEXT)
    const third = await tool.handler({ query: 'alpha three' }, CONTEXT)

    expect(String(first)).toContain('<untrusted_web_content')
    expect(String(second)).toContain('<untrusted_web_content')
    expect(String(third)).toContain('Đã hết hạn mức tìm kiếm')
    expect(recorder.calls).toHaveLength(2)
    expect(budget.used()).toBe(2)
  })

  it('submit_scan_result vẫn được đăng ký và halt với kind scan', async () => {
    const tools = getScanTools({ search: { provider: 'brave', search: async () => [] } })
    const submit = tools.find((tool) => tool.name === 'submit_scan_result')!

    const result = (await submit.handler(
      { items: [{ name: 'Alpha Drop', category: 'airdrop' }] },
      CONTEXT
    )) as Record<string, unknown>

    expect(result.__halt).toBe(true)
    expect(result.kind).toBe('submit')
    const payload = result.payload as { kind?: string; data?: { items?: Array<{ name: string }> } }
    expect(payload.kind).toBe('scan')
    expect(payload.data?.items?.[0]?.name).toBe('Alpha Drop')
  })

  it('describeSearchError không lộ API key trong thông báo lỗi', async () => {
    const provider = createSearchProvider(
      { provider: 'tavily', baseUrl: null, apiKey: 'tvly-secret' },
      async () => jsonResponse({}, 401)
    )!

    try {
      await probeSearchProvider(provider)
      throw new Error('expected probe to fail')
    } catch (error) {
      expect(describeSearchError(error)).not.toContain('tvly-secret')
    }
  })
})
