import type { WebSearchProvider } from '@shared/constants'

/**
 * D2: adapter cho các dịch vụ search chính thức. Module này cố tình không
 * import electron/settings/secretStore để test được bằng fetch giả.
 *
 * Đã đối chiếu tài liệu chính thức lúc cài đặt:
 * - Tavily: POST https://api.tavily.com/search, `Authorization: Bearer <key>`,
 *   body JSON `{ query, max_results, search_depth, include_published_date }`,
 *   response `results[]` với `title/url/content/published_date`.
 *   https://docs.tavily.com/documentation/api-reference/endpoint/search
 * - Brave: GET https://api.search.brave.com/res/v1/web/search?q=…, header
 *   `X-Subscription-Token`, response `web.results[]` với
 *   `title/url/description/age/page_age`.
 *   https://brave.com/search/api/
 * - SearXNG: GET `<base>/search?q=…&format=json`, response `results[]` với
 *   `title/url/content/publishedDate` (format JSON phải được bật ở instance).
 *   https://docs.searxng.org/dev/search_api.html
 */

export interface SearchResultItem {
  title: string
  url: string
  snippet: string
  publishedAt: string | null
}

export interface SearchOptions {
  signal?: AbortSignal
  maxResults?: number
}

export interface SearchProvider {
  readonly provider: WebSearchProvider
  search(query: string, options?: SearchOptions): Promise<SearchResultItem[]>
}

export type WebSearchErrorCode =
  | 'INVALID_URL'
  | 'NOT_CONFIGURED'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'AUTH'
  | 'HTTP'
  | 'TOO_LARGE'
  | 'PARSE'

export class WebSearchError extends Error {
  readonly code: WebSearchErrorCode

  constructor(code: WebSearchErrorCode, message: string) {
    super(message)
    this.name = 'WebSearchError'
    this.code = code
  }
}

export interface SearchResponseLike {
  ok: boolean
  status: number
  text(): Promise<string>
}

/** Chỉ cần đúng phần fetch mà adapter dùng, để test bơm bản giả. */
export type SearchFetch = (url: string, init: RequestInit) => Promise<SearchResponseLike>

const MAX_RESPONSE_CHARS = 1_000_000
const TIMEOUT_MS = 15_000
const DEFAULT_MAX_RESULTS = 8

function clampResults(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_RESULTS
  }
  return Math.min(20, Math.max(1, Math.round(value as number)))
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

interface RequestContext {
  fetchImpl: SearchFetch
  signal?: AbortSignal
}

async function readJson(response: SearchResponseLike): Promise<Record<string, unknown>> {
  let text: string
  try {
    text = await response.text()
  } catch {
    throw new WebSearchError('NETWORK', 'Không đọc được phản hồi của dịch vụ tìm kiếm')
  }
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new WebSearchError('TOO_LARGE', 'Phản hồi tìm kiếm quá lớn')
  }
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return parsed as Record<string, unknown>
  } catch {
    throw new WebSearchError('PARSE', 'Dịch vụ tìm kiếm trả về dữ liệu không phải JSON hợp lệ')
  }
}

async function request(
  context: RequestContext,
  url: string,
  init: Omit<RequestInit, 'signal'>
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const onAbort = (): void => controller.abort()
  context.signal?.addEventListener('abort', onAbort)
  if (context.signal?.aborted) {
    controller.abort()
  }

  try {
    let response: SearchResponseLike
    try {
      response = await context.fetchImpl(url, { ...init, signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) {
        throw new WebSearchError('TIMEOUT', 'Dịch vụ tìm kiếm không phản hồi kịp (timeout)')
      }
      throw new WebSearchError('NETWORK', 'Không kết nối được tới dịch vụ tìm kiếm')
    }

    if (response.status === 401 || response.status === 403) {
      throw new WebSearchError('AUTH', `Dịch vụ tìm kiếm từ chối API key (HTTP ${response.status})`)
    }
    if (!response.ok) {
      throw new WebSearchError('HTTP', `Dịch vụ tìm kiếm trả về HTTP ${response.status}`)
    }

    return await readJson(response)
  } finally {
    clearTimeout(timeout)
    context.signal?.removeEventListener('abort', onAbort)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

interface FieldMap {
  title: string
  url: string
  snippet: string
  publishedAt: string
}

/** Chuẩn hoá kết quả và bỏ mọi URL không phải http(s). */
export function normaliseSearchResults(raw: unknown, fields: FieldMap): SearchResultItem[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const items: SearchResultItem[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) {
      continue
    }
    const url = asString(record[fields.url])
    if (!isHttpUrl(url)) {
      continue
    }
    const title = asString(record[fields.title])
    const snippet = asString(record[fields.snippet]).replace(/\s+/g, ' ').slice(0, 500)
    const publishedAt = asString(record[fields.publishedAt])
    items.push({
      title: title.length > 0 ? title.slice(0, 300) : url,
      url,
      snippet,
      publishedAt: publishedAt.length > 0 ? publishedAt : null
    })
  }
  return items
}

const TAVILY_FIELDS: FieldMap = {
  title: 'title',
  url: 'url',
  snippet: 'content',
  publishedAt: 'published_date'
}

const BRAVE_FIELDS: FieldMap = {
  title: 'title',
  url: 'url',
  snippet: 'description',
  publishedAt: 'page_age'
}

const SEARXNG_FIELDS: FieldMap = {
  title: 'title',
  url: 'url',
  snippet: 'content',
  publishedAt: 'publishedDate'
}

function createTavilyProvider(apiKey: string, fetchImpl: SearchFetch): SearchProvider {
  return {
    provider: 'tavily',
    async search(query, options = {}) {
      const payload = await request(
        { fetchImpl, signal: options.signal },
        'https://api.tavily.com/search',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            query,
            max_results: clampResults(options.maxResults),
            search_depth: 'basic',
            topic: 'general',
            include_published_date: true
          })
        }
      )
      return normaliseSearchResults(payload.results, TAVILY_FIELDS)
    }
  }
}

function createBraveProvider(apiKey: string, fetchImpl: SearchFetch): SearchProvider {
  return {
    provider: 'brave',
    async search(query, options = {}) {
      const url = new URL('https://api.search.brave.com/res/v1/web/search')
      url.searchParams.set('q', query)
      url.searchParams.set('count', String(clampResults(options.maxResults)))
      const payload = await request({ fetchImpl, signal: options.signal }, url.toString(), {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-subscription-token': apiKey
        }
      })
      const web = asRecord(payload.web)
      return normaliseSearchResults(web?.results, BRAVE_FIELDS)
    }
  }
}

export function searxngSearchUrl(baseUrl: string, query: string): string {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new WebSearchError('INVALID_URL', 'URL SearXNG không hợp lệ')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new WebSearchError('INVALID_URL', 'URL SearXNG phải bắt đầu bằng http:// hoặc https://')
  }
  const path = parsed.pathname.replace(/\/+$/, '')
  parsed.pathname = path.endsWith('/search') ? path : `${path}/search`
  parsed.search = ''
  parsed.hash = ''
  parsed.searchParams.set('q', query)
  parsed.searchParams.set('format', 'json')
  parsed.searchParams.set('safesearch', '1')
  return parsed.toString()
}

function createSearxngProvider(baseUrl: string, fetchImpl: SearchFetch): SearchProvider {
  return {
    provider: 'searxng',
    async search(query, options = {}) {
      const url = searxngSearchUrl(baseUrl, query)
      const payload = await request({ fetchImpl, signal: options.signal }, url, {
        method: 'GET',
        headers: { accept: 'application/json' }
      })
      return normaliseSearchResults(payload.results, SEARXNG_FIELDS).slice(0, clampResults(options.maxResults))
    }
  }
}

export interface SearchProviderConfig {
  provider: WebSearchProvider
  baseUrl: string | null
  apiKey: string | null
}

/**
 * Trả null khi chưa cấu hình đủ. Không bao giờ ném lỗi vì thiếu key:
 * nơi gọi cần biết "có Web Search hay không" để hiện thông báo đúng.
 */
export function createSearchProvider(
  config: SearchProviderConfig,
  fetchImpl: SearchFetch = fetch as unknown as SearchFetch
): SearchProvider | null {
  const apiKey = config.apiKey?.trim() ?? ''
  const baseUrl = config.baseUrl?.trim() ?? ''
  if (config.provider === 'tavily') {
    return apiKey.length > 0 ? createTavilyProvider(apiKey, fetchImpl) : null
  }
  if (config.provider === 'brave') {
    return apiKey.length > 0 ? createBraveProvider(apiKey, fetchImpl) : null
  }
  if (config.provider === 'searxng') {
    if (!isHttpUrl(baseUrl)) {
      return null
    }
    return createSearxngProvider(baseUrl, fetchImpl)
  }
  return null
}

/** Thông báo lỗi an toàn: không chứa API key hay URL có tham số bí mật. */
export function describeSearchError(error: unknown): string {
  if (error instanceof WebSearchError) {
    return error.message
  }
  return 'Không gọi được dịch vụ tìm kiếm'
}
