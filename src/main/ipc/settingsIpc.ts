import { isAbsolute, join } from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import type { OpenDialogOptions, SaveDialogOptions } from 'electron'
import { EVENTS, IPC } from '@shared/ipc-channels'
import type { AppSettings } from '@shared/types'
import {
  defaultProviderConfigFileName,
  deleteProvider,
  exportProviderConfig,
  listProviders,
  parseProviderJson,
  saveProvider,
  saveProvidersFromJson,
  testProvider
} from '../ai/providerService'
import { changeDataPath, getDataFolderToOpen } from '../services/dataPathService'
import { getSettings, saveAiMode, saveAppearance, saveLastSelection } from '../services/settingsStore'
import { broadcastToRenderers, registerHandler } from './guard'
import {
  aiModePayload,
  appearancePayload,
  dataPathPayload,
  lastSelectionPayload,
  providerDeletePayload,
  providerParseJsonPayload,
  providerSavePayload,
  providerTestPayload
} from './payloadSchemas'

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

export function registerSettingsIpc(): void {
  registerHandler({
    channel: IPC.settingsGet,
    handler: () => getSettings()
  })

  registerHandler({
    channel: IPC.settingsSetLastSelection,
    mutating: true,
    parse: (raw) => lastSelectionPayload.parse(raw),
    handler: (input) => {
      const settings = getSettings()
      const provider = settings.ai.providers.find((entry) => entry.id === input.providerId)
      const model = provider?.models.find((entry) => entry.id === input.modelId)
      if (!provider || !model) {
        throw new Error('Model đã chọn không tồn tại hoặc đã bị xóa')
      }
      const next = saveLastSelection(input)
      broadcastToRenderers(EVENTS.dataChanged, { entity: 'settings' })
      return next
    }
  })

  registerHandler({
    channel: IPC.settingsSetAppearance,
    mutating: true,
    parse: (raw) => appearancePayload.parse(raw),
    handler: (input) => saveAppearance(input.appearance)
  })

  registerHandler({
    channel: IPC.settingsSetAiMode,
    mutating: true,
    parse: (raw) => aiModePayload.parse(raw),
    handler: (input) => {
      const next = saveAiMode(input.aiMode)
      broadcastToRenderers(EVENTS.dataChanged, { entity: 'settings' })
      return next
    }
  })

  registerHandler({
    channel: IPC.settingsSetDataPath,
    mutating: true,
    parse: (raw) => dataPathPayload.parse(raw),
    handler: async (input): Promise<AppSettings | { canceled: boolean; path: string | null }> => {
      if ('choose' in input) {
        const options: OpenDialogOptions = {
          title: 'Chọn thư mục dữ liệu',
          properties: ['openDirectory', 'createDirectory']
        }
        const parent = parentWindow()
        const selection = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
        if (selection.canceled || selection.filePaths.length === 0) {
          return { canceled: true, path: null }
        }
        return { canceled: false, path: selection.filePaths[0] }
      }

      if (!isAbsolute(input.path)) {
        throw new Error('Đường dẫn dữ liệu phải là đường dẫn tuyệt đối')
      }
      changeDataPath(input.path, input.copyExisting)
      const settings = getSettings()
      broadcastToRenderers(EVENTS.dataChanged, { entity: 'settings' })
      return settings
    }
  })

  registerHandler({
    channel: IPC.settingsOpenDataFolder,
    handler: async () => {
      const error = await shell.openPath(getDataFolderToOpen())
      if (error.length > 0) {
        throw new Error(`Không mở được thư mục dữ liệu: ${error}`)
      }
      return { opened: true }
    }
  })

  registerHandler({
    channel: IPC.providersList,
    handler: () => listProviders()
  })

  registerHandler({
    channel: IPC.providersSave,
    mutating: true,
    parse: (raw) => providerSavePayload.parse(raw),
    handler: (input) => {
      const providers = 'json' in input ? saveProvidersFromJson(input.json) : saveProvider(input)
      broadcastToRenderers(EVENTS.dataChanged, { entity: 'providers' })
      return providers
    }
  })

  registerHandler({
    channel: IPC.providersDelete,
    mutating: true,
    parse: (raw) => providerDeletePayload.parse(raw),
    handler: (input) => {
      const providers = deleteProvider(input.id)
      broadcastToRenderers(EVENTS.dataChanged, { entity: 'providers' })
      return providers
    }
  })

  registerHandler({
    channel: IPC.providersParseJson,
    parse: (raw) => providerParseJsonPayload.parse(raw),
    handler: (input) => parseProviderJson(input.json)
  })

  registerHandler({
    channel: IPC.providersTest,
    parse: (raw) => providerTestPayload.parse(raw),
    handler: (input) => testProvider(input.providerId, input.modelId)
  })

  registerHandler({
    channel: IPC.providersExportConfig,
    handler: async () => {
      const options: SaveDialogOptions = {
        title: 'Xuất cấu hình Provider',
        defaultPath: join(app.getPath('downloads'), defaultProviderConfigFileName()),
        filters: [{ name: 'JSON', extensions: ['json'] }]
      }
      const parent = parentWindow()
      const selection = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
      if (selection.canceled || !selection.filePath) {
        return { canceled: true, filePath: null, format: 'json' as const, count: 0 }
      }
      const outcome = exportProviderConfig(selection.filePath)
      return { canceled: false, filePath: outcome.filePath, format: 'json' as const, count: outcome.count }
    }
  })
}
