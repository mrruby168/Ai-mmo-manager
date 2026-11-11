import { BrowserWindow } from 'electron'
import { EVENTS, IPC } from '@shared/ipc-channels'
import type { LockTask } from '@shared/types'
import {
  beginUserEditing,
  endUserEditing,
  getLockState,
  getRunningAiTasks,
  onLockChanged
} from '../services/lockManager'
import { registerHandler } from './guard'

/** `LockState` + danh sách tác vụ đang chạy (trường `tasks` là tùy chọn ở type). */
function lockSnapshot(): { tasks: LockTask[] } & ReturnType<typeof getLockState> {
  return { ...getLockState(), tasks: getRunningAiTasks() }
}

export function registerLockIpc(): void {
  registerHandler({ channel: IPC.lockGet, handler: () => lockSnapshot() })
  registerHandler({
    channel: IPC.lockUserBegin,
    handler: () => {
      beginUserEditing()
      return lockSnapshot()
    }
  })
  registerHandler({
    channel: IPC.lockUserEnd,
    handler: () => {
      endUserEditing()
      return lockSnapshot()
    }
  })
}

export function broadcastLockState(): void {
  const state = lockSnapshot()
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(EVENTS.lockChanged, state)
  }
}

export function startLockBroadcast(): void {
  onLockChanged(() => {
    broadcastLockState()
  })
}
