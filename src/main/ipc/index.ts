import { shell } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { registerHandler } from './guard'
import { appOpenExternalPayload } from './payloadSchemas'
import { registerLockIpc, startLockBroadcast } from './lockIpc'
import { registerProjectsIpc } from './projectsIpc'
import { registerSettingsIpc } from './settingsIpc'
import { registerScanIpc } from './scanIpc'
import { registerNewsIpc } from './newsIpc'
import { registerRevenueIpc } from './revenueIpc'
import { registerChatIpc } from './chatIpc'

export function registerAllIpc(): void {
  registerProjectsIpc()
  registerSettingsIpc()
  registerScanIpc()
  registerNewsIpc()
  registerRevenueIpc()
  registerChatIpc()
  registerLockIpc()
  startLockBroadcast()

  registerHandler({
    channel: IPC.appOpenExternal,
    parse: (raw) => appOpenExternalPayload.parse(raw),
    handler: async (input) => {
      await shell.openExternal(input.url)
      return { opened: true }
    }
  })
}
