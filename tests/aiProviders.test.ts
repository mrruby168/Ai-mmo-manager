import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() }
}))

import { aiConfigImportSchema } from '../src/shared/schemas'
import type { AiMessage } from '../src/main/ai/types'
import { extractErrorDetail } from '../src/main/ai/types'
import { toOpenAiMessages, toOpenAiTools } from '../src/main/ai/providers/openaiCompatible'
import { toAnthropicMessages, toAnthropicTools } from '../src/main/ai/providers/anthropic'
import { toGoogleContents, toGoogleTools } from '../src/main/ai/providers/google'

const lookupCall = { id: 'call_1', name: 'lookup', arguments: { q: 'mmo' } }

describe('OpenAI-compatible adapter', () => {
  it('maps assistant tool calls and tool results', () => {
    const messages: AiMessage[] = [
      { role: 'user', content: 'Tìm giúp tôi' },
      { role: 'assistant', content: 'Đang kiểm tra', toolCalls: [lookupCall] },
      { role: 'tool', toolCallId: 'call_1', toolName: 'lookup', content: '{"ok":true}' }
    ]

    const mapped = toOpenAiMessages('system', messages)
    expect(mapped).toHaveLength(4)
    expect(mapped[0]).toEqual({ role: 'system', content: 'system' })
    expect(mapped[2]).toMatchObject({
      role: 'assistant',
      content: 'Đang kiểm tra',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"q":"mmo"}' } }]
    })
    expect(mapped[3]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' })
  })

  it('builds function tools', () => {
    const tools = toOpenAiTools([
      { name: 'ping', description: 'ping', parameters: { type: 'object', properties: {} } }
    ])
    expect(tools[0].type).toBe('function')
    expect(tools[0].function.name).toBe('ping')
  })
})

describe('Anthropic adapter', () => {
  it('keeps native assistant blocks and groups tool results', () => {
    const nativeBlocks = [
      { type: 'text', text: 'Đang kiểm tra' },
      { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: { q: 'mmo' } }
    ]
    const messages: AiMessage[] = [
      { role: 'user', content: 'Tìm giúp tôi' },
      {
        role: 'assistant',
        content: 'Đang kiểm tra',
        toolCalls: [{ id: 'toolu_1', name: 'lookup', arguments: { q: 'mmo' } }],
        raw: { provider: 'anthropic', payload: nativeBlocks }
      },
      { role: 'tool', toolCallId: 'toolu_1', toolName: 'lookup', content: '{"ok":true}' },
      { role: 'tool', toolCallId: 'toolu_2', toolName: 'lookup', content: '{"ok":false}' }
    ]

    const mapped = toAnthropicMessages(messages)
    expect(mapped).toHaveLength(3)
    expect(mapped[1].content).toBe(nativeBlocks)
    expect(mapped[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"ok":true}' },
        { type: 'tool_result', tool_use_id: 'toolu_2', content: '{"ok":false}' }
      ]
    })
  })

  it('adds the server web search tool after client tools', () => {
    const tools = toAnthropicTools(
      [{ name: 'ping', description: 'ping', parameters: { type: 'object', properties: {} } }],
      true
    )
    expect(tools[0]).toMatchObject({ name: 'ping', input_schema: { type: 'object' } })
    expect(tools[1]).toMatchObject({ type: 'web_search_20250305', name: 'web_search' })
  })
})

describe('Google adapter', () => {
  it('echoes native parts with thoughtSignature and maps tool responses', () => {
    const nativeParts = [
      { text: 'suy nghĩ', thought: true, thoughtSignature: 'sig-1' },
      { functionCall: { name: 'lookup', args: { q: 'mmo' } }, thoughtSignature: 'sig-2' }
    ]
    const messages: AiMessage[] = [
      { role: 'user', content: 'Tìm giúp tôi' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'lookup', arguments: { q: 'mmo' } }],
        raw: { provider: 'google', payload: nativeParts }
      },
      { role: 'tool', toolCallId: 'call_1', toolName: 'lookup', content: '{"ok":true}' }
    ]

    const contents = toGoogleContents(messages)
    expect(contents).toHaveLength(3)
    expect(contents[1].role).toBe('model')
    expect(contents[1].parts).toBe(nativeParts)
    expect(contents[2]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'lookup', response: { ok: true } } }]
    })
  })

  it('wraps non-object tool output in result', () => {
    const contents = toGoogleContents([{ role: 'tool', toolCallId: 'x', toolName: 'lookup', content: 'plain text' }])
    expect(contents[0].parts[0].functionResponse?.response).toEqual({ result: 'plain text' })
  })

  it('combines function declarations with google_search only when enabled', () => {
    const tools = toGoogleTools(
      [{ name: 'ping', description: 'ping', parameters: { type: 'object', properties: {} } }],
      true
    )
    expect(tools).toHaveLength(2)
    expect(tools[1]).toEqual({ google_search: {} })
    expect(toGoogleTools([], false)).toEqual([])
  })
})

describe('Provider error details', () => {
  it('reads OpenAI, Anthropic and Google error shapes', () => {
    expect(extractErrorDetail({ error: { message: 'bad key', type: 'invalid_request_error', code: 'invalid_api_key' } })).toBe(
      'invalid_request_error · invalid_api_key · bad key'
    )
    expect(extractErrorDetail({ error: { type: 'rate_limit_error', message: 'slow down' } })).toBe(
      'rate_limit_error · slow down'
    )
    expect(extractErrorDetail({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'bad model' } })).toBe(
      'bad model · INVALID_ARGUMENT'
    )
  })
})

describe('AI config import schema', () => {
  it('accepts optional ids and keys', () => {
    const parsed = aiConfigImportSchema.parse({
      schemaVersion: '1.0',
      apiKey: 'secret',
      providers: [
        {
          type: 'openai',
          name: 'OpenAI',
          models: [{ id: 'gpt-5', label: 'GPT-5' }]
        }
      ]
    })
    expect(parsed.providers[0].id).toBeUndefined()
    expect(parsed.providers[0].models[0].supportsTools).toBe(false)
    expect(parsed.providers[0].models[0].costTier).toBe('free')
  })

  it('rejects an unknown provider type and empty models', () => {
    const result = aiConfigImportSchema.safeParse({
      schemaVersion: '1.0',
      providers: [{ type: 'nope', name: 'X', models: [] }]
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0)
    }
  })
})
