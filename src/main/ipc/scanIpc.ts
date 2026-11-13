import { EVENTS, IPC } from '@shared/ipc-channels'
import { registerHandler, broadcastToRenderers } from './guard'
import { scanStartPayload, scanSubmitPayload } from './payloadSchemas'
import { runScan, getScanLatestResult, submitScanSelection } from '../ai/scanService'
import { cancelAiChannel } from '../ai/aiTaskRunner'

export function registerScanIpc(): void {
  registerHandler({
    channel: IPC.scanStart,
    parse: (raw) => scanStartPayload.parse(raw),
    handler: async (input) => runScan(input)
  })

  registerHandler({
    channel: IPC.scanGetLatest,
    handler: () => getScanLatestResult()
  })

  registerHandler({
    channel: IPC.scanSubmit,
    mutating: true,
    parse: (raw) => scanSubmitPayload.parse(raw),
    handler: async (input) => {
      const outcome = await submitScanSelection(input.names, input.categories)
      broadcastToRenderers(EVENTS.dataChanged, { entity: 'projects' })
      return outcome
    }
  })

  registerHandler({
    channel: IPC.scanCancel,
    handler: () => ({ canceled: cancelAiChannel('scan') })
  })
}
