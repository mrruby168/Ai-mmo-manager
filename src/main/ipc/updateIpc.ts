import { shell } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { UPDATE_RELEASE_URL_BASE } from '@shared/constants'
import { registerHandler } from './guard'
import type { UpdateService } from '../services/updateService'

/**
 * Các handler cập nhật KHÔNG đặt mutating: true, để hoạt động bình thường
 * ngay cả khi tác vụ AI đang chạy (chỉ đọc/tải/cài, không ghi dữ liệu app).
 */
export function registerUpdateIpc(updateService: UpdateService): void {
  registerHandler({
    channel: IPC.updateGetState,
    handler: () => updateService.getState()
  })

  registerHandler({
    channel: IPC.updateCheck,
    handler: async () => {
      await updateService.checkForUpdates()
      return updateService.getState()
    }
  })

  registerHandler({
    channel: IPC.updateDownload,
    handler: async () => updateService.downloadUpdate()
  })

  registerHandler({
    channel: IPC.updateInstall,
    handler: async () => updateService.installUpdate()
  })

  registerHandler({
    channel: IPC.updateOpenRelease,
    handler: async () => {
      const url = updateService.openRelease()
      if (!url || !url.startsWith(UPDATE_RELEASE_URL_BASE)) {
        return { opened: false }
      }
      await shell.openExternal(url)
      return { opened: true }
    }
  })
}
