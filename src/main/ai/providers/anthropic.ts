import { logError, logInfo } from '../../services/logger'
import type { AiMessage, AiRequest, AiResponse, AiToolCall, AiToolSpec, ModelClient, ProviderConnection } from '../types'
import { AiError, extractErrorDetail, mapFetchFailure, mapHttpStatus } from '../types'
import { joinEndpoint } from '@shared/provider-presets'
import { traceFromAnthropicBlocks } from '../searchTrace'

const ANTHROPIC_VERSION = '2026-10-21'
const MAX_PAUSE_CONTINUATIONS = 2

export type AnthropicContentBlock = Record<string, unknown>

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: AnthropicContentBlock[]
}

export type AnthropicTool = {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export const ANTHROPIC_WEB_SEARCH_TOOL: AnthropicContentBlock = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

export function toAnthropicMessages(messages: AiMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = []
  let pendingToolResults: AnthropicContentBlock[] = []

  function flushToolResults(): void {
    if (pendingToolResults.length === 0) {
      return
    }
    result.push({ role: 'user', content: pendingToolResults })
    pendingToolResults = []
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: message.toolCallId ?? '',
        content: message.content
      })
      continue
    }

    flushToolResults()

    if (message.role === 'assistant') {
      if (message.raw?.provider === 'anthropic' && Array.isArray(message.raw.payload)) {
        result.push({ role: 'assistant', content: message.raw.payload as AnthropicContentBlock[] })
        continue
      }
      const content: AnthropicContentBlock[] = []
      if (message.content.length > 0) {
        content.push({ type: 'text', text: message.content })
      }
      for (const call of message.toolCalls ?? []) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments ?? {} })
      }
      if (content.length > 0) {
        result.push({ role: 'assistant', content })
      }
      continue
    }

    result.push({ role: 'user', content: [{ type: 'text', text: message.content }] })
  }

  flushToolResults()
  return result
}

export function toAnthropicTools(tools: AiToolSpec[], enableWebSearch: boolean): AnthropicContentBlock[] {
  const result: AnthropicContentBlock[] = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  }))
  if (enableWebSearch) {
    result.push(ANTHROPIC_WEB_SEARCH_TOOL)
  }
  return result
}

function buildHeaders(connection: ProviderConnection): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': ANTHROPIC_VERSION
  }
  if (connection.apiKey.trim().length > 0) {
    headers['x-api-key'] = connection.apiKey.trim()
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

function readText(blocks: AnthropicContentBlock[]): string {
  return blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n')
}

function readToolCalls(blocks: AnthropicContentBlock[]): AiToolCall[] {
  const calls: AiToolCall[] = []
  blocks.forEach((block, index) => {
    if (block.type !== 'tool_use') {
      return
    }
    const name = typeof block.name === 'string' ? block.name : ''
    if (name.length === 0) {
      return
    }
    const id = typeof block.id === 'string' && block.id.length > 0 ? block.id : `toolu_${index + 1}`
    calls.push({ id, name, arguments: asRecord(block.input) ?? block.input ?? {} })
  })
  return calls
}

export function createAnthropicClient(connection: ProviderConnection): ModelClient {
  const endpoint = joinEndpoint(connection.baseUrl, '/messages')

  return {
    async complete(request: AiRequest): Promise<AiResponse> {
      const workingMessages = toAnthropicMessages(request.messages)
      const body: Record<string, unknown> = {
        model: connection.modelId,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: workingMessages
      }

      const enableWebSearch = request.enableWebSearch && connection.supportsWebSearch
      const tools =
        request.tools.length > 0 || enableWebSearch ? toAnthropicTools(request.tools, enableWebSearch) : []
      if (tools.length > 0) {
        body.tools = tools
      }

      const accumulatedBlocks: AnthropicContentBlock[] = []
      let accumulatedText = ''
      let inputTokens = 0
      let outputTokens = 0

      for (let attempt = 0; attempt <= MAX_PAUSE_CONTINUATIONS; attempt += 1) {
        let response: Response
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: buildHeaders(connection),
            body: JSON.stringify(body),
            signal: request.signal
          })
        } catch (error) {
          logError('Gọi Anthropic thất bại', error)
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

        const record = asRecord(data)
        if (!record) {
          throw new AiError('unknown', 'Anthropic trả về dữ liệu không phải JSON', String(data).slice(0, 500))
        }

        const rawBlocks = Array.isArray(record.content) ? record.content : []
        const blocks = rawBlocks.map((block) => asRecord(block)).filter((block): block is AnthropicContentBlock => block !== null)
        accumulatedBlocks.push(...blocks)
        accumulatedText += readText(blocks)

        const usage = asRecord(record.usage)
        if (usage) {
          if (typeof usage.input_tokens === 'number') {
            inputTokens += usage.input_tokens
          }
          if (typeof usage.output_tokens === 'number') {
            outputTokens += usage.output_tokens
          }
        }

        if (record.stop_reason === 'pause_turn') {
          if (attempt === MAX_PAUSE_CONTINUATIONS) {
            throw new AiError('timeout', 'Anthropic tạm dừng quá nhiều lần để hoàn tất tìm kiếm, thử lại sau')
          }
          workingMessages.push({ role: 'assistant', content: blocks })
          body.messages = workingMessages
          continue
        }

        const toolCalls = readToolCalls(accumulatedBlocks)
        if (accumulatedText.length === 0 && toolCalls.length === 0) {
          const stop = typeof record.stop_reason === 'string' ? ` (stop_reason: ${record.stop_reason})` : ''
          throw new AiError('bad_request', `Anthropic không trả về nội dung${stop}`, extractErrorDetail(record.error))
        }

        const webSearch = traceFromAnthropicBlocks(accumulatedBlocks)
        if (request.enableWebSearch) {
          logInfo(
            `Web search (anthropic/${connection.modelId}): used=${webSearch.used} sources=${webSearch.sources.length}`
          )
        }

        return {
          text: accumulatedText,
          toolCalls,
          usage: inputTokens + outputTokens > 0 ? { inputTokens, outputTokens } : null,
          raw: { provider: 'anthropic', payload: accumulatedBlocks },
          webSearch
        }
      }

      throw new AiError('unknown', 'Anthropic không hoàn tất phản hồi')
    }
  }
}
