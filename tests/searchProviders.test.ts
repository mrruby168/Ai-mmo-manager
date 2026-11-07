import { describe, expect, it } from 'vitest'
import {
  createSearchProvider,
  describeSearchError,
  normaliseSearchResults,
  searxngSearchUrl,
  WebSearchError
} from '../src/main/services/searchProviders'
import type { SearchFetch, SearchResponseLike } from '../src/main/services/searchProviders'

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

function textResponse(body: string, status = 200): SearchResponseLike {
  return { ok: status >= 200 && status < 300, status, text: async () => body }
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

async function captureError(promise: Promise<unknown>): Promise<WebSearchError> {
  try {
    await promise
    throw new Error('expected the promise to reject')
  } catch (error) {
    expect(error).toBeInstanceOf(WebSearchError)
    return error as WebSearchError
  }
}

describe('Tavily adapter', () => {
  it('posts to the official endpoint with a Bearer token and normalises results', async () => {
    const recorder = recordingFetch(() =>
      jsonResponse({
        results: [
          {
            title: 'Alpha snapshot',
            url: 'https://alpha.example.com/a',
            content: '  Snapshot   on Nov 8 ',
            published_date: '2026-11-01'
          },
          { title: 'Bad scheme', url: 'javascript:alert(1)', content: 'x' }
        ]
      })
    )
    const provider = createSearchProvider(
      { provider: 'tavily', baseUrl: null, apiKey: 'tvly-secret' },
      recorder.fetchImpl
    )

    expect(provider).not.toBeNull()
    const results = await provider!.search('alpha drop', { maxResults: 5 })

    expect(recorder.calls).toHaveLength(1)
    expect(recorder.calls[0].url).toBe('https://api.tavily.com/search')
    expect(recorder.calls[0].init.method).toBe('POST')
    const headers = recorder.calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer tvly-secret')
    const body = JSON.parse(String(recorder.calls[0].init.body)) as Record<string, unknown>
    expect(body).toMatchObject({ query: 'alpha drop', max_results: 5, search_depth: 'basic' })
    expect(results).toEqual([
      {
        title: 'Alpha snapshot',
        url: 'https://alpha.example.com/a',
        snippet: 'Snapshot on Nov 8',
        publishedAt: '2026-11-01'
      }
    ])
  })

  it('maps HTTP 401 to an AUTH error without leaking the key', async () => {
    const recorder = recordingFetch(() => textResponse('unauthorized', 401))
    const provider = createSearchProvider(
      { provider: 'tavily', baseUrl: null, apiKey: 'tvly-secret' },
      recorder.fetchImpl
    )

    const error = await captureError(provider!.search('alpha'))
    expect(error.code).toBe('AUTH')
    expect(error.message).not.toContain('tvly-secret')
  })
})

describe('Brave adapter', () => {
  it('calls the official endpoint with the subscription header and reads web.results', async () => {
    const recorder = recordingFetch(() =>
      jsonResponse({
        web: {
          results: [
            {
              title: 'Alpha claim',
              url: 'https://alpha.example.com/claim',
              description: 'Claim opens',
              page_age: '2026-11-02T10:00:00'
            }
          ]
        }
      })
    )
    const provider = createSearchProvider(
      { provider: 'brave', baseUrl: null, apiKey: 'brave-secret' },
      recorder.fetchImpl
    )

    const results = await provider!.search('alpha claim', { maxResults: 7 })

    const url = new URL(recorder.calls[0].url)
    expect(`${url.origin}${url.pathname}`).toBe('https://api.search.brave.com/res/v1/web/search')
    expect(url.searchParams.get('q')).toBe('alpha claim')
    expect(url.searchParams.get('count')).toBe('7')
    const headers = recorder.calls[0].init.headers as Record<string, string>
    expect(headers['x-subscription-token']).toBe('brave-secret')
    expect(results).toEqual([
      {
        title: 'Alpha claim',
        url: 'https://alpha.example.com/claim',
        snippet: 'Claim opens',
        publishedAt: '2026-11-02T10:00:00'
      }
    ])
  })
})

describe('SearXNG adapter', () => {
  it.each([
    ['https://searx.example.org', 'https://searx.example.org/search'],
    ['https://searx.example.org/', 'https://searx.example.org/search'],
    ['https://searx.example.org/search', 'https://searx.example.org/search'],
    ['https://example.org/searx', 'https://example.org/searx/search']
  ])('builds %s as %s', (base, expectedPath) => {
    const url = new URL(searxngSearchUrl(base, 'alpha drop'))
    expect(`${url.origin}${url.pathname}`).toBe(expectedPath)
    expect(url.searchParams.get('q')).toBe('alpha drop')
    expect(url.searchParams.get('format')).toBe('json')
  })

  it('rejects a non-http base URL', () => {
    expect(() => searxngSearchUrl('not a url', 'q')).toThrow(WebSearchError)
    expect(() => searxngSearchUrl('ftp://searx.example.org', 'q')).toThrow(WebSearchError)
  })

  it('reads results with the SearXNG field names', async () => {
    const recorder = recordingFetch(() =>
      jsonResponse({
        results: [
          {
            title: 'Alpha TGE',
            url: 'https://alpha.example.com/tge',
            content: 'TGE on 2026-12-01',
            publishedDate: '2026-11-03T00:00:00'
          }
        ]
      })
    )
    const provider = createSearchProvider(
      { provider: 'searxng', baseUrl: 'https://searx.example.org', apiKey: null },
      recorder.fetchImpl
    )

    const results = await provider!.search('alpha tge')

    expect(recorder.calls[0].url).toContain('/search?')
    expect(results[0]).toEqual({
      title: 'Alpha TGE',
      url: 'https://alpha.example.com/tge',
      snippet: 'TGE on 2026-12-01',
      publishedAt: '2026-11-03T00:00:00'
    })
  })
})

describe('createSearchProvider', () => {
  it('returns null when configuration is incomplete', () => {
    expect(createSearchProvider({ provider: 'none', baseUrl: null, apiKey: null })).toBeNull()
    expect(createSearchProvider({ provider: 'tavily', baseUrl: null, apiKey: null })).toBeNull()
    expect(createSearchProvider({ provider: 'brave', baseUrl: null, apiKey: '  ' })).toBeNull()
    expect(createSearchProvider({ provider: 'searxng', baseUrl: null, apiKey: null })).toBeNull()
    expect(createSearchProvider({ provider: 'searxng', baseUrl: 'ftp://x', apiKey: null })).toBeNull()
  })
})

describe('error mapping', () => {
  it('maps network failures', async () => {
    const provider = createSearchProvider(
      { provider: 'tavily', baseUrl: null, apiKey: 'k' },
      async () => {
        throw new Error('ECONNRESET')
      }
    )

    const error = await captureError(provider!.search('q'))
    expect(error.code).toBe('NETWORK')
  })

  it('maps non-2xx responses', async () => {
    const recorder = recordingFetch(() => textResponse('server error', 500))
    const provider = createSearchProvider({ provider: 'tavily', baseUrl: null, apiKey: 'k' }, recorder.fetchImpl)

    const error = await captureError(provider!.search('q'))
    expect(error.code).toBe('HTTP')
  })

  it('maps invalid JSON bodies', async () => {
    const recorder = recordingFetch(() => textResponse('<html>not json</html>'))
    const provider = createSearchProvider({ provider: 'tavily', baseUrl: null, apiKey: 'k' }, recorder.fetchImpl)

    const error = await captureError(provider!.search('q'))
    expect(error.code).toBe('PARSE')
  })

  it('describes unknown errors without throwing', () => {
    expect(describeSearchError(new Error('boom'))).toBe('Không gọi được dịch vụ tìm kiếm')
    expect(describeSearchError(new WebSearchError('AUTH', 'sai key'))).toBe('sai key')
  })
})

describe('normaliseSearchResults', () => {
  it('filters non-http URLs and keeps a usable fallback title', () => {
    const results = normaliseSearchResults(
      [
        { title: '', url: 'https://example.com/x', content: 'a' },
        { title: 'relative', url: '/local', content: 'b' },
        'not an object'
      ],
      { title: 'title', url: 'url', snippet: 'content', publishedAt: 'publishedAt' }
    )

    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('https://example.com/x')
    expect(results[0].publishedAt).toBeNull()
  })
})
