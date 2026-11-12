import { describe, expect, it, vi } from 'vitest'
import { createFailoverClient, isFailoverError } from '../src/main/ai/failoverClient'
import type { FailoverCandidate } from '../src/main/ai/failoverClient'
import { AiError } from '../src/main/ai/types'
import type { AiRequest, AiResponse, ModelClient } from '../src/main/ai/types'

function makeRequest(overrides: Partial<AiRequest> = {}): AiRequest {
  return {
    system: 'system',
    messages: [{ role: 'user', content: 'hello' }],
    tools: [],
    enableWebSearch: false,
    signal: new AbortController().signal,
    maxTokens: 100,
    ...overrides
  }
}

function response(text: string): AiResponse {
  return { text, toolCalls: [], usage: null }
}

function candidate(
  label: string,
  complete: ModelClient['complete'],
  options: Partial<Pick<FailoverCandidate, 'providerType' | 'supportsTools' | 'supportsWebSearch'>> = {}
): FailoverCandidate {
  return {
    label,
    providerType: options.providerType ?? 'openai',
    supportsTools: options.supportsTools ?? true,
    supportsWebSearch: options.supportsWebSearch ?? true,
    createClient: () => ({ complete })
  }
}

describe('createFailoverClient', () => {
  it('swaps to A2 on quota and stays there for later calls', async () => {
    const a1 = vi.fn<ModelClient['complete']>().mockRejectedValue(new AiError('quota', 'Hết hạn mức'))
    const a2 = vi.fn<ModelClient['complete']>().mockResolvedValue(response('ok'))
    const onSwap = vi.fn()
    const client = createFailoverClient([candidate('A1', a1), candidate('A2', a2)], { onSwap })

    await expect(client.complete(makeRequest())).resolves.toEqual(response('ok'))
    await expect(client.complete(makeRequest())).resolves.toEqual(response('ok'))

    expect(a1).toHaveBeenCalledTimes(1)
    expect(a2).toHaveBeenCalledTimes(2)
    expect(onSwap).toHaveBeenCalledTimes(1)
    expect(onSwap.mock.calls[0][1].label).toBe('A2')
  })

  it('walks A1 → A2 → A3 and reports the online model', async () => {
    const online: string[] = []
    const client = createFailoverClient(
      [
        candidate('A1', vi.fn<ModelClient['complete']>().mockRejectedValue(new AiError('rate_limit', '429'))),
        candidate('A2', vi.fn<ModelClient['complete']>().mockRejectedValue(new AiError('network', 'mất mạng'))),
        candidate('A3', vi.fn<ModelClient['complete']>().mockResolvedValue(response('A3 ok')))
      ],
      { onOnline: (entry) => online.push(entry.label) }
    )

    await expect(client.complete(makeRequest())).resolves.toEqual(response('A3 ok'))
    expect(online).toEqual(['A1', 'A2', 'A3'])
  })

  it('throws a combined error without leaking a key when the whole chain fails', async () => {
    const key = 'sk-secret-key-1234567890123'
    const client = createFailoverClient([
      candidate('A1', vi.fn<ModelClient['complete']>().mockRejectedValue(new AiError('auth', 'API Key không hợp lệ', key))),
      candidate('A2', vi.fn<ModelClient['complete']>().mockRejectedValue(new AiError('timeout', 'quá giờ')))
    ])

    const error = await client.complete(makeRequest()).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(AiError)
    const message = (error as AiError).message
    expect(message).toContain('A1')
    expect(message).toContain('A2')
    expect(message).not.toContain(key)
  })

  it('does not swap when the user cancelled (signal aborted)', async () => {
    const controller = new AbortController()
    const a1 = vi.fn<ModelClient['complete']>().mockImplementation(async () => {
      controller.abort()
      throw new AiError('timeout', 'Đã dừng')
    })
    const a2 = vi.fn<ModelClient['complete']>().mockResolvedValue(response('A2'))
    const client = createFailoverClient([candidate('A1', a1), candidate('A2', a2)])

    const error = await client.complete(makeRequest({ signal: controller.signal })).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('timeout')
    expect(a2).not.toHaveBeenCalled()
  })

  it('swaps on bad_request only when the request carries tools', async () => {
    const tool = { name: 'submit_news', description: 'd', parameters: {} }
    const a1 = vi.fn<ModelClient['complete']>().mockRejectedValue(new AiError('bad_request', 'schema tool sai'))
    const a2 = vi.fn<ModelClient['complete']>().mockResolvedValue(response('A2'))

    const withTools = createFailoverClient([candidate('A1', a1), candidate('A2', a2)])
    await expect(withTools.complete(makeRequest({ tools: [tool] }))).resolves.toEqual(response('A2'))

    const withoutTools = createFailoverClient([candidate('A1', a1), candidate('A2', a2)])
    await expect(withoutTools.complete(makeRequest())).rejects.toBeInstanceOf(AiError)
    expect(isFailoverError(new AiError('bad_request', 'x'), { tools: [] })).toBe(false)
    expect(isFailoverError(new AiError('bad_request', 'x'), { tools: [tool] })).toBe(true)
  })

  it('drops raw history when the next model belongs to another provider type', async () => {
    const seen: AiRequest[] = []
    const a1 = vi.fn<ModelClient['complete']>().mockRejectedValue(new AiError('quota', 'hết'))
    const a2 = vi.fn<ModelClient['complete']>().mockImplementation(async (request: AiRequest) => {
      seen.push(request)
      return response('A2')
    })
    const request = makeRequest({
      messages: [
        { role: 'assistant', content: 'cũ', raw: { provider: 'openai', payload: { id: 'x' } } },
        { role: 'user', content: 'mới' }
      ]
    })

    const client = createFailoverClient([
      candidate('A1', a1, { providerType: 'openai' }),
      candidate('A2', a2, { providerType: 'anthropic' })
    ])
    await client.complete(request)

    expect(seen[0].messages[0].raw).toBeUndefined()
    expect(seen[0].messages[1]).toEqual({ role: 'user', content: 'mới' })
  })

  it('keeps raw history when the next model uses the same provider type', async () => {
    const seen: AiRequest[] = []
    const client = createFailoverClient([
      candidate('A1', vi.fn<ModelClient['complete']>().mockRejectedValue(new AiError('quota', 'hết'))),
      candidate(
        'A2',
        vi.fn<ModelClient['complete']>().mockImplementation(async (request: AiRequest) => {
          seen.push(request)
          return response('A2')
        })
      )
    ])

    await client.complete(
      makeRequest({ messages: [{ role: 'assistant', content: 'cũ', raw: { provider: 'openai', payload: { id: 'x' } } }] })
    )
    expect(seen[0].messages[0].raw).toEqual({ provider: 'openai', payload: { id: 'x' } })
  })

  it('resets web search and tools to what the active model supports', async () => {
    const seen: AiRequest[] = []
    const client = createFailoverClient([
      candidate('A1', vi.fn<ModelClient['complete']>().mockRejectedValue(new AiError('quota', 'hết'))),
      candidate(
        'A2',
        vi.fn<ModelClient['complete']>().mockImplementation(async (request: AiRequest) => {
          seen.push(request)
          return response('A2')
        }),
        { supportsTools: false, supportsWebSearch: false }
      )
    ])

    await client.complete(
      makeRequest({ enableWebSearch: true, tools: [{ name: 't', description: 'd', parameters: {} }] })
    )
    expect(seen[0].enableWebSearch).toBe(false)
    expect(seen[0].tools).toEqual([])
  })

  it('refuses to run without any model', () => {
    expect(() => createFailoverClient([])).toThrowError(/Model Configuration/)
  })
})
