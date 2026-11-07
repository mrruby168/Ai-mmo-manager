export type AiErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'quota'
  | 'model_not_found'
  | 'network'
  | 'timeout'
  | 'bad_request'
  | 'unsupported'
  | 'unknown'

export class AiError extends Error {
  readonly kind: AiErrorKind
  readonly detail: string | null

  constructor(kind: AiErrorKind, message: string, detail: string | null = null) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
    this.detail = detail
  }
}

export interface AiToolCall {
  id: string
  name: string
  arguments: unknown
}

/** Payload gốc của Provider, giữ nguyên để gửi lại đúng định dạng (thinking/signature/server tool). */
export interface NativePayload {
  provider: 'openai' | 'anthropic' | 'google'
  payload: unknown
}

export interface AiMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolName?: string
  toolCalls?: AiToolCall[]
  raw?: NativePayload
}

export interface AiToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface AiRequest {
  system: string
  messages: AiMessage[]
  tools: AiToolSpec[]
  enableWebSearch: boolean
  signal: AbortSignal
  maxTokens: number
}

export interface AiResponse {
  text: string
  toolCalls: AiToolCall[]
  usage: { inputTokens: number; outputTokens: number } | null
  raw?: NativePayload
  /** Proof that the provider actually ran a web search, not just that it was enabled. */
  webSearch?: { used: boolean; sources: string[] }
}

export interface ModelClient {
  complete(request: AiRequest): Promise<AiResponse>
}

export interface ProviderConnection {
  providerType: 'openai' | 'anthropic' | 'opencode' | 'google' | 'custom'
  baseUrl: string
  apiKey: string
  headers?: Record<string, string>
  modelId: string
  supportsWebSearch: boolean
}

export function mapHttpStatus(status: number, detail: string): AiError {
  if (status === 401 || status === 403) {
    return new AiError('auth', 'API Key không hợp lệ hoặc không có quyền truy cập', detail)
  }
  if (status === 404) {
    return new AiError('model_not_found', 'Không tìm thấy endpoint hoặc model', detail)
  }
  if (status === 429) {
    if (/quota|billing|insufficient/i.test(detail)) {
      return new AiError('quota', 'Đã hết hạn mức hoặc số dư của Provider', detail)
    }
    return new AiError('rate_limit', 'Provider đang giới hạn tần suất, thử lại sau', detail)
  }
  if (status >= 400 && status < 500) {
    return new AiError('bad_request', `Provider từ chối yêu cầu (HTTP ${status})`, detail)
  }
  if (status >= 500) {
    return new AiError('network', `Provider gặp lỗi máy chủ (HTTP ${status})`, detail)
  }
  return new AiError('unknown', `Lỗi không xác định từ Provider (HTTP ${status})`, detail)
}

export function mapFetchFailure(error: unknown, modelId: string): AiError {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new AiError('timeout', 'Quá thời gian chờ Provider')
  }
  return new AiError('network', `Không kết nối được tới Provider cho model ${modelId}`)
}

export function buildEndpoint(baseUrl: string | null, fallback: string, suffix: string): string {
  const root = (baseUrl && baseUrl.trim().length > 0 ? baseUrl.trim() : fallback).replace(/\/+$/, '')
  return `${root}${suffix}`
}

const DETAIL_REDACTIONS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***'],
  [/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1***'],
  [/(api[_-]?key["'\s:=]+)[A-Za-z0-9._-]{8,}/gi, '$1***']
]

function redactDetail(text: string): string {
  return DETAIL_REDACTIONS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text)
}

export function extractErrorDetail(body: unknown): string {
  if (typeof body === 'string') {
    return redactDetail(body.slice(0, 1200))
  }
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    const error = record.error
    if (error && typeof error === 'object') {
      const detail = error as Record<string, unknown>
      const parts = [detail.type, detail.code, detail.message, detail.status]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
      if (parts.length > 0) {
        return redactDetail(parts.join(' · ').slice(0, 1200))
      }
    }
    if (typeof record.message === 'string') {
      return redactDetail(record.message.slice(0, 1200))
    }
  }
  try {
    return redactDetail(JSON.stringify(body).slice(0, 1200))
  } catch {
    return 'Không đọc được nội dung lỗi từ Provider'
  }
}
