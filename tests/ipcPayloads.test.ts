import { ZodError } from 'zod'
import { describe, expect, it } from 'vitest'
import { IPC } from '../src/shared/ipc-channels'
import { providerSaveJsonSchema, providerTestSchema } from '../src/shared/schemas'
import {
  actionIdPayload,
  aiModePayload,
  appOpenExternalPayload,
  appearancePayload,
  chatSendPayload,
  dataPathPayload,
  lastSelectionPayload,
  newsCreatePayload,
  newsDeletePayload,
  newsImportConfirmPayload,
  newsTogglePayload,
  newsUpdatePayload,
  projectsCreatePayload,
  projectsExportPayload,
  projectsIdPayload,
  projectsImportPayload,
  projectsListPayload,
  projectsSetLogoPayload,
  projectsUpdatePayload,
  providerDeletePayload,
  providerSavePayload,
  revenueAttachEvidencePayload,
  revenueDeletePayload,
  revenueGetPayload,
  revenueListPayload,
  revenueSavePayload,
  scanStartPayload,
  scanSubmitPayload,
  taskSelectionPayload,
  webSearchSavePayload,
  webSearchTestPayload
} from '../src/main/ipc/payloadSchemas'
import { formatZodError } from '../src/main/ipc/zodErrorMessage'

const provider = {
  id: 'google-gemini',
  type: 'google' as const,
  name: 'Google Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  models: [
    {
      id: 'gemini-3.5-flash-lite',
      label: 'Gemini 3.5 Flash-Lite',
      supportsWebSearch: true,
      supportsTools: true,
      costTier: 'free' as const
    }
  ]
}

const projectInput = { category: 'airdrop' as const, name: 'Test Project', website: 'https://example.com' }

describe('provider IPC payloads', () => {
  it('accepts the editor payload at the top level', () => {
    const parsed = providerSavePayload.parse({ provider, apiKey: 'AIza-test', headers: { 'X-Api-Version': '1' } })
    expect('provider' in parsed).toBe(true)
  })

  it('accepts the JSON import payload at the top level', () => {
    const parsed = providerSavePayload.parse({ json: JSON.stringify({ schemaVersion: '1.0', providers: [provider] }) })
    expect('json' in parsed).toBe(true)
  })

  it('rejects a payload wrapped in an extra "input" layer', () => {
    expect(providerSavePayload.safeParse({ input: { json: '{}' } }).success).toBe(false)
    expect(providerSavePayload.safeParse({ input: { provider, apiKey: 'AIza-test' } }).success).toBe(false)
  })

  it('accepts the test payload used by the Test button', () => {
    const parsed = providerTestSchema.parse({ providerId: 'google-gemini', modelId: 'gemini-3.5-flash-lite' })
    expect(parsed.modelId).toBe('gemini-3.5-flash-lite')
  })

  it('keeps the shared schemas exported for the main process', () => {
    expect(providerTestSchema.parse({ providerId: 'a', modelId: 'b' })).toEqual({ providerId: 'a', modelId: 'b' })
    expect(providerSaveJsonSchema.parse({ json: '{}' })).toEqual({ json: '{}' })
  })
})

/**
 * Every payload below mirrors exactly what `src/preload/index.ts` sends.
 * If the preload and the main-process schema drift apart, these fail.
 */
const contracts: Array<{ channel: string; schema: { parse: (value: unknown) => unknown }; payload: unknown }> = [
  {
    channel: IPC.projectsList,
    schema: projectsListPayload,
    payload: {}
  },
  { channel: IPC.projectsList, schema: projectsListPayload, payload: { category: 'airdrop' } },
  { channel: IPC.projectsGet, schema: projectsIdPayload, payload: { id: 'p-1' } },
  { channel: IPC.projectsCreate, schema: projectsCreatePayload, payload: { input: projectInput } },
  {
    channel: IPC.projectsUpdate,
    schema: projectsUpdatePayload,
    payload: { id: 'p-1', input: projectInput, expectedRowVersion: 2 }
  },
  { channel: IPC.projectsDelete, schema: projectsIdPayload, payload: { id: 'p-1' } },
  { channel: IPC.projectsSetLogo, schema: projectsSetLogoPayload, payload: { id: 'p-1', autoFetch: true } },
  { channel: IPC.projectsSetLogo, schema: projectsSetLogoPayload, payload: { id: 'p-1', sourcePath: 'C:/logo.png' } },
  { channel: IPC.projectsImport, schema: projectsImportPayload, payload: { json: '{"projects":[]}' } },
  { channel: IPC.projectsImport, schema: projectsImportPayload, payload: { pickFile: true } },
  { channel: IPC.projectsExport, schema: projectsExportPayload, payload: { format: 'json' } },
  { channel: IPC.projectsExport, schema: projectsExportPayload, payload: { format: 'txt', chooseLocation: true } },

  { channel: IPC.revenueList, schema: revenueListPayload, payload: {} },
  { channel: IPC.revenueList, schema: revenueListPayload, payload: { projectId: 'p-1' } },
  { channel: IPC.revenueGet, schema: revenueGetPayload, payload: { id: 7 } },
  { channel: IPC.revenueSave, schema: revenueSavePayload, payload: { input: { note: 'x' } } },
  { channel: IPC.revenueSave, schema: revenueSavePayload, payload: { input: { note: 'x' }, id: 7 } },
  { channel: IPC.revenueDelete, schema: revenueDeletePayload, payload: { id: 7 } },
  { channel: IPC.revenueAttachEvidence, schema: revenueAttachEvidencePayload, payload: { revenueId: 7 } },

  { channel: IPC.newsToggleTodo, schema: newsTogglePayload, payload: { id: 3, isDone: true } },
  { channel: IPC.newsImportConfirm, schema: newsImportConfirmPayload, payload: { token: 'token-1' } },
  {
    channel: IPC.newsCreate,
    schema: newsCreatePayload,
    payload: {
      input: {
        projectId: 'p-1',
        kind: 'important',
        summary: 'Tin mới',
        verification: 'verified',
        sourceUrl: null,
        sourceName: null,
        date: '2026-11-20',
        milestoneKind: 'snapshot'
      }
    }
  },
  {
    channel: IPC.newsUpdate,
    schema: newsUpdatePayload,
    payload: {
      id: 3,
      input: {
        projectId: 'p-1',
        kind: 'todo',
        summary: 'Việc cần làm',
        verification: 'unverified',
        sourceUrl: 'https://example.com/news',
        sourceName: 'Example',
        date: '2026-11-18',
        milestoneKind: null
      }
    }
  },
  { channel: IPC.newsDelete, schema: newsDeletePayload, payload: { id: 3 } },

  { channel: IPC.scanStart, schema: scanStartPayload, payload: { text: 'danh sách dự án', fileName: 'scan.txt' } },
  { channel: IPC.scanSubmit, schema: scanSubmitPayload, payload: { names: ['Alpha', 'Beta'] } },
  {
    channel: IPC.scanSubmit,
    schema: scanSubmitPayload,
    payload: { names: ['Alpha'], categories: { alpha: 'airdrop' } }
  },

  {
    channel: IPC.chatSend,
    schema: chatSendPayload,
    payload: { text: 'xin chào', providerId: 'google-gemini', modelId: 'gemini-3.5-flash-lite' }
  },
  { channel: IPC.chatSend, schema: chatSendPayload, payload: { text: '', providerId: 'google-gemini', modelId: 'gemini-3.5-flash-lite', attachment: { name: 'a.json', text: '{}' } } },
  { channel: IPC.chatSend, schema: chatSendPayload, payload: { choiceId: 'choice-1' } },
  { channel: IPC.chatConfirm, schema: actionIdPayload, payload: { actionId: 'action-1' } },
  { channel: IPC.chatCancelAction, schema: actionIdPayload, payload: { actionId: 'action-1' } },

  { channel: IPC.settingsSetLastSelection, schema: lastSelectionPayload, payload: { providerId: 'p', modelId: 'm' } },
  {
    channel: IPC.settingsSetTaskSelection,
    schema: taskSelectionPayload,
    payload: { task: 'news', selection: { providerId: 'p', modelId: 'm' } }
  },
  {
    channel: IPC.settingsSetTaskSelection,
    schema: taskSelectionPayload,
    payload: { task: 'scan', selection: null }
  },
  { channel: IPC.settingsSetAiMode, schema: aiModePayload, payload: { aiMode: 'noai' } },
  {
    channel: IPC.settingsSetAppearance,
    schema: appearancePayload,
    payload: {
      appearance: {
        fontFamily: 'Segoe UI, system-ui, -apple-system, sans-serif',
        fontSize: 15,
        fontWeight: 400
      }
    }
  },
  { channel: IPC.settingsSetDataPath, schema: dataPathPayload, payload: { choose: true } },
  {
    channel: IPC.settingsSetDataPath,
    schema: dataPathPayload,
    payload: { path: 'D:/Data', copyExisting: true }
  },
  { channel: IPC.settingsSetDataPath, schema: dataPathPayload, payload: { path: 'D:/Data' } },
  { channel: IPC.providersSave, schema: providerSavePayload, payload: { provider, apiKey: 'AIza-test' } },
  { channel: IPC.providersSave, schema: providerSavePayload, payload: { json: '{"schemaVersion":"1.0"}' } },
  { channel: IPC.providersDelete, schema: providerDeletePayload, payload: { id: 'google-gemini' } },
  { channel: IPC.providersTest, schema: providerTestSchema, payload: { providerId: 'p', modelId: 'm' } },
  { channel: IPC.providersParseJson, schema: providerSaveJsonSchema, payload: { json: '{"providers":[]}' } },

  { channel: IPC.settingsSaveWebSearch, schema: webSearchSavePayload, payload: { provider: 'none' } },
  {
    channel: IPC.settingsSaveWebSearch,
    schema: webSearchSavePayload,
    payload: { provider: 'tavily', baseUrl: null, apiKey: 'tvly-test' }
  },
  {
    channel: IPC.settingsSaveWebSearch,
    schema: webSearchSavePayload,
    payload: { provider: 'searxng', baseUrl: 'https://searx.example.org' }
  },
  { channel: IPC.settingsTestWebSearch, schema: webSearchTestPayload, payload: {} },
  {
    channel: IPC.settingsTestWebSearch,
    schema: webSearchTestPayload,
    payload: { provider: 'tavily', apiKey: 'tvly-test' }
  },

  { channel: IPC.appOpenExternal, schema: appOpenExternalPayload, payload: { url: 'https://example.com' } }
]

describe('preload ↔ main IPC payload contract', () => {
  it.each(contracts)('accepts the preload payload for $channel', ({ schema, payload }) => {
    expect(() => schema.parse(payload)).not.toThrow()
  })

  it('rejects a non-http URL for app:openExternal', () => {
    expect(appOpenExternalPayload.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false)
  })

  it('rejects an unknown web search provider', () => {
    expect(webSearchSavePayload.safeParse({ provider: 'duckduckgo' }).success).toBe(false)
    expect(webSearchTestPayload.safeParse({ provider: 'duckduckgo' }).success).toBe(false)
  })

  it('rejects an invalid category for scan:submit', () => {
    expect(scanSubmitPayload.safeParse({ names: ['Alpha'], categories: { alpha: 'insufficient' } }).success).toBe(false)
    expect(scanSubmitPayload.safeParse({ names: ['Alpha'], categories: { alpha: 'airdrop' } }).success).toBe(true)
  })
})

describe('chat confirm payload regression', () => {
  it('accepts the actionId sent by the preload', () => {
    expect(actionIdPayload.parse({ actionId: 'act-1' })).toEqual({ actionId: 'act-1' })
  })

  it('rejects the old "id" shape that caused "expected string, received undefined"', () => {
    expect(actionIdPayload.safeParse({ id: 'act-1' }).success).toBe(false)
  })
})

describe('IPC validation errors', () => {
  it('includes the channel name so the failing call is identifiable', () => {
    const result = actionIdPayload.safeParse({ id: 'act-1' })
    expect(result.success).toBe(false)
    const formatted = formatZodError(result.error as ZodError, IPC.chatConfirm)
    expect(formatted.code).toBe('INVALID_INPUT')
    expect(formatted.message).toContain(IPC.chatConfirm)
    expect(formatted.message).toContain('actionId')
  })

  it('names the channel for union mismatches too', () => {
    const result = chatSendPayload.safeParse({ nope: true })
    expect(result.success).toBe(false)
    const formatted = formatZodError(result.error as ZodError, IPC.chatSend)
    expect(formatted.message).toContain(IPC.chatSend)
    expect(formatted.message).toContain('Payload')
  })

  it('rejects invalid news CRUD input and names the channel', () => {
    const badCreate = newsCreatePayload.safeParse({ input: { projectId: 'p-1', kind: 'important', summary: '' } })
    expect(badCreate.success).toBe(false)
    const formatted = formatZodError(badCreate.error as ZodError, IPC.newsCreate)
    expect(formatted.message).toContain(IPC.newsCreate)

    expect(newsUpdatePayload.safeParse({ id: 0, input: {} }).success).toBe(false)
    expect(newsDeletePayload.safeParse({ id: -1 }).success).toBe(false)
  })

  it('rejects an unknown task for task model selection', () => {
    const result = taskSelectionPayload.safeParse({ task: 'chat', selection: null })
    expect(result.success).toBe(false)
    const formatted = formatZodError(result.error as ZodError, IPC.settingsSetTaskSelection)
    expect(formatted.message).toContain(IPC.settingsSetTaskSelection)
  })
})
