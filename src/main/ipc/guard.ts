import { BrowserWindow, ipcMain } from 'electron'
import { ZodError } from 'zod'
import type { IpcResult } from '@shared/types'
import { assertUserCanMutate, LockError } from '../services/lockManager'
import { logError } from '../services/logger'
import { SecretStoreError } from '../services/secretStore'
import { DataPathError } from '../services/dataPathService'
import { LogoError } from '../services/logoService'
import { ProjectError } from '../services/projectService'
import { ProviderError } from '../ai/providerService'
import { AiError } from '../ai/types'
import { AiDisabledError } from '../ai/aiMode'
import { RevenueError } from '../services/revenueService'
import { PendingActionError } from '../ai/pendingActions'
import { formatZodError } from './zodErrorMessage'

export interface HandlerOptions<T> {
  channel: string
  mutating?: boolean
  parse?: (input: unknown) => T
  handler: (input: T) => unknown | Promise<unknown>
}

function toIpcError(error: unknown, channel?: string): { code: string; message: string } {
  if (error instanceof LockError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof DataPathError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof SecretStoreError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof ProjectError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof LogoError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof ProviderError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof RevenueError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof PendingActionError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof AiDisabledError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof AiError) {
    return { code: error.kind, message: error.detail ? `${error.message} — ${error.detail}` : error.message }
  }
  if (error instanceof ZodError) {
    return formatZodError(error, channel)
  }
  if (error instanceof Error) {
    return { code: 'INTERNAL', message: error.message }
  }
  return { code: 'INTERNAL', message: 'Lỗi không xác định' }
}

export function registerHandler<T = unknown>(options: HandlerOptions<T>): void {
  ipcMain.handle(options.channel, async (_event, rawPayload: unknown): Promise<IpcResult<unknown>> => {
    try {
      if (options.mutating) {
        assertUserCanMutate()
      }
      const input = options.parse ? options.parse(rawPayload) : (rawPayload as T)
      const data = await options.handler(input)
      return { ok: true, data }
    } catch (error) {
      logError(`IPC ${options.channel} thất bại`, error)
      return { ok: false, error: toIpcError(error, options.channel) }
    }
  })
}

export function broadcastToRenderers(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
}
