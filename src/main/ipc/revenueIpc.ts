import { BrowserWindow, dialog } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { EVENTS, IPC } from '@shared/ipc-channels'
import { registerHandler, broadcastToRenderers } from './guard'
import {
  revenueAttachEvidencePayload,
  revenueDeletePayload,
  revenueGetPayload,
  revenueListPayload,
  revenueSavePayload
} from './payloadSchemas'
import {
  listRevenueEntries,
  getRevenueEntry,
  getRevenueSummary,
  saveRevenue,
  removeRevenue,
  attachEvidenceFile
} from '../services/revenueService'

const EVIDENCE_FILTERS = [
  { name: 'Bằng chứng', extensions: ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'txt'] }
]

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

export function registerRevenueIpc(): void {
  registerHandler({
    channel: IPC.revenueList,
    parse: (raw) => revenueListPayload.parse(raw ?? undefined),
    handler: (input) => listRevenueEntries(input?.projectId)
  })

  registerHandler({
    channel: IPC.revenueGet,
    parse: (raw) => revenueGetPayload.parse(raw),
    handler: (input) => getRevenueEntry(input.id)
  })

  registerHandler({
    channel: IPC.revenueSummary,
    handler: () => getRevenueSummary()
  })

  registerHandler({
    channel: IPC.revenueSave,
    mutating: true,
    parse: (raw) => revenueSavePayload.parse(raw),
    handler: (input) => {
      const entry = saveRevenue(input.input, input.id)
      broadcastToRenderers(EVENTS.dataChanged, { entity: 'revenue' })
      return entry
    }
  })

  registerHandler({
    channel: IPC.revenueDelete,
    mutating: true,
    parse: (raw) => revenueDeletePayload.parse(raw),
    handler: (input) => {
      const result = removeRevenue(input.id)
      broadcastToRenderers(EVENTS.dataChanged, { entity: 'revenue' })
      return result
    }
  })

  registerHandler({
    channel: IPC.revenueAttachEvidence,
    mutating: true,
    parse: (raw) => revenueAttachEvidencePayload.parse(raw),
    handler: async (input) => {
      const options: OpenDialogOptions = {
        title: 'Chọn file bằng chứng',
        properties: ['openFile'],
        filters: EVIDENCE_FILTERS
      }
      const parent = parentWindow()
      const selection = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
      if (selection.canceled || selection.filePaths.length === 0) {
        return { fileName: null }
      }
      const result = attachEvidenceFile(input.revenueId, selection.filePaths[0])
      broadcastToRenderers(EVENTS.dataChanged, { entity: 'revenue' })
      return result
    }
  })
}
