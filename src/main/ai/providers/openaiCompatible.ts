import { logError, logInfo } from '../../services/logger'
import type { AiMessage, AiRequest, AiResponse, AiToolCall, AiToolSpec, ModelClient, ProviderConnection } from '../types'
import { AiError, extractErrorDetail, mapFetchFailure, mapHttpStatus } from '../types'
import { joinEndpoint } from '@shared/provider-presets'
import { traceFromOpenAiMessage } from '../searchTrace'

interface OpenAiToolCall {
  id?: unknown
  type?: unknown
  function?: { name?: unknown; arguments?: unknown }
}

interface OpenAiMessage {
  content?: unknown
  tool_calls?: unknown
}

interface OpenAiChoice {
  message?: OpenAiMessage
  finish_reason?: unknown
}

interface OpenAiResponseBody {
  choices?: unknown
  usage?: unknown
  error?: unknown
}

export interface OpenAiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

export type OpenAiTool = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export function toOpenAiMessages(system: string, messages: AiMessage[]): OpenAiChatMessage[] {
  const result: OpenAiChatMessage[] = [{ role: 'system', content: system }]
  for (const message of messages) {
    if (message.role === 'tool') {
      result.push({
        role: 'tool',
        tool_call_id: message.toolCallId ?? '',
        content: message.content
      })
      continue
    }

    if (message.role === 'assistant') {
      const toolCalls = message.toolCalls ?? []
      const entry: OpenAiChatMessage = {
        role: 'assistant',
        content: message.content.length > 0 ? message.content : null
      }
      if (toolCalls.length > 0) {
        entry.tool_calls = toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) }
        }))
      }
      result.push(entry)
      continue
    }

    result.push({ role: 'user', content: message.content })
  }
  return result
}

export function toOpenAiTools(tools: AiToolSpec[]): OpenAiTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters }
  }))
}

function buildHeaders(connection: ProviderConnection): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (connection.apiKey.trim().length > 0) {
    headers.authorization = `Bearer ${connection.apiKey.trim()}`
  }
  const customHeaders: Record<string, string> = connection.headers ?? {}
  for (const [key, value] of Object.entries(customHeaders)) {
    for (const existing of Object.keys(headers)) {
      if (existing.toLowerCase() === key.toLowerCase()) {
        delete headers[existing]
      }
    }
    headers[key] = value
  }
  return headers
}

function readTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text
        }
        return ''
      })
      .join('')
  }
  return ''
}

function parseToolCalls(raw: unknown): AiToolCall[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const calls: AiToolCall[] = []
  raw.forEach((entry, index) => {
    const toolCall = entry as OpenAiToolCall
    const name = toolCall.function?.name
    if (typeof name !== 'string' || name.length === 0) {
      return
    }
    const id = typeof toolCall.id === 'string' && toolCall.id.length > 0 ? toolCall.id : `call_${index + 1}`
    const rawArguments = toolCall.function?.arguments
    let args: unknown = {}
    if (typeof rawArguments === 'string' && rawArguments.trim().length > 0) {
      try {
        args = JSON.parse(rawArguments) as unknown
      } catch {
        throw new AiError('bad_request', 'Model trả về tham số tool không phải JSON hợp lệ', rawArguments.slice(0, 500))
      }
    } else if (rawArguments && typeof rawArguments === 'object') {
      args = rawArguments
    }
    calls.push({ id, name, arguments: args })
  })
  return calls
}

export function createOpenAiCompatibleClient(
  connection: ProviderConnection,
  options: { useMaxCompletionTokens?: boolean } = {}
): ModelClient {
  const endpoint = joinEndpoint(connection.baseUrl, '/chat/completions')

  return {
    async complete(request: AiRequest): Promise<AiResponse> {
      const body: Record<string, unknown> = {
        model: connection.modelId,
        messages: toOpenAiMessages(request.system, request.messages)
      }

      if (options.useMaxCompletionTokens) {
        body.max_completion_tokens = request.maxTokens
      } else {
        body.max_tokens = request.maxTokens
      }

      if (request.tools.length > 0) {
        body.tools = toOpenAiTools(request.tools)
      }
      if (request.enableWebSearch && connection.supportsWebSearch) {
        body.web_search_options = {}
      }

      let response: Response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: buildHeaders(connection),
          body: JSON.stringify(body),
          signal: request.signal
        })
      } catch (error) {
        logError(`Gọi ${connection.providerType} thất bại`, error)
        throw mapFetchFailure(error, connection.modelId)
      }

      const text = await response.text()
      let data: unknown = null
      try {
        data = text.length > 0 ? (JSON.parse(text) as unknown) : null
      } catch {
        data = text.slice(0, 1200)
      }

      if (!response.ok) {
        throw mapHttpStatus(response.status, extractErrorDetail(data))
      }

      if (!data || typeof data !== 'object') {
        throw new AiError('unknown', 'Provider trả về dữ liệu không phải JSON', String(data).slice(0, 500))
      }

      const parsed = data as OpenAiResponseBody
      if (!Array.isArray(parsed.choices) || parsed.choices.length === 0) {
        throw new AiError('unknown', 'Provider không trả về lựa chọn nào', extractErrorDetail(parsed.error))
      }

      const choice = parsed.choices[0] as OpenAiChoice
      const message = choice.message ?? {}
      const content = readTextContent(message.content)
      const toolCalls = parseToolCalls(message.tool_calls)

      if (content.length === 0 && toolCalls.length === 0) {
        const finish = typeof choice.finish_reason === 'string' ? ` (finish_reason: ${choice.finish_reason})` : ''
        throw new AiError('bad_request', `Model không trả về nội dung${finish}`, null)
      }

      let usage: AiResponse['usage'] = null
      if (parsed.usage && typeof parsed.usage === 'object') {
        const usageRecord = parsed.usage as Record<string, unknown>
        if (typeof usageRecord.prompt_tokens === 'number' && typeof usageRecord.completion_tokens === 'number') {
          usage = { inputTokens: usageRecord.prompt_tokens, outputTokens: usageRecord.completion_tokens }
        }
      }

      const webSearch = traceFromOpenAiMessage(message)
      if (request.enableWebSearch) {
        logInfo(`Web search (${connection.providerType}/${connection.modelId}): used=${webSearch.used} sources=${webSearch.sources.length}`)
      }

      return { text: content, toolCalls, usage, webSearch }
    }
  }
}
