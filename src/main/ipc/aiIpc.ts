import { IPC } from '@shared/ipc-channels'
import { registerHandler } from './guard'
import { aiLogPayload } from './payloadSchemas'
import { getAiLog } from '../ai/aiActivityLog'

/** FIX 3: chỉ đọc Activity Log; mọi thay đổi đi qua sự kiện `ai:log` ở main. */
export function registerAiIpc(): void {
  registerHandler({
    channel: IPC.aiGetLog,
    parse: (raw) => aiLogPayload.parse(raw),
    handler: (input) => getAiLog(input.channel)
  })
}
