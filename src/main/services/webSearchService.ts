import type { WebSearchProvider } from '@shared/constants'
import type { WebSearchSettings, WebSearchTestResult, WebSearchView } from '@shared/types'
import {
  createSearchProvider,
  describeSearchError,
  WebSearchError
} from './searchProviders'
import type { SearchProvider } from './searchProviders'
import { getProviderSecret, hasProviderSecret, saveProviderSecret } from './secretStore'
import { getSettings, saveWebSearchSettings } from './settingsStore'

/**
 * D2: cấu hình Web Search của app. Key lưu trong secretStore với id
 * `websearch:<provider>` và không bao giờ được ghi log hay trả về renderer.
 */

const KEY_PROVIDERS: ReadonlySet<WebSearchProvider> = new Set(['tavily', 'brave'])

export function webSearchSecretId(provider: WebSearchProvider): string {
  return `websearch:${provider}`
}

function readKey(provider: WebSearchProvider): string | null {
  if (!KEY_PROVIDERS.has(provider)) {
    return null
  }
  const secret = getProviderSecret(webSearchSecretId(provider))
  const key = secret?.apiKey?.trim() ?? ''
  return key.length > 0 ? key : null
}

function toView(settings: WebSearchSettings): WebSearchView {
  const hasApiKey = KEY_PROVIDERS.has(settings.provider)
    ? hasProviderSecret(webSearchSecretId(settings.provider))
    : false
  return { ...settings, hasApiKey }
}

export function getWebSearchView(): WebSearchView {
  return toView(getSettings().webSearch)
}

/** Null khi chưa cấu hình đủ; Check News dùng kết quả này để chọn đường chạy. */
export function loadSearchProvider(): SearchProvider | null {
  const settings = getSettings().webSearch
  return createSearchProvider({
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    apiKey: readKey(settings.provider)
  })
}

function validateBaseUrl(raw: string | null | undefined): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value.length === 0) {
    throw new Error('SearXNG cần URL instance, ví dụ https://searx.example.org')
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('URL SearXNG không hợp lệ')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL SearXNG phải bắt đầu bằng http:// hoặc https://')
  }
  return value
}

export interface SaveWebSearchInput {
  provider: WebSearchProvider
  baseUrl?: string | null
  apiKey?: string
}

/**
 * API key rỗng nghĩa là "giữ key đã lưu". Chỉ provider cần key mới bắt buộc
 * có key (đã lưu hoặc vừa nhập).
 */
export function saveWebSearch(input: SaveWebSearchInput): WebSearchView {
  const provider = input.provider
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''

  if (provider === 'none') {
    saveWebSearchSettings({ provider: 'none', baseUrl: null })
    return getWebSearchView()
  }

  if (provider === 'searxng') {
    const baseUrl = validateBaseUrl(input.baseUrl)
    saveWebSearchSettings({ provider, baseUrl })
    return getWebSearchView()
  }

  if (apiKey.length > 0) {
    saveProviderSecret(webSearchSecretId(provider), apiKey)
  } else if (!hasProviderSecret(webSearchSecretId(provider))) {
    throw new Error(
      provider === 'tavily'
        ? 'Tavily cần API key. Dán key vào ô API key rồi lưu lại.'
        : 'Brave Search cần API key. Dán key vào ô API key rồi lưu lại.'
    )
  }

  saveWebSearchSettings({ provider, baseUrl: null })
  return getWebSearchView()
}

export interface TestWebSearchInput {
  provider?: WebSearchProvider
  baseUrl?: string | null
  apiKey?: string
}

const TEST_QUERY = 'bitcoin airdrop announcement'

function resolveDraft(input: TestWebSearchInput): SearchProvider {
  const stored = getSettings().webSearch
  const provider = input.provider ?? stored.provider
  if (provider === 'none') {
    throw new WebSearchError('NOT_CONFIGURED', 'Chưa chọn nhà cung cấp Web Search')
  }

  const typedKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
  const apiKey = typedKey.length > 0 ? typedKey : readKey(provider)
  const baseUrl = provider === 'searxng' ? (input.baseUrl ?? stored.baseUrl) : null
  if (provider === 'searxng' && (!baseUrl || baseUrl.trim().length === 0)) {
    throw new WebSearchError('NOT_CONFIGURED', 'SearXNG cần URL instance trước khi thử')
  }

  const created = createSearchProvider({ provider, baseUrl, apiKey })
  if (!created) {
    throw new WebSearchError(
      'NOT_CONFIGURED',
      provider === 'searxng'
        ? 'URL SearXNG không hợp lệ'
        : 'Chưa có API key cho nhà cung cấp này'
    )
  }
  return created
}

export async function testWebSearch(input: TestWebSearchInput = {}): Promise<WebSearchTestResult> {
  let provider: SearchProvider
  try {
    provider = resolveDraft(input)
  } catch (error) {
    return { ok: false, message: describeSearchError(error), resultCount: 0 }
  }

  try {
    const results = await provider.search(TEST_QUERY, { maxResults: 3 })
    if (results.length === 0) {
      return {
        ok: false,
        message: 'Kết nối được nhưng không có kết quả nào. Kiểm tra lại cấu hình hoặc thử từ khóa khác.',
        resultCount: 0
      }
    }
    return {
      ok: true,
      message: `Kết nối thành công, nhận ${results.length} kết quả mẫu`,
      resultCount: results.length
    }
  } catch (error) {
    return { ok: false, message: describeSearchError(error), resultCount: 0 }
  }
}
