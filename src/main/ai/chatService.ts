import type { AiMessage } from './types'
import { AiError } from './types'
import type { ChatChoice, ChatReply } from '@shared/types'
import type { ProjectImportItem } from '@shared/schemas'
import { getSettings, saveLastSelection } from '../services/settingsStore'
import { getModelConnection } from './providerService'
import { createModelClient } from './providers'
import { runAiTask } from './aiTaskRunner'
import { runAgent } from './agentRunner'
import { buildAddPendingAction, getChatTools } from './tools'
import { CHAT_SYSTEM_PROMPT } from './prompts'
import { consumePendingAction, peekPendingAction, cancelPendingAction } from './pendingActions'
import { addProjects, updateProjectWithChanges, deleteProjectById, setProjectLogo } from '../services/projectService'
import { fetchLogoForProject } from '../services/logoService'
import { getProject as repoGetProject } from '../db/projectsRepo'
import { logError } from '../services/logger'
import { broadcastToRenderers } from '../ipc/guard'
import { EVENTS } from '@shared/ipc-channels'
import { enrichWithLinks, parseChatProjectJson } from './chatAdd'
import { assertAiEnabled } from './aiMode'

const CHOICE_TTL_MS = 10 * 60 * 1000
const MAX_USER_CHARS = 30_000

interface ChatSession {
  providerId: string
  modelId: string
  messages: AiMessage[]
}

interface ChoiceContext {
  createdAt: number
  session: ChatSession
  question: string
  label: string
}

let session: ChatSession | null = null

const choiceStore = new Map<string, ChoiceContext>()

export function startNewChatSession(): void {
  session = null
}

function storeChoice(sessionSnapshot: ChatSession, question: string, choices: ChatChoice[]): void {
  for (const choice of choices) {
    choiceStore.set(choice.id, {
      createdAt: Date.now(),
      session: { ...sessionSnapshot, messages: [...sessionSnapshot.messages] },
      question,
      label: choice.label
    })
  }
}

function pruneChoices(): void {
  const now = Date.now()
  for (const [id, context] of Array.from(choiceStore.entries())) {
    if (now - context.createdAt > CHOICE_TTL_MS) {
      choiceStore.delete(id)
    }
  }
}

function getSession(providerId: string, modelId: string): ChatSession {
  if (session && session.providerId === providerId && session.modelId === modelId) {
    return session
  }
  session = { providerId, modelId, messages: [] }
  return session
}

function tryDeterministicAdd(text: string): { reply: ChatReply | null } {
  const parsed = parseChatProjectJson(text)
  if (parsed.kind === 'not-json') {
    return { reply: null }
  }
  if (parsed.kind === 'invalid') {
    return { reply: { message: parsed.message, pendingAction: null, choices: [] } }
  }

  const items: ProjectImportItem[] = parsed.items
  const action = buildAddPendingAction(items, parsed.errors)

  const errorNote = parsed.errors.length > 0 ? ` Bỏ qua ${parsed.errors.length} item không hợp lệ.` : ''
  return {
    reply: {
      message: `Đã đọc danh sách ${items.length} dự án từ JSON.${errorNote} Xác nhận để thêm?`,
      pendingAction: action,
      choices: []
    }
  }
}

function requireModelWithTools(providerId: string, modelId: string) {
  const connection = getModelConnection(providerId, modelId)
  const provider = getSettings().ai.providers.find((entry) => entry.id === providerId)
  const model = provider?.models.find((entry) => entry.id === modelId)
  if (model && !model.supportsTools) {
    throw new AiError('unsupported', 'Model đã chọn không hỗ trợ tool calling, không dùng được Chat')
  }
  return connection
}

async function executeChatTurn(current: ChatSession, userContent: string): Promise<ChatReply> {
  const connection = requireModelWithTools(current.providerId, current.modelId)
  saveLastSelection({ providerId: current.providerId, modelId: current.modelId })

  const client = createModelClient(connection)
  const tools = getChatTools()

  return runAiTask('Chat Box', 'chat', async (outerSignal, reporter) => {
    reporter.report('Phân tích', 0, 1, 'Đang xử lý...')
    // Build the message inside the task so pasted links can be fetched with the
    // task's abort signal before the model is called.
    const enriched = await enrichWithLinks(userContent.slice(0, MAX_USER_CHARS), outerSignal)
    const messages: AiMessage[] = [...current.messages, { role: 'user', content: enriched.text }]

    const result = await runAgent({
      client,
      system: CHAT_SYSTEM_PROMPT,
      messages,
      tools,
      enableWebSearch: false,
      maxTokens: 4096,
      signal: outerSignal
    })

    current.messages = result.outcome === 'submit' ? current.messages : result.messages

    if (result.outcome === 'completed') {
      return { message: result.text, pendingAction: null, choices: [] }
    }
    if (result.outcome === 'choice') {
      storeChoice(current, result.question, result.choices)
      return { message: result.question, pendingAction: null, choices: result.choices }
    }
    if (result.outcome === 'pending_action') {
      return {
        message: `${result.action.summary}. Xác nhận bằng nút OK/Cancel để thực thi.`,
        pendingAction: result.action,
        choices: []
      }
    }
    return { message: 'AI chưa hoàn tất được yêu cầu. Hãy thử lại với yêu cầu rõ ràng hơn.', pendingAction: null, choices: [] }
  })
}

export async function sendChatMessage(input: { text: string; providerId: string; modelId: string }): Promise<ChatReply> {
  assertAiEnabled()
  const current = getSession(input.providerId, input.modelId)

  const deterministic = tryDeterministicAdd(input.text)
  if (deterministic.reply) {
    current.messages = [...current.messages, { role: 'user', content: input.text }]
    current.messages = [
      ...current.messages,
      { role: 'assistant', content: deterministic.reply.message }
    ]
    return deterministic.reply
  }

  return executeChatTurn(current, input.text)
}

export async function chooseChatOption(choiceId: string): Promise<ChatReply> {
  assertAiEnabled()
  pruneChoices()
  const context = choiceStore.get(choiceId)
  if (!context) {
    return { message: 'Lựa chọn đã hết hạn, hãy thử lại.', pendingAction: null, choices: [] }
  }
  choiceStore.delete(choiceId)

  const current = context.session
  session = current

  return executeChatTurn(current, `Tôi chọn: ${context.label}`)
}

function buildAddMessage(addResults: Array<{ name: string; project: { id: string } | null; duplicateOf: string | null; warning?: string | null; error: string | null }>): string {
  const added = addResults.filter((result) => result.project !== null)
  const duplicated = addResults.filter((result) => result.duplicateOf !== null && result.project === null)
  const failed = addResults.filter((result) => result.error !== null)
  const warnings = addResults.filter((result) => result.warning)
  const parts: string[] = []
  if (added.length > 0) {
    parts.push(`Đã thêm ${added.length} dự án`)
  }
  if (duplicated.length > 0) {
    parts.push(`${duplicated.length} trùng (đã có trong app)`)
  }
  if (warnings.length > 0) {
    parts.push(`${warnings.length} cảnh báo: ${warnings.map((result) => result.warning).join('; ')}`)
  }
  if (failed.length > 0) {
    parts.push(`${failed.length} lỗi: ${failed.map((result) => `${result.name} — ${result.error}`).join('; ')}`)
  }
  return parts.length > 0 ? parts.join(', ') : 'Không thêm được dự án nào'
}

async function fetchLogosBestEffort(projectIds: string[]): Promise<void> {
  for (const id of projectIds) {
    try {
      const project = repoGetProject(id)
      if (!project) {
        continue
      }
      const logo = await fetchLogoForProject({
        projectId: project.id,
        website: project.website,
        socialsX: project.socials.x ?? null,
        socialsDiscord: project.socials.discord ?? null,
        socialsTelegram: project.socials.telegram ?? null
      })
      if (logo) {
        setProjectLogo(project.id, logo)
      }
    } catch (error) {
      logError(`Không lấy được logo cho dự án ${id}`, error)
    }
  }
}

export interface ChatConfirmResult {
  message: string
  ok: boolean
}

export async function confirmChatAction(actionId: string): Promise<ChatConfirmResult> {
  const record = peekPendingAction(actionId)
  if (!record) {
    return { ok: false, message: 'Hành động không tồn tại hoặc đã hết hạn (30 phút)' }
  }

  return runAiTask('Xác nhận thao tác', 'confirm', async () => {
    const fresh = peekPendingAction(actionId)
    if (!fresh) {
      return { ok: false, message: 'Hành động không tồn tại hoặc đã hết hạn (30 phút)' }
    }

    const expectedIds = Object.keys(fresh.expectedRowVersions)
    const mismatches: string[] = []
    for (const id of expectedIds) {
      const project = repoGetProject(id)
      if (!project || project.rowVersion !== fresh.expectedRowVersions[id]) {
        mismatches.push(project ? `${project.name} (đã thay đổi)` : `${id} (không tìm thấy)`)
      }
    }

    if (mismatches.length > 0) {
      consumePendingAction(actionId)
      return {
        ok: false,
        message: `${mismatches.map((name) => name).join(', ')} — hãy tải lại danh sách rồi yêu cầu lại`
      }
    }

    const consumed = consumePendingAction(actionId)
    const payload = consumed.payload
    let message = ''

    if (payload.type === 'add') {
      const addResults = addProjects(payload.items, 'chat')
      const addedIds = addResults.flatMap((result) => (result.project ? [result.project.id] : []))
      message = buildAddMessage(addResults)
      await fetchLogosBestEffort(addedIds)
    } else if (payload.type === 'update') {
      try {
        const project = updateProjectWithChanges(payload.projectId, payload.changes, fresh.expectedRowVersions[payload.projectId])
        message = `Đã cập nhật dự án ${project.name}`
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'Không cập nhật được dự án' }
      }
    } else {
      const removed: string[] = []
      const failed: string[] = []
      for (const id of payload.projectIds) {
        try {
          const project = repoGetProject(id)
          deleteProjectById(id)
          removed.push(project ? project.name : id)
        } catch (error) {
          failed.push(error instanceof Error ? error.message : `${id}: lỗi không xác định`)
        }
      }
      message = failed.length > 0 ? `Đã xóa ${removed.length} dự án, ${failed.length} lỗi: ${failed.join('; ')}` : `Đã xóa ${removed.length} dự án (${removed.join(', ')})`
    }

    broadcastToRenderers(EVENTS.dataChanged, { entity: 'projects' })
    return { ok: true, message }
  })
}

export function cancelChatAction(actionId: string): { canceled: boolean } {
  return { canceled: cancelPendingAction(actionId) }
}
