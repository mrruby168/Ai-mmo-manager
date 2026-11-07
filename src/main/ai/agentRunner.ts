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

export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const maxSteps = input.maxSteps ?? LIMITS.aiMaxSteps
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
        messages,
        tools: toolSpecs,
        enableWebSearch: input.enableWebSearch ?? false,
        signal: input.signal,
        maxTokens
      })
    } catch (error) {
      if (input.signal.aborted) {
        throw new AiError('timeout', 'Đã hủy tác vụ AI')
      }
      throw error
    }

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

  throw new AiError('unknown', `AI vượt quá ${maxSteps} bước mà chưa hoàn tất, hãy thử lại`)
}

export function newTaskId(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}
