import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { ZodError } from 'zod'
import type { ProviderType } from '@shared/constants'
import { todayDateOnly } from '@shared/date-utils'
import { aiConfigImportSchema, providerConfigSchema, providerSaveSchema } from '@shared/schemas'
import { normaliseBaseUrl, resolveBaseUrl } from '@shared/provider-presets'
import type {
  AiSettings,
  AiTask,
  ModelSelection,
  ProviderConfig,
  ProviderModel,
  ProviderTestResult,
  ProviderView
} from '@shared/types'
import { logInfo } from '../services/logger'
import {
  deleteProviderSecret,
  getProviderSecret,
  hasProviderSecret,
  isEncryptionAvailable,
  saveProviderSecret
} from '../services/secretStore'
import { getSettings, saveAiSettings } from '../services/settingsStore'
import { createModelClient } from './providers'
import { AiError } from './types'
import { assertAiEnabled } from './aiMode'
import type { AiToolSpec, ProviderConnection } from './types'

const MAX_PROVIDERS = 20
const TEST_TIMEOUT_MS = 45_000

export type ProviderErrorCode =
  | 'NOT_FOUND'
  | 'API_KEY_REQUIRED'
  | 'INVALID_CONFIG'
  | 'ENCRYPTION_UNAVAILABLE'

export class ProviderError extends Error {
  readonly code: ProviderErrorCode

  constructor(code: ProviderErrorCode, message: string) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
  }
}

interface ProviderSecretInput {
  id: string
  apiKey?: string
  headers?: Record<string, string>
}

const PING_TOOL: AiToolSpec = {
  name: 'ping',
  description: 'Trả về pong. Chỉ dùng để kiểm tra khả năng gọi tool.',
  parameters: { type: 'object', properties: {} }
}

function listConfigs(): ProviderConfig[] {
  return getSettings().ai.providers
}

function toView(provider: ProviderConfig): ProviderView {
  return { ...provider, hasApiKey: hasProviderSecret(provider.id) }
}

export function listProviders(): ProviderView[] {
  return listConfigs().map(toView)
}

function findProvider(providerId: string): ProviderConfig {
  const provider = listConfigs().find((entry) => entry.id === providerId)
  if (!provider) {
    throw new ProviderError('NOT_FOUND', 'Không tìm thấy Provider đã chọn')
  }
  return provider
}

interface ProviderDraft {
  id: string
  type: ProviderType
  name: string
  baseUrl?: string | null
  models: ProviderModel[]
}

function sanitiseProvider(provider: ProviderDraft): ProviderConfig {
  const parsed = providerConfigSchema.parse(provider)
  if (parsed.type === 'custom' && !parsed.baseUrl) {
    throw new ProviderError('INVALID_CONFIG', 'Provider Custom cần có Base URL')
  }
  const modelIds = new Set<string>()
  for (const model of parsed.models) {
    if (modelIds.has(model.id)) {
      throw new ProviderError('INVALID_CONFIG', `Model "${model.id}" bị trùng trong cùng Provider`)
    }
    modelIds.add(model.id)
  }
  return {
    id: parsed.id,
    type: parsed.type,
    name: parsed.name,
    baseUrl: normaliseBaseUrl(parsed.baseUrl),
    models: parsed.models
  }
}

function normaliseSelection(providers: ProviderConfig[], selection: ModelSelection | null): ModelSelection | null {
  if (!selection) {
    return null
  }
  const provider = providers.find((entry) => entry.id === selection.providerId)
  if (!provider || !provider.models.some((model) => model.id === selection.modelId)) {
    return null
  }
  return selection
}

function persistProviders(nextProviders: ProviderConfig[], currentAi: AiSettings): ProviderView[] {
  const unique = new Map<string, ProviderConfig>()
  for (const provider of nextProviders) {
    unique.set(provider.id, provider)
  }
  const providers = Array.from(unique.values())
  if (providers.length > MAX_PROVIDERS) {
    throw new ProviderError('INVALID_CONFIG', `Chỉ hỗ trợ tối đa ${MAX_PROVIDERS} Provider`)
  }

  saveAiSettings({
    providers,
    // Chat keeps the strict normalisation: a removed model becomes null.
    lastSelection: normaliseSelection(providers, currentAi.lastSelection),
    // News/Scan keep a stale selection so the UI can report the fallback.
    newsSelection: currentAi.newsSelection ?? null,
    scanSelection: currentAi.scanSelection ?? null,
    // FIX 2: chuỗi model được chuẩn hóa lại theo danh sách provider mới (model đã xóa bị loại).
    taskModels: currentAi.taskModels,
    newsCacheTtlMs: currentAi.newsCacheTtlMs
  })
  return listProviders()
}

function requireEncryption(secrets: ProviderSecretInput[]): void {
  const needsWrite = secrets.some((secret) => secret.apiKey || secret.headers)
  if (needsWrite && !isEncryptionAvailable()) {
    throw new ProviderError('ENCRYPTION_UNAVAILABLE', 'Hệ điều hành không hỗ trợ mã hóa, từ chối lưu API Key')
  }
}

function writeSecrets(secrets: ProviderSecretInput[]): void {
  requireEncryption(secrets)
  for (const secret of secrets) {
    if (!secret.apiKey && !secret.headers) {
      continue
    }
    const existing = getProviderSecret(secret.id)
    const apiKey = secret.apiKey ?? existing?.apiKey ?? ''
    const headers = secret.headers ?? existing?.headers
    saveProviderSecret(secret.id, apiKey, headers)
  }
}

export function saveProvider(rawInput: unknown): ProviderView[] {
  const input = providerSaveSchema.parse(rawInput)
  const provider = sanitiseProvider(input.provider)
  const currentAi = getSettings().ai
  const nextProviders = currentAi.providers.some((entry) => entry.id === provider.id)
    ? currentAi.providers.map((entry) => (entry.id === provider.id ? provider : entry))
    : [...currentAi.providers, provider]

  writeSecrets([{ id: provider.id, apiKey: input.apiKey, headers: input.headers }])
  return persistProviders(nextProviders, currentAi)
}

export function deleteProvider(providerId: string): ProviderView[] {
  const currentAi = getSettings().ai
  const provider = findProvider(providerId)
  const nextProviders = currentAi.providers.filter((entry) => entry.id !== provider.id)
  deleteProviderSecret(provider.id)
  return persistProviders(nextProviders, currentAi)
}

function formatZodError(error: ZodError): string[] {
  return error.issues.slice(0, 20).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
    return `${path}: ${issue.message}`
  })
}

interface ParsedImport {
  providers: ProviderConfig[]
  secrets: Map<string, ProviderSecretInput>
}

function parseImport(json: string): ParsedImport {
  let payload: unknown
  try {
    payload = JSON.parse(json) as unknown
  } catch (error) {
    throw new ProviderError(
      'INVALID_CONFIG',
      `JSON không hợp lệ: ${error instanceof Error ? error.message : 'không đọc được nội dung'}`
    )
  }

  const data = aiConfigImportSchema.parse(payload)
  const providers: ProviderConfig[] = []
  const secrets = new Map<string, ProviderSecretInput>()
  const seen = new Set<string>()

  for (const imported of data.providers) {
    const id = imported.id ?? randomUUID()
    if (seen.has(id)) {
      throw new ProviderError('INVALID_CONFIG', `Provider id "${id}" bị trùng trong file JSON`)
    }
    seen.add(id)

    const provider = sanitiseProvider({
      id,
      type: imported.type as ProviderType,
      name: imported.name,
      baseUrl: normaliseBaseUrl(imported.baseUrl),
      models: imported.models as ProviderModel[]
    })
    providers.push(provider)
    secrets.set(id, {
      id,
      apiKey: imported.apiKey ?? data.apiKey,
      headers: imported.headers ?? data.headers
    })
  }

  return { providers, secrets }
}

export function parseProviderJson(json: string): { providers: ProviderConfig[]; errors: string[] } {
  try {
    const parsed = parseImport(json)
    return { providers: parsed.providers, errors: [] }
  } catch (error) {
    if (error instanceof ZodError) {
      return { providers: [], errors: formatZodError(error) }
    }
    if (error instanceof ProviderError) {
      return { providers: [], errors: [error.message] }
    }
    return { providers: [], errors: [error instanceof Error ? error.message : 'Không đọc được JSON'] }
  }
}

export function saveProvidersFromJson(json: string): ProviderView[] {
  const parsed = parseImport(json)
  const currentAi = getSettings().ai

  const secrets = parsed.providers.map((provider) => parsed.secrets.get(provider.id) ?? { id: provider.id })
  writeSecrets(secrets)

  const merged = [...currentAi.providers]
  const indexById = new Map(merged.map((entry, index) => [entry.id, index]))
  for (const provider of parsed.providers) {
    const index = indexById.get(provider.id)
    if (index === undefined) {
      merged.push(provider)
    } else {
      merged[index] = provider
    }
  }

  return persistProviders(merged, currentAi)
}

export interface SelectedModelMeta {
  providerId: string
  modelId: string
  providerName: string
  modelLabel: string
  supportsTools: boolean
  supportsWebSearch: boolean
}

export function getSelectedModelMeta(): SelectedModelMeta | null {
  return resolveSelectionMeta(getSettings().ai.lastSelection)
}

/**
 * FIX 2: resolve the model of one AI task. News/Scan fall back to the Chat
 * selection when their own picker is empty or points at a removed model.
 */
export function getTaskModelMeta(task: AiTask): SelectedModelMeta | null {
  const ai = getSettings().ai
  const taskSelection = task === 'news' ? ai.newsSelection : ai.scanSelection
  return resolveSelectionMeta(taskSelection) ?? resolveSelectionMeta(ai.lastSelection)
}

function resolveSelectionMeta(selection: ModelSelection | null): SelectedModelMeta | null {
  if (!selection) {
    return null
  }
  const provider = getSettings().ai.providers.find((entry) => entry.id === selection.providerId)
  const model = provider?.models.find((entry) => entry.id === selection.modelId)
  if (!provider || !model) {
    return null
  }
  return {
    providerId: provider.id,
    modelId: model.id,
    providerName: provider.name,
    modelLabel: model.label,
    supportsTools: model.supportsTools,
    supportsWebSearch: model.supportsWebSearch
  }
}

export function getModelConnection(providerId: string, modelId: string): ProviderConnection {
  const provider = findProvider(providerId)
  const model = provider.models.find((entry) => entry.id === modelId)
  if (!model) {
    throw new ProviderError('NOT_FOUND', 'Không tìm thấy Model đã chọn trong Provider')
  }
  const secret = getProviderSecret(provider.id)
  if (!secret || (!secret.apiKey && !secret.headers)) {
    throw new ProviderError('API_KEY_REQUIRED', 'Provider chưa có API Key, vào Settings để nhập')
  }
  const baseUrl = resolveBaseUrl(provider.type, provider.baseUrl)
  if (!baseUrl) {
    throw new ProviderError('INVALID_CONFIG', `Provider "${provider.name}" chưa có Base URL. Hãy mở Settings và nhập Base URL.`)
  }
  return {
    providerType: provider.type,
    baseUrl,
    apiKey: secret.apiKey,
    headers: secret.headers,
    modelId: model.id,
    supportsWebSearch: model.supportsWebSearch
  }
}

function describeError(error: unknown, apiKey?: string): string {
  let text: string
  if (error instanceof AiError) {
    text = error.detail ? `${error.message} — ${error.detail}` : error.message
  } else if (error instanceof Error) {
    text = error.message
  } else {
    text = 'Lỗi không xác định'
  }
  if (apiKey && apiKey.length >= 6) {
    text = text.split(apiKey).join('***')
  }
  return text
}

export async function testProvider(providerId: string, modelId: string): Promise<ProviderTestResult> {
  assertAiEnabled()
  let connection: ProviderConnection
  try {
    connection = getModelConnection(providerId, modelId)
  } catch (error) {
    return { ok: false, message: describeError(error), supportsTools: false, supportsWebSearch: false }
  }

  const provider = findProvider(providerId)
  const model = provider.models.find((entry) => entry.id === modelId)
  const supportsWebSearch = model?.supportsWebSearch ?? false
  const client = createModelClient(connection)
  const signal = AbortSignal.timeout(TEST_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const reply = await client.complete({
      system: 'Bạn là trợ lý kiểm tra kết nối API. Trả lời thật ngắn.',
      messages: [{ role: 'user', content: 'Trả lời đúng một từ: OK' }],
      tools: [],
      enableWebSearch: false,
      signal,
      maxTokens: 64
    })
    if (reply.text.trim().length === 0) {
      return {
        ok: false,
        message: 'Failed: Provider phản hồi rỗng',
        supportsTools: false,
        supportsWebSearch: false
      }
    }
  } catch (error) {
    return {
      ok: false,
      message: `Failed: ${describeError(error, connection.apiKey)}`,
      supportsTools: false,
      supportsWebSearch: false
    }
  }

  const latency = Date.now() - startedAt
  let supportsTools = false
  let toolsNote = 'không'
  try {
    const toolReply = await client.complete({
      system: 'Bạn phải gọi tool ping ngay khi được yêu cầu, không trả lời bằng văn bản.',
      messages: [{ role: 'user', content: 'Hãy gọi tool ping ngay bây giờ.' }],
      tools: [PING_TOOL],
      enableWebSearch: false,
      signal,
      maxTokens: 128
    })
    supportsTools = toolReply.toolCalls.some((call) => call.name === 'ping')
    toolsNote = supportsTools ? 'có' : 'không'
  } catch (error) {
    toolsNote = `không (${describeError(error, connection.apiKey)})`
  }

  // Probe real web search instead of trusting `supportsWebSearch` in the config.
  // No trace and no URL in the answer means the provider ignored the flag.
  let webSearchProbe: 'off' | 'used' | 'not_detected' = 'off'
  let webSearchNote = 'chưa bật cho Model này'
  if (supportsWebSearch) {
    try {
      const searchReply = await client.complete({
        system: 'Bạn là trợ lý kiểm tra web search. Phải tìm trên web và trả về ít nhất một URL nguồn.',
        messages: [{ role: 'user', content: 'Tìm trang chủ chính thức của Ethereum và trả về URL.' }],
        tools: [],
        enableWebSearch: true,
        signal,
        maxTokens: 256
      })
      const trace = searchReply.webSearch
      const hasUrl = /https?:\/\/\S+/i.test(searchReply.text)
      const used = Boolean(trace?.used) || hasUrl
      webSearchProbe = used ? 'used' : 'not_detected'
      webSearchNote = used ? 'hoạt động (có dấu vết tìm kiếm)' : 'không phát hiện dấu vết tìm kiếm'
      logInfo(
        `Test Provider web search (${providerId}/${modelId}): declared=true used=${trace?.used ?? false} sources=${trace?.sources.length ?? 0}`
      )
    } catch (error) {
      webSearchProbe = 'not_detected'
      webSearchNote = `không phát hiện dấu vết tìm kiếm (${describeError(error, connection.apiKey)})`
    }
  }

  return {
    ok: true,
    message: `Kết nối OK (${latency} ms) · Tool calling: ${toolsNote} · Web search: ${webSearchNote}`,
    supportsTools,
    supportsWebSearch,
    webSearchProbe
  }
}

export function defaultProviderConfigFileName(): string {
  return `ai-providers-${todayDateOnly()}.json`
}

export function buildProviderExport(): { schemaVersion: '1.0'; providers: ProviderConfig[] } {
  return {
    schemaVersion: '1.0',
    providers: listConfigs().map((provider) => ({
      id: provider.id,
      type: provider.type,
      name: provider.name,
      baseUrl: provider.baseUrl,
      models: provider.models
    }))
  }
}

export function exportProviderConfig(targetPath?: string): { filePath: string; count: number } {
  const payload = buildProviderExport()
  const filePath = targetPath ?? join(app.getPath('downloads'), defaultProviderConfigFileName())
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return { filePath, count: payload.providers.length }
}
