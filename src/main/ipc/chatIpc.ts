import { IPC } from '@shared/ipc-channels'
import { registerHandler } from './guard'
import { actionIdPayload, aiCancelPayload, chatSendPayload } from './payloadSchemas'
import { startNewChatSession, sendChatMessage, chooseChatOption, confirmChatAction, cancelChatAction } from '../ai/chatService'
import { cancelAiTask, cancelAiChannel } from '../ai/aiTaskRunner'

export function registerChatIpc(): void {
  registerHandler({
    channel: IPC.chatSend,
    parse: (raw) => chatSendPayload.parse(raw),
    handler: async (input) => {
      if ('choiceId' in input) {
        return chooseChatOption(input.choiceId)
      }
      return sendChatMessage(input)
    }
  })

  registerHandler({
    channel: IPC.chatNewSession,
    handler: () => {
      startNewChatSession()
      return { ok: true }
    }
  })

  registerHandler({
    channel: IPC.chatConfirm,
    mutating: true,
    parse: (raw) => actionIdPayload.parse(raw),
    handler: (input) => confirmChatAction(input.actionId)
  })

  registerHandler({
    channel: IPC.chatCancelAction,
    parse: (raw) => actionIdPayload.parse(raw),
    handler: (input) => cancelChatAction(input.actionId)
  })

  registerHandler({
    channel: IPC.aiCancel,
    parse: (raw) => aiCancelPayload.parse(raw),
    handler: (input) => {
      const channel = input?.channel
      return { canceled: channel ? cancelAiChannel(channel) : cancelAiTask() }
    }
  })
}
