import { describe, expect, it, vi } from 'vitest'
import type { AgentTool } from '../src/main/ai/agentRunner'
import { AgentStepLimitError, haltWithChoice, haltWithPendingAction, runAgent } from '../src/main/ai/agentRunner'
import type { AiMessage, AiRequest, ModelClient } from '../src/main/ai/types'
import type { PendingAction } from '../src/shared/types'

const action: PendingAction = {
  id: 'act-1',
  type: 'add',
  summary: 'Thêm 1 dự án',
  details: ['+ Alpha'],
  before: null,
  after: null
}

/**
 * OpenAI/Anthropic/Gemini all reject a follow-up request where an assistant
 * `tool_call` has no matching `tool` result (or has two).
 */
function assertEveryToolCallAnswered(messages: AiMessage[]): void {
  const open = new Map<string, number>()
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const call of message.toolCalls ?? []) {
        open.set(call.id, (open.get(call.id) ?? 0) + 1)
      }
    }
    if (message.role === 'tool' && message.toolCallId) {
      const count = open.get(message.toolCallId) ?? 0
      expect(count, `tool result without tool_call: ${message.toolCallId}`).toBeGreaterThan(0)
      open.set(message.toolCallId, count - 1)
    }
  }
  expect([...open.entries()].filter(([, count]) => count > 0)).toEqual([])
}

function tool(name: string, handler: AgentTool['handler']): AgentTool {
  return { name, description: name, parameters: { type: 'object', properties: {} }, handler }
}

function sequentialClient(responses: Array<Partial<Awaited<ReturnType<ModelClient['complete']>>>>) {
  const requests: AiRequest[] = []
  const client: ModelClient = {
    complete: async (request) => {
      requests.push({ ...request, messages: [...request.messages] })
      const next = responses.shift()
      if (!next) {
        throw new Error('Fake model ran out of responses')
      }
      return { text: '', toolCalls: [], usage: null, ...next }
    }
  }
  return { client, requests }
}

describe('agentRunner tool_call bookkeeping', () => {
  it('answers the halting tool_call and skips the rest of the batch', async () => {
    const fetchHandler = vi.fn()
    const { client, requests } = sequentialClient([
      {
        text: '',
        toolCalls: [
          { id: 'call_add', name: 'propose_add_projects', arguments: {} },
          { id: 'call_fetch', name: 'web_fetch', arguments: { url: 'https://example.com' } }
        ]
      },
      { text: 'Đã hiểu', toolCalls: [] }
    ])

    const result = await runAgent({
      client,
      system: 'test',
      messages: [{ role: 'user', content: 'thêm dự án Alpha' }],
      tools: [
        tool('propose_add_projects', () => haltWithPendingAction(action)),
        tool('web_fetch', fetchHandler)
      ],
      signal: new AbortController().signal
    })

    expect(result.outcome).toBe('pending_action')
    if (result.outcome !== 'pending_action') {
      throw new Error('unexpected outcome')
    }

    const toolMessages = result.messages.filter((message) => message.role === 'tool')
    expect(toolMessages).toHaveLength(2)
    expect(JSON.parse(toolMessages[0].content)).toEqual({ status: 'awaiting_user' })
    expect(JSON.parse(toolMessages[1].content)).toEqual({ status: 'skipped', reason: 'Đã dừng để chờ người dùng' })
    expect(fetchHandler).not.toHaveBeenCalled()
    assertEveryToolCallAnswered(result.messages)

    // Simulate the next chat turn: the stored history must be accepted by a provider.
    const second = await runAgent({
      client,
      system: 'test',
      messages: result.messages,
      tools: [],
      signal: new AbortController().signal
    })

    expect(second.outcome).toBe('completed')
    expect(requests).toHaveLength(2)
    assertEveryToolCallAnswered(requests[1].messages)
  })

  it('answers the halting tool_call when the model asked a question', async () => {
    const { client } = sequentialClient([
      {
        text: '',
        toolCalls: [
          { id: 'call_ask', name: 'ask_user_choice', arguments: {} },
          { id: 'call_other', name: 'list_projects', arguments: {} }
        ]
      }
    ])

    const result = await runAgent({
      client,
      system: 'test',
      messages: [{ role: 'user', content: 'thêm X' }],
      tools: [
        tool('ask_user_choice', () => haltWithChoice('Chọn loại', [{ id: 'a', label: 'Airdrop' }])),
        tool('list_projects', () => ({ projects: [] }))
      ],
      signal: new AbortController().signal
    })

    expect(result.outcome).toBe('choice')
    if (result.outcome !== 'choice') {
      throw new Error('unexpected outcome')
    }
    assertEveryToolCallAnswered(result.messages)
  })

  it('stops an unbounded tool-call loop at maxSteps', async () => {
    let counter = 0
    const client: ModelClient = {
      complete: vi.fn(async () => {
        counter += 1
        return {
          text: '',
          toolCalls: [{ id: `call_${counter}`, name: 'loop', arguments: {} }],
          usage: null
        }
      })
    }

    await expect(
      runAgent({
        client,
        system: 'test',
        messages: [{ role: 'user', content: 'loop forever' }],
        tools: [tool('loop', () => ({ ok: true }))],
        signal: new AbortController().signal,
        maxSteps: 3
      })
    ).rejects.toBeInstanceOf(AgentStepLimitError)
    expect(client.complete).toHaveBeenCalledTimes(3)
  })

  it('keeps one tool result per call when no tool halts', async () => {
    const { client } = sequentialClient([
      {
        text: '',
        toolCalls: [
          { id: 'a', name: 'list_projects', arguments: {} },
          { id: 'b', name: 'list_projects', arguments: {} }
        ]
      },
      { text: 'xong', toolCalls: [] }
    ])

    const result = await runAgent({
      client,
      system: 'test',
      messages: [{ role: 'user', content: 'xem danh sách' }],
      tools: [tool('list_projects', () => ({ projects: [] }))],
      signal: new AbortController().signal
    })

    expect(result.outcome).toBe('completed')
    if (result.outcome !== 'completed') {
      throw new Error('unexpected outcome')
    }
    assertEveryToolCallAnswered(result.messages)
    expect(result.messages.filter((message) => message.role === 'tool')).toHaveLength(2)
  })
})
