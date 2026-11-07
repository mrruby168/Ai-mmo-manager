import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { LIMITS } from '@shared/constants'
import { EVENTS, IPC } from '@shared/ipc-channels'
import type { NewsImportPreview } from '@shared/types'
import { registerHandler, broadcastToRenderers } from './guard'
import { newsImportConfirmPayload, newsTogglePayload } from './payloadSchemas'
import { getNewsSnapshot, getDeadlines, toggleTodo } from '../services/newsService'
import { runCheckNews } from '../ai/checkNewsService'
import { buildCheckNewsPrompt } from '../services/newsPromptService'
import {
  importNewsBatch,
  previewNewsImport,
  summarizeImportRejections
} from '../services/newsImportService'
import type { NewsBatchInput } from '../services/newsService'

interface PendingImport {
  fileName: string
  items: NewsBatchInput[]
}

const MAX_PENDING_IMPORTS = 5
const pendingImports = new Map<string, PendingImport>()

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

function rememberImport(fileName: string, items: NewsBatchInput[]): string {
  if (pendingImports.size >= MAX_PENDING_IMPORTS) {
    const oldest = pendingImports.keys().next()
    if (!oldest.done) {
      pendingImports.delete(oldest.value)
    }
  }
  const token = randomUUID()
  pendingImports.set(token, { fileName, items })
  return token
}

async function pickNewsFile(): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: 'Chọn file JSON tin tức',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }
  const parent = parentWindow()
  const selection = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (selection.canceled || selection.filePaths.length === 0) {
    return null
  }
  return selection.filePaths[0]
}

export function registerNewsIpc(): void {
  registerHandler({
    channel: IPC.newsList,
    handler: () => getNewsSnapshot()
  })

  registerHandler({
    channel: IPC.newsDeadlines,
    handler: () => getDeadlines()
  })

  registerHandler({
    channel: IPC.newsToggleTodo,
    mutating: true,
    parse: (raw) => newsTogglePayload.parse(raw),
    handler: (input) => {
      const result = toggleTodo(input.id, input.isDone)
      broadcastToRenderers(EVENTS.dataChanged, { entity: 'news' })
      return result
    }
  })

  registerHandler({
    channel: IPC.newsCheck,
    handler: async () => runCheckNews()
  })

  // No AI Mode: build the prompt locally, never call a provider.
  registerHandler({
    channel: IPC.newsBuildPrompt,
    handler: () => buildCheckNewsPrompt()
  })

  registerHandler({
    channel: IPC.newsImportPreview,
    handler: async (): Promise<NewsImportPreview> => {
      const filePath = await pickNewsFile()
      if (!filePath) {
        return {
          canceled: true,
          token: null,
          fileName: null,
          total: 0,
          validCount: 0,
          rejections: []
        }
      }

      const size = statSync(filePath).size
      if (size > LIMITS.importMaxBytes) {
        throw new Error(`File lớn hơn ${Math.round(LIMITS.importMaxBytes / (1024 * 1024))} MB`)
      }

      const text = readFileSync(filePath, 'utf8')
      const preview = previewNewsImport(text)
      const fileError = preview.rejections.some(
        (rejection) =>
          (rejection.reason === 'invalid_json' || rejection.reason === 'invalid_schema') && rejection.index === undefined
      )
      // A file that cannot be parsed has nothing to confirm; disable the button
      // instead of reporting a fake "no news" result.
      const token = fileError ? null : rememberImport(basename(filePath), preview.items)

      return {
        canceled: false,
        token,
        fileName: basename(filePath),
        total: preview.total,
        validCount: preview.items.length,
        rejections: summarizeImportRejections(preview.rejections)
      }
    }
  })

  registerHandler({
    channel: IPC.newsImportConfirm,
    mutating: true,
    parse: (raw) => newsImportConfirmPayload.parse(raw),
    handler: (input) => {
      const pending = pendingImports.get(input.token)
      if (!pending) {
        throw new Error('Phiên nhập tin đã hết hạn, hãy chọn file lại')
      }
      pendingImports.delete(input.token)

      const outcome = importNewsBatch(pending.items)
      broadcastToRenderers(EVENTS.dataChanged, { entity: 'news' })
      return {
        added: outcome.added,
        rejected: outcome.rejected,
        message: outcome.added > 0 ? `Đã nhập ${outcome.added} tin` : 'Không có tin mới'
      }
    }
  })
}
