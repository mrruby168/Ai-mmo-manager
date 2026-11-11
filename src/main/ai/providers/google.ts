import { logError, logInfo } from '../../services/logger'
import type { AiMessage, AiRequest, AiResponse, AiToolCall, AiToolSpec, ModelClient, ProviderConnection } from '../types'
import { AiError, extractErrorDetail, mapFetchFailure, mapHttpStatus } from '../types'
import { joinEndpoint } from '@shared/provider-presets'
import { countGoogleSearches, traceFromGoogleCandidate } from '../searchTrace'

export interface GooglePart {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  functionCall?: { id?: string; name?: string; args?: unknown }
  functionResponse?: { id?: string; name?: string; response?: unknown }
  [key: string]: unknown
}

export interface GoogleContent {
  role: 'user' | 'model'
  parts: GooglePart[]
}

export type GoogleTool = Record<string, unknown>

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function toolResponseValue(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content) as unknown
    const record = asRecord(parsed)
    if (record) {
      return record
    }
    return { result: parsed }
  } catch {
    return { result: content }
  }
}

export function toGoogleContents(messages: AiMessage[]): GoogleContent[] {
  const result: GoogleContent[] = []
  let pendingToolParts: GooglePart[] = []

  function flushToolResults(): void {
    if (pendingToolParts.length === 0) {
      return
    }
    result.push({ role: 'user', parts: pendingToolParts })
    pendingToolParts = []
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      pendingToolParts.push({
        functionResponse: {
          name: message.toolName ?? '',
          response: toolResponseValue(message.content)
        }
      })
      continue
    }

    flushToolResults()

    if (message.role === 'assistant') {
      if (message.raw?.provider === 'google' && Array.isArray(message.raw.payload)) {
        result.push({ role: 'model', parts: message.raw.payload as GooglePart[] })
        continue
      }
      const parts: GooglePart[] = []
      if (message.content.length > 0) {
        parts.push({ text: message.content })
      }
      for (const call of message.toolCalls ?? []) {
        parts.push({ functionCall: { name: call.name, args: call.arguments ?? {} } })
      }
      if (parts.length > 0) {
        result.push({ role: 'model', parts })
      }
      continue
    }

    result.push({ role: 'user', parts: [{ text: message.content }] })
  }

  flushToolResults()
  return result
}

export function toGoogleTools(tools: AiToolSpec[], enableWebSearch: boolean): GoogleTool[] {
  const result: GoogleTool[] = []
  if (tools.length > 0) {
    result.push({
      functionDeclarations: tools.map((tool) => {
        const parameters = tool.parameters as Record<string, unknown>
        const properties = parameters.properties
        const required = parameters.required
        const hasProperties = !!properties && typeof properties === 'object' && Object.keys(properties).length > 0
        const hasRequired = Array.isArray(required) && required.length > 0
        return {
          name: tool.name,
          description: tool.description,
          // Gemini rejects `parameters: { type: 'object', properties: {} }` for
          // tools that take no arguments; omit the field entirely.
          ...(hasProperties || hasRequired ? { parameters } : {})
        }
      })
    })
  }
  if (enableWebSearch) {
    result.push({ google_search: {} })
  }
  return result
}

function buildHeaders(connection: ProviderConnection): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (connection.apiKey.trim().length > 0) {
    headers['x-goog-api-key'] = connection.apiKey.trim()
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

function readParts(rawParts: unknown): GooglePart[] {
  if (!Array.isArray(rawParts)) {
    return []
  }
  return rawParts.map((part) => asRecord(part)).filter((part): part is GooglePart => part !== null)
}

function readVisibleText(parts: GooglePart[]): string {
  return parts
    .filter((part) => part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('')
}

function readToolCalls(parts: GooglePart[]): AiToolCall[] {
  const calls: AiToolCall[] = []
  parts.forEach((part, index) => {
    const call = part.functionCall
    if (!call || typeof call.name !== 'string' || call.name.length === 0) {
      return
    }
    const id = typeof call.id === 'string' && call.id.length > 0 ? call.id : `call_${index + 1}`
    calls.push({ id, name: call.name, arguments: call.args ?? {} })
  })
  return calls
}

export function createGoogleClient(connection: ProviderConnection): ModelClient {
  const root = joinEndpoint(connection.baseUrl, '')
  const modelId = connection.modelId.replace(/^models\//, '')
  const endpoint = `${root}/models/${encodeURIComponent(modelId)}:generateContent`

  return {
    async complete(request: AiRequest): Promise<AiResponse> {
      const enableWebSearch = request.enableWebSearch && connection.supportsWebSearch
      const tools = toGoogleTools(request.tools, enableWebSearch)
      const body: Record<string, unknown> = {
        contents: toGoogleContents(request.messages),
        systemInstruction: { parts: [{ text: request.system }] },
        generationConfig: { maxOutputTokens: request.maxTokens }
      }
      if (tools.length > 0) {
        body.tools = tools
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
        logError('Gọi Google Gemini thất bại', error)
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
        throw new AiError('unknown', 'Gemini trả về dữ liệu không phải JSON', String(data).slice(0, 500))
      }

      const candidates = Array.isArray(record.candidates) ? record.candidates : []
      if (candidates.length === 0) {
        const feedback = asRecord(record.promptFeedback)
        const reason = feedback && typeof feedback.blockReason === 'string' ? feedback.blockReason : null
        throw new AiError(
          'bad_request',
          reason ? `Gemini chặn yêu cầu (${reason})` : 'Gemini không trả về kết quả nào',
          extractErrorDetail(record.error)
        )
      }

      const candidate = asRecord(candidates[0]) ?? {}
      const content = asRecord(candidate.content)
      const parts = readParts(content?.parts)
      const visibleText = readVisibleText(parts)
      const toolCalls = readToolCalls(parts)
      const finishReason = typeof candidate.finishReason === 'string' ? candidate.finishReason : null

      if (visibleText.length === 0 && toolCalls.length === 0) {
        throw new AiError(
          'bad_request',
          finishReason ? `Gemini không trả về nội dung (finishReason: ${finishReason})` : 'Gemini không trả về nội dung',
          null
        )
      }

      let usage: AiResponse['usage'] = null
      const usageMetadata = asRecord(record.usageMetadata)
      if (
        usageMetadata &&
        typeof usageMetadata.promptTokenCount === 'number' &&
        typeof usageMetadata.candidatesTokenCount === 'number'
      ) {
        usage = {
          inputTokens: usageMetadata.promptTokenCount,
          outputTokens: usageMetadata.candidatesTokenCount
        }
      }

      const webSearch = traceFromGoogleCandidate(candidate)
      if (request.enableWebSearch) {
        logInfo(`Web search (google/${connection.modelId}): used=${webSearch.used} sources=${webSearch.sources.length}`)
      }

      return {
        text: visibleText,
        toolCalls,
        usage,
        raw: { provider: 'google', payload: parts },
        webSearch,
        searchCount: countGoogleSearches(candidate)
      }
    }
  }
}
