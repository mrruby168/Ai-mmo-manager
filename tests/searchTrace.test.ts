import { describe, expect, it } from 'vitest'
import {
  mergeSearchTraces,
  traceFromAnthropicBlocks,
  traceFromGoogleCandidate,
  traceFromOpenAiMessage
} from '../src/main/ai/searchTrace'
import { runAgent } from '../src/main/ai/agentRunner'
import type { ModelClient } from '../src/main/ai/types'

describe('search trace detection', () => {
  it('detects Anthropic server_tool_use and web_search_tool_result blocks', () => {
    const trace = traceFromAnthropicBlocks([
      { type: 'text', text: 'Đang tìm' },
      { type: 'server_tool_use', name: 'web_search', input: { query: 'Alpha Drop' } },
      {
        type: 'web_search_tool_result',
        content: [{ type: 'web_search_result', url: 'https://alpha.example.com/news', title: 'Alpha' }]
      }
    ])

    expect(trace.used).toBe(true)
    expect(trace.sources).toEqual(['https://alpha.example.com/news'])
  })

  it('does not report a trace when Anthropic answered without searching', () => {
    expect(traceFromAnthropicBlocks([{ type: 'text', text: 'Không cần tìm' }])).toEqual({ used: false, sources: [] })
  })

  it('reads OpenAI url_citation annotations', () => {
    const trace = traceFromOpenAiMessage({
      role: 'assistant',
      content: 'Nguồn: alpha.example.com',
      annotations: [
        {
          type: 'url_citation',
          url_citation: { url: 'https://alpha.example.com/news', title: 'Alpha', start_index: 0, end_index: 5 }
        }
      ]
    })

    expect(trace.used).toBe(true)
    expect(trace.sources).toEqual(['https://alpha.example.com/news'])
  })

  it('ignores OpenAI answers without citations', () => {
    expect(traceFromOpenAiMessage({ role: 'assistant', content: 'Không có nguồn' })).toEqual({
      used: false,
      sources: []
    })
  })

  it('reads Gemini grounding metadata', () => {
    const trace = traceFromGoogleCandidate({
      content: { parts: [{ text: 'Kết quả' }] },
      groundingMetadata: {
        webSearchQueries: ['Alpha Drop news'],
        groundingChunks: [{ web: { uri: 'https://alpha.example.com/news', title: 'Alpha' } }]
      }
    })

    expect(trace.used).toBe(true)
    expect(trace.sources).toEqual(['https://alpha.example.com/news'])
  })

  it('reports no trace for a plain Gemini answer', () => {
    expect(traceFromGoogleCandidate({ content: { parts: [{ text: 'OK' }] } })).toEqual({
      used: false,
      sources: []
    })
  })

  it('merges traces without duplicate sources', () => {
    const merged = mergeSearchTraces([
      { used: false, sources: [] },
      { used: true, sources: ['https://a.example.com'] },
      { used: true, sources: ['https://a.example.com', 'https://b.example.com'] }
    ])

    expect(merged).toEqual({ used: true, sources: ['https://a.example.com', 'https://b.example.com'] })
  })

  it('propagates the provider trace through agentRunner', async () => {
    const client: ModelClient = {
      complete: async () => ({
        text: 'xong',
        toolCalls: [],
        usage: null,
        webSearch: { used: true, sources: ['https://alpha.example.com/news'] }
      })
    }

    const result = await runAgent({
      client,
      system: 'test',
      messages: [{ role: 'user', content: 'kiểm tra tin' }],
      tools: [],
      enableWebSearch: true,
      signal: new AbortController().signal
    })

    expect(result.webSearch).toEqual([{ used: true, sources: ['https://alpha.example.com/news'] }])
  })
})
