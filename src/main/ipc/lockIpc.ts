import { BrowserWindow } from 'electron'
import { EVENTS, IPC } from '@shared/ipc-channels'
import {
  beginUserEditing,
  endUserEditing,
  getLockState,
  onLockChanged
} from '../services/lockManager'
import { registerHandler } from './guard'

export function registerLockIpc(): void {
  registerHandler({ channel: IPC.lockGet, handler: () => getLockState() })
  registerHandler({
    channel: IPC.lockUserBegin,
    handler: () => {
      beginUserEditing()
      return getLockState()
    }
  })
  registerHandler({
    channel: IPC.lockUserEnd,
    handler: () => {
      endUserEditing()
      return getLockState()
    }
  })
}

export function broadcastLockState(): void {
  const state = getLockState()
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(EVENTS.lockChanged, state)
  }
}

export function startLockBroadcast(): void {
  onLockChanged(() => {
    broadcastLockState()
  })
}
