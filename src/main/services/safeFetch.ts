import type { LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { LIMITS } from '@shared/constants'

export type SafeFetchErrorCode =
  | 'INVALID_PROTOCOL'
  | 'BLOCKED_HOST'
  | 'TOO_MANY_REDIRECTS'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'CONTENT_TYPE'
  | 'TOO_LARGE'
  | 'NETWORK'

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode

  constructor(code: SafeFetchErrorCode, message: string) {
    super(message)
    this.name = 'SafeFetchError'
    this.code = code
  }
}

export interface SafeFetchResult {
  url: string
  status: number
  contentType: string
  text: string
}

export interface SafeFetchBinaryResult {
  url: string
  status: number
  contentType: string
  bytes: Uint8Array
}

const TEXT_CONTENT_TYPES = ['text/html', 'text/plain', 'text/markdown', 'application/json']
const IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const parts = address.split('.').map(Number)
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) {
      return true
    }
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
      return true
    }
    if (parts[0] === 192 && parts[1] === 168) {
      return true
    }
    if (parts[0] === 169 && parts[1] === 254) {
      return true
    }
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) {
      return true
    }
    return false
  }

  if (family === 6) {
    const lower = address.toLowerCase()
    if (lower === '::' || lower === '::1') {
      return true
    }
    if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)) {
      return true
    }
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) {
      return isBlockedAddress(mapped[1])
    }
    return false
  }

  return true
}

async function assertAllowedUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('INVALID_PROTOCOL', 'Chỉ cho phép http:// và https://')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new SafeFetchError('BLOCKED_HOST', 'Không cho phép truy cập máy cục bộ')
  }

  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new SafeFetchError('BLOCKED_HOST', 'Địa chỉ IP nội bộ bị chặn')
    }
    return
  }

  let records: LookupAddress[]
  try {
    records = (await lookup(hostname, { all: true, verbatim: true })) as LookupAddress[]
  } catch {
    throw new SafeFetchError('NETWORK', `Không phân giải được tên miền ${hostname}`)
  }

  if (records.length === 0) {
    throw new SafeFetchError('NETWORK', `Không phân giải được tên miền ${hostname}`)
  }

  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new SafeFetchError('BLOCKED_HOST', 'Tên miền trỏ tới địa chỉ nội bộ, đã chặn')
    }
  }
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    return new Uint8Array(0)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new SafeFetchError('TOO_LARGE', 'Nội dung vượt quá giới hạn dung lượng')
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

interface RequestOptions {
  allowedContentTypes: string[]
  maxBytes: number
  timeoutMs: number
}

interface FetchedResponse {
  response: Response
  url: string
  contentType: string
}

async function requestFollowingRedirects(rawUrl: string, options: RequestOptions): Promise<FetchedResponse> {
  let current = rawUrl

  for (let redirects = 0; redirects <= LIMITS.webFetchMaxRedirects; redirects += 1) {
    let url: URL
    try {
      url = new URL(current)
    } catch {
      throw new SafeFetchError('INVALID_PROTOCOL', 'URL không hợp lệ')
    }

    await assertAllowedUrl(url)

    let response: Response
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs),
        headers: { 'user-agent': 'MMOManager/0.1 (+local desktop app)' }
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new SafeFetchError('TIMEOUT', 'Quá thời gian chờ máy chủ')
      }
      throw new SafeFetchError('NETWORK', 'Không kết nối được tới máy chủ')
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location')
      if (!location) {
        throw new SafeFetchError('NETWORK', 'Chuyển hướng thiếu Location')
      }
      current = new URL(location, url).toString()
      continue
    }

    if (!response.ok) {
      throw new SafeFetchError('HTTP_ERROR', `Máy chủ trả về HTTP ${response.status}`)
    }

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!options.allowedContentTypes.includes(contentType)) {
      throw new SafeFetchError('CONTENT_TYPE', `Không hỗ trợ content-type ${contentType || 'không rõ'}`)
    }

    return { response, url: current, contentType }
  }

  throw new SafeFetchError('TOO_MANY_REDIRECTS', `Chuyển hướng quá ${LIMITS.webFetchMaxRedirects} lần`)
}

export async function safeFetch(rawUrl: string, timeoutMs: number = LIMITS.webFetchTimeoutMs): Promise<SafeFetchResult> {
  const fetched = await requestFollowingRedirects(rawUrl, {
    allowedContentTypes: TEXT_CONTENT_TYPES,
    maxBytes: LIMITS.webFetchMaxBytes,
    timeoutMs
  })
  const bytes = await readLimited(fetched.response, LIMITS.webFetchMaxBytes)
  return {
    url: fetched.url,
    status: fetched.response.status,
    contentType: fetched.contentType,
    text: new TextDecoder('utf-8').decode(bytes)
  }
}

export async function safeFetchImage(rawUrl: string, timeoutMs: number = LIMITS.webFetchTimeoutMs): Promise<SafeFetchBinaryResult> {
  const fetched = await requestFollowingRedirects(rawUrl, {
    allowedContentTypes: IMAGE_CONTENT_TYPES,
    maxBytes: LIMITS.logoMaxBytes,
    timeoutMs
  })
  const bytes = await readLimited(fetched.response, LIMITS.logoMaxBytes)
  return {
    url: fetched.url,
    status: fetched.response.status,
    contentType: fetched.contentType,
    bytes
  }
}
