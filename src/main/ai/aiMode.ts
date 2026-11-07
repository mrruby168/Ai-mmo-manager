import type { AiMode } from '@shared/constants'
import { getSettings } from '../services/settingsStore'

export const AI_DISABLED_MESSAGE = 'Vui lòng bật AI Mode trong Settings để sử dụng tính năng AI.'

/** Error surfaced to the renderer as `{ code: 'AI_DISABLED' }`. */
export class AiDisabledError extends Error {
  readonly code = 'AI_DISABLED'

  constructor(message: string = AI_DISABLED_MESSAGE) {
    super(message)
    this.name = 'AiDisabledError'
  }
}

/**
 * Single gate for every AI entry point in the main process. UI state is not a
 * security boundary, so the check lives here as well.
 */
export function assertAiEnabled(settings: { aiMode: AiMode } = getSettings()): void {
  if (settings.aiMode === 'noai') {
    throw new AiDisabledError()
  }
}

export function isAiEnabled(settings: { aiMode: AiMode } = getSettings()): boolean {
  return settings.aiMode !== 'noai'
}
