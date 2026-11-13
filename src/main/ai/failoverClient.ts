import { AiError } from './types'
import type { AiErrorKind, AiMessage, AiRequest, AiResponse, ModelClient, ProviderConnection } from './types'

/**
 * FIX 2: chuỗi model A1 → A2 → A3 cho một tác vụ.
 * Mỗi ứng viên tự tạo client khi cần (lười), để lỗi cấu hình của A2/A3
 * không chặn tác vụ khi A1 vẫn chạy được.
 */
export interface FailoverCandidate {
  /** Nhãn hiển thị, ví dụ "OpenAI · gpt-4o". Không chứa API key. */
  label: string
  providerType: ProviderConnection['providerType']
  supportsTools: boolean
  supportsWebSearch: boolean
  createClient: () => ModelClient
}

export interface FailoverEvents {
  onOnline?: (candidate: FailoverCandidate, index: number) => void
  onSwap?: (from: FailoverCandidate, to: FailoverCandidate, error: AiError) => void
}

const SWAP_KINDS: ReadonlySet<AiErrorKind> = new Set([
  'quota',
  'rate_limit',
  'auth',
  'model_not_found',
  'network',
  'timeout',
  'unsupported'
])

/**
 * Lỗi có nên đổi model không.
 * `bad_request` chỉ đổi khi yêu cầu có tools (nhiều provider từ chối schema tool).
 */
export function isFailoverError(error: unknown, request: Pick<AiRequest, 'tools'>): boolean {
  if (!(error instanceof AiError)) {
    return false
  }
  if (error.kind === 'bad_request') {
    return request.tools.length > 0
  }
  return SWAP_KINDS.has(error.kind)
}

function withoutRaw(messages: AiMessage[]): AiMessage[] {
  return messages.map((message) => {
    if (!message.raw) {
      return message
    }
    const rest = { ...message }
    delete rest.raw
    return rest
  })
}

/**
 * `raw` là payload gốc của provider (openai/anthropic/google): chỉ gửi lại được
 * cho đúng loại provider. Đổi provider khác loại thì bỏ, nếu không provider từ chối.
 */
function prepareRequest(request: AiRequest, candidate: FailoverCandidate, originType: ProviderConnection['providerType']): AiRequest {
  return {
    ...request,
    messages: candidate.providerType === originType ? request.messages : withoutRaw(request.messages),
    tools: candidate.supportsTools ? request.tools : [],
    enableWebSearch: request.enableWebSearch && candidate.supportsWebSearch
  }
}

/**
 * Chỉ dùng `message` đã soạn sẵn, không dùng `detail` (detail là body thô của provider và
 * có thể chứa khoá nếu provider trả lại chính khoá đó).
 */
function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : 'lỗi không xác định'
}

export function createFailoverClient(candidates: readonly FailoverCandidate[], events: FailoverEvents = {}): ModelClient {
  if (candidates.length === 0) {
    throw new AiError('unknown', 'Chưa cấu hình model cho tác vụ này. Vào Settings → Model Configuration để chọn model.')
  }

  const originType = candidates[0].providerType
  const clients = new Map<number, ModelClient>()
  let active = 0
  let announced = -1

  function clientAt(index: number): ModelClient {
    const existing = clients.get(index)
    if (existing) {
      return existing
    }
    const created = candidates[index].createClient()
    clients.set(index, created)
    return created
  }

  return {
    async complete(request: AiRequest): Promise<AiResponse> {
      const tried: string[] = []
      for (let index = active; index < candidates.length; index += 1) {
        const candidate = candidates[index]
        const prepared = prepareRequest(request, candidate, originType)
        try {
          if (announced !== index) {
            events.onOnline?.(candidate, index)
            announced = index
          }
          const response = await clientAt(index).complete(prepared)
          active = index
          return response
        } catch (error) {
          tried.push(`${candidate.label} (${describeFailure(error)})`)
          // Người dùng bấm Dừng: agentRunner ném timeout, nhưng KHÔNG được đổi model.
          if (!isFailoverError(error, prepared) || request.signal.aborted) {
            throw error
          }
          const next = candidates[index + 1]
          if (!next) {
            active = index
            break
          }
          events.onSwap?.(candidate, next, error instanceof AiError ? error : new AiError('unknown', describeFailure(error)))
          active = index + 1
        }
      }
      throw new AiError('unknown', `Tất cả model đã thử đều lỗi: ${tried.join(' · ')}`)
    }
  }
}
