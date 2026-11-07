import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { runAgent } from '../src/main/ai/agentRunner'
import { buildAddPendingAction, getChatTools } from '../src/main/ai/tools'
import { clearPendingActions, peekPendingAction } from '../src/main/ai/pendingActions'
import { CHAT_SYSTEM_PROMPT } from '../src/main/ai/prompts'
import type { AiRequest, ModelClient } from '../src/main/ai/types'
import type { ProjectImportItem } from '../src/shared/schemas'

const alpha: ProjectImportItem = {
  category: 'airdrop',
  name: 'Alpha Drop',
  website: 'https://alpha.example.com',
  socials: { x: 'https://x.com/alpha' },
  taskSummary: 'Làm nhiệm vụ',
  howToJoin: 'Kết nối ví',
  costType: 'free',
  verification: 'unverified'
} as ProjectImportItem

beforeEach(() => {
  clearPendingActions()
})

describe('CHAT_SYSTEM_PROMPT', () => {
  it('no longer limits the assistant to project CRUD', () => {
    expect(CHAT_SYSTEM_PROMPT).not.toContain('Bạn chỉ có thể')
    expect(CHAT_SYSTEM_PROMPT).toContain('Trả lời tự nhiên')
  })

  it('keeps the shared core rules and the tool/OK contract', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('### VAI TRÒ')
    expect(CHAT_SYSTEM_PROMPT).toContain('### BỐI CẢNH')
    expect(CHAT_SYSTEM_PROMPT).toContain('### QUY TẮC')
    expect(CHAT_SYSTEM_PROMPT).toContain('### CÔNG CỤ')
    expect(CHAT_SYSTEM_PROMPT).toContain('### ĐỊNH DẠNG ĐẦU RA')
    expect(CHAT_SYSTEM_PROMPT).toContain('<untrusted_web_content>')
    expect(CHAT_SYSTEM_PROMPT).toContain('list_projects')
    expect(CHAT_SYSTEM_PROMPT).toContain('get_project')
    expect(CHAT_SYSTEM_PROMPT).toContain('propose_add_projects')
    expect(CHAT_SYSTEM_PROMPT).toContain('ask_user_choice')
    expect(CHAT_SYSTEM_PROMPT).toContain('OK')
  })
})

describe('buildAddPendingAction', () => {
  it('builds the add action and stores the payload in the pending action store', () => {
    const action = buildAddPendingAction([alpha], ['Beta: thiếu tên'])

    expect(action.type).toBe('add')
    expect(action.summary).toBe('Thêm 1 dự án')
    expect(action.before).toBeNull()
    expect(action.after).toContain('Alpha Drop')
    expect(action.details).toEqual(expect.arrayContaining([expect.stringContaining('Alpha Drop')]))
    expect(action.details.join('\n')).toContain('Bỏ qua 1 item không hợp lệ')

    const record = peekPendingAction(action.id)
    expect(record?.payload).toEqual({ type: 'add', items: [alpha] })
  })
})

describe('propose_add_projects tool', () => {
  it('returns a pending action with the same shape as the shared builder', () => {
    const tool = getChatTools().find((entry) => entry.name === 'propose_add_projects')
    expect(tool).toBeDefined()

    const raw = tool!.handler({ projects: [alpha] }, { signal: new AbortController().signal })
    const halt = raw as { __halt: true; kind: string; action: { id: string; summary: string; details: string[] } }

    expect(halt.__halt).toBe(true)
    expect(halt.kind).toBe('pending_action')
    expect(halt.action.summary).toBe('Thêm 1 dự án')

    const reference = buildAddPendingAction([alpha])
    expect(halt.action.details).toEqual(reference.details)

    const record = peekPendingAction(halt.action.id)
    expect(record?.payload).toEqual({ type: 'add', items: [alpha] })
  })

  it('rejects a proposal with no valid project', () => {
    const tool = getChatTools().find((entry) => entry.name === 'propose_add_projects')!
    const raw = tool.handler({ projects: [{ name: '' }] }, { signal: new AbortController().signal })
    const parsed = JSON.parse(raw as string) as { error?: string }

    expect(parsed.error).toBeTruthy()
    expect(peekPendingAction('missing')).toBeNull()
  })
})

describe('chat flow with a fake model', () => {
  it('turns a propose_add_projects tool call into one pending action', async () => {
    const requests: AiRequest[] = []
    const client: ModelClient = {
      complete: async (request) => {
        requests.push(request)
        return {
          text: '',
          toolCalls: [{ id: 'call_add', name: 'propose_add_projects', arguments: { projects: [alpha] } }],
          usage: null
        }
      }
    }

    const result = await runAgent({
      client,
      system: CHAT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'thêm dự án Alpha Drop' }],
      tools: getChatTools(),
      signal: new AbortController().signal
    })

    expect(result.outcome).toBe('pending_action')
    if (result.outcome !== 'pending_action') {
      throw new Error('unexpected outcome')
    }

    expect(requests).toHaveLength(1)
    expect(requests[0].tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['list_projects', 'propose_add_projects', 'ask_user_choice'])
    )
    expect(result.action.summary).toBe('Thêm 1 dự án')
    expect(peekPendingAction(result.action.id)?.payload).toEqual({ type: 'add', items: [alpha] })
  })

  it('does not claim a CRUD result when the model only returns prose', async () => {
    const client: ModelClient = {
      complete: async () => ({
        text: 'Mình có thể giúp gì cho bạn?',
        toolCalls: [],
        usage: null
      })
    }

    const result = await runAgent({
      client,
      system: CHAT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'xin chào' }],
      tools: getChatTools(),
      signal: new AbortController().signal
    })

    expect(result.outcome).toBe('completed')
    expect(result.outcome === 'completed' ? result.text : '').not.toContain('Đã thêm')
  })
})

describe('single PendingAction factory for add', () => {
  it('chatService no longer calls createPendingAction', () => {
    const source = readFileSync('src/main/ai/chatService.ts', 'utf8')
    expect(source).not.toContain('createPendingAction')
    expect(source).toContain('buildAddPendingAction')
  })
})
