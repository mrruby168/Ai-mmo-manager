import { shell } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { registerHandler } from './guard'
import { appOpenExternalPayload } from './payloadSchemas'
import type { UpdateService } from '../services/updateService'
import { registerLockIpc, startLockBroadcast } from './lockIpc'
import { registerProjectsIpc } from './projectsIpc'
import { registerSettingsIpc } from './settingsIpc'
import { registerScanIpc } from './scanIpc'
import { registerUpdateIpc } from './updateIpc'
import { registerNewsIpc } from './newsIpc'
import { registerRevenueIpc } from './revenueIpc'
import { registerChatIpc } from './chatIpc'

export function registerAllIpc(updateService: UpdateService | null = null): void {
  registerProjectsIpc()
  registerSettingsIpc()
  registerScanIpc()
  registerNewsIpc()
  registerRevenueIpc()
  registerChatIpc()
  registerLockIpc()
  startLockBroadcast()

  if (updateService) {
    registerUpdateIpc(updateService)
  }

  registerHandler({
    channel: IPC.appOpenExternal,
    parse: (raw) => appOpenExternalPayload.parse(raw),
    handler: async (input) => {
      await shell.openExternal(input.url)
      return { opened: true }
    }
  })
}
