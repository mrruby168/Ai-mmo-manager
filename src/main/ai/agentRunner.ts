import { randomUUID } from 'node:crypto'
import { LIMITS } from '@shared/constants'
import type { AiMessage, AiResponse, AiToolSpec, ModelClient } from './types'
import { AiError } from './types'
import type { ChatChoice, PendingAction } from '@shared/types'

export interface AgentToolContext {
  signal: AbortSignal
}

export interface AgentTool extends AiToolSpec {
  handler: (args: Record<string, unknown>, context: AgentToolContext) => Promise<unknown> | unknown
}

export interface AgentUsage {
  inputTokens: number
  outputTokens: number
  /** Web searches reported by the provider for this response. */
  searches: number
}

/** Thrown when the loop runs out of steps; the caller may treat it as one failed batch. */
export class AgentStepLimitError extends AiError {
  constructor(maxSteps: number) {
    super('unknown', `AI vượt quá ${maxSteps} bước mà chưa hoàn tất, hãy thử lại`)
    this.name = 'AgentStepLimitError'
  }
}

export interface CompactToolResults {
  /** Tool results of the last N assistant turns are sent in full. */
  keepFullTurns: number
  /** Older tool results are cut to this many characters. */
  maxChars: number
}

export interface AgentInput {
  client: ModelClient
  system: string
  messages: AiMessage[]
  tools: AgentTool[]
  enableWebSearch?: boolean
  maxSteps?: number
  maxTokens?: number
  signal: AbortSignal
  onStep?: (step: string) => void
  /** Ask the provider to cache system + tools + history between steps. */
  promptCache?: boolean
  /** Shorten stale tool results in the copy sent to the model (stored history stays intact). */
  compactToolResults?: CompactToolResults
  /** Called after every model response, for cost accounting. */
  onUsage?: (usage: AgentUsage) => void
}

export interface AgentWebSearchTrace {
  used: boolean
  sources: string[]
}

export type AgentResult =
  | { outcome: 'completed'; text: string; steps: number; messages: AiMessage[]; webSearch: AgentWebSearchTrace[] }
  | {
      outcome: 'choice'
      question: string
      choices: ChatChoice[]
      messages: AiMessage[]
      webSearch: AgentWebSearchTrace[]
    }
  | { outcome: 'pending_action'; action: PendingAction; messages: AiMessage[]; webSearch: AgentWebSearchTrace[] }
  | { outcome: 'submit'; payload: unknown; webSearch: AgentWebSearchTrace[] }

export const HALT_KIND = {
  choice: 'choice',
  pendingAction: 'pending_action',
  submit: 'submit'
} as const

interface HaltPayload {
  __halt: true
  kind: string
  question?: string
  choices?: ChatChoice[]
  action?: PendingAction
  payload?: unknown
}

export function haltWithChoice(question: string, choices: ChatChoice[]): HaltPayload {
  return { __halt: true, kind: HALT_KIND.choice, question, choices }
}

export function haltWithPendingAction(action: PendingAction): HaltPayload {
  return { __halt: true, kind: HALT_KIND.pendingAction, action }
}

export function haltWithSubmit(payload: unknown): HaltPayload {
  return { __halt: true, kind: HALT_KIND.submit, payload }
}

function asHalt(value: unknown): HaltPayload | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  if (record.__halt !== true || typeof record.kind !== 'string') {
    return null
  }
  return record as unknown as HaltPayload
}

function clipToolResult(content: string): string {
  if (content.length <= LIMITS.aiToolResultMaxChars) {
    return content
  }
  return `${content.slice(0, LIMITS.aiToolResultMaxChars)}…[đã cắt bớt, quá dài]`
}

/**
 * Returns a copy of `messages` where tool results older than the last
 * `keepFullTurns` assistant turns are shortened. Without this, every page the
 * model opened is re-billed as input on every later step.
 */
export function compactToolMessages(messages: AiMessage[], options: CompactToolResults): AiMessage[] {
  const assistantIndexes: number[] = []
  messages.forEach((message, index) => {
    if (message.role === 'assistant') {
      assistantIndexes.push(index)
    }
  })
  const keep = Math.max(1, options.keepFullTurns)
  if (assistantIndexes.length <= keep) {
    return messages
  }
  const cutoff = assistantIndexes[assistantIndexes.length - keep]

  return messages.map((message, index) => {
    if (message.role !== 'tool' || index >= cutoff || message.content.length <= options.maxChars) {
      return message
    }
    const wrapped = message.content.startsWith('<untrusted_web_content')
    const clipped = `${message.content.slice(0, options.maxChars)}…[đã rút gọn, nội dung cũ]`
    return { ...message, content: wrapped ? `${clipped}\n</untrusted_web_content>` : clipped }
  })
}

export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const maxSteps = input.maxSteps ?? LIMITS.aiMaxSteps
  const compaction = input.compactToolResults
  const maxTokens = input.maxTokens ?? 4096
  const messages = [...input.messages]
  const toolsByName = new Map(input.tools.map((tool) => [tool.name, tool]))
  const webSearch: AgentWebSearchTrace[] = []
  const toolSpecs: AiToolSpec[] = input.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }))

  for (let iteration = 1; iteration <= maxSteps; iteration += 1) {
    if (input.signal.aborted) {
      throw new AiError('timeout', 'Đã hủy tác vụ AI')
    }

    input.onStep?.(`Bước ${iteration}/${maxSteps}`)

    let response: AiResponse
    try {
      response = await input.client.complete({
        system: input.system,
        messages: compaction ? compactToolMessages(messages, compaction) : messages,
        tools: toolSpecs,
        enableWebSearch: input.enableWebSearch ?? false,
        signal: input.signal,
        maxTokens,
        ...(input.promptCache ? { promptCache: true } : {})
      })
    } catch (error) {
      if (input.signal.aborted) {
        throw new AiError('timeout', 'Đã hủy tác vụ AI')
      }
      throw error
    }

    input.onUsage?.({
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
      searches: response.searchCount ?? (response.webSearch?.used ? 1 : 0)
    })

    messages.push({
      role: 'assistant',
      content: response.text,
      toolCalls: response.toolCalls,
      raw: response.raw
    })

    webSearch.push(response.webSearch ?? { used: false, sources: [] })

    if (response.toolCalls.length === 0) {
      if (response.text.trim().length === 0) {
        throw new AiError('bad_request', 'Model không trả về nội dung')
      }
      return { outcome: 'completed', text: response.text, steps: iteration, messages, webSearch }
    }

    for (const [index, call] of response.toolCalls.entries()) {
      if (input.signal.aborted) {
        throw new AiError('timeout', 'Đã hủy tác vụ AI')
      }
      input.onStep?.(`Bước ${iteration}/${maxSteps}: ${call.name}`)

      const tool = toolsByName.get(call.name)
      if (!tool) {
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify({ error: `Tool "${call.name}" không tồn tại` })
        })
        continue
      }

      let handlerResult: unknown
      try {
        handlerResult = await tool.handler(
          call.arguments && typeof call.arguments === 'object' ? (call.arguments as Record<string, unknown>) : {},
          { signal: input.signal }
        )
      } catch (error) {
        handlerResult = { error: error instanceof Error ? error.message : 'Lỗi khi thực thi tool' }
      }

      const halt = asHalt(handlerResult)
      if (halt) {
        // Every tool_call in this assistant turn must get exactly one tool_result,
        // otherwise the next request is rejected by OpenAI/Anthropic/Gemini.
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify({ status: 'awaiting_user' })
        })
        for (const pendingCall of response.toolCalls.slice(index + 1)) {
          messages.push({
            role: 'tool',
            toolCallId: pendingCall.id,
            toolName: pendingCall.name,
            content: JSON.stringify({ status: 'skipped', reason: 'Đã dừng để chờ người dùng' })
          })
        }

        if (halt.kind === HALT_KIND.choice && halt.choices) {
          return {
            outcome: 'choice',
            question: halt.question ?? 'Chọn một phương án',
            choices: halt.choices,
            messages,
            webSearch
          }
        }
        if (halt.kind === HALT_KIND.pendingAction && halt.action) {
          return { outcome: 'pending_action', action: halt.action, messages, webSearch }
        }
        if (halt.kind === HALT_KIND.submit) {
          return { outcome: 'submit', payload: halt.payload, webSearch }
        }
        // Unknown halt kind: keep the already-recorded tool results and move on.
        continue
      }

      const content = typeof handlerResult === 'string' ? handlerResult : JSON.stringify(handlerResult)
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        toolName: call.name,
        content: clipToolResult(content)
      })
    }
  }

  throw new AgentStepLimitError(maxSteps)
}

export function newTaskId(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}
