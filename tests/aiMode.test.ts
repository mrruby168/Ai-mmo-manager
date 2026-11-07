import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() }
}))

import type { AiMode } from '../src/shared/constants'
import { AiDisabledError, assertAiEnabled, isAiEnabled } from '../src/main/ai/aiMode'
import { normalizeSettings } from '../src/main/services/settingsStore'

describe('aiMode settings normalisation', () => {
  it('defaults legacy settings (no aiMode field) to "ai"', () => {
    expect(normalizeSettings({ schemaVersion: 1 }).aiMode).toBe('ai')
  })

  it('keeps an explicit "noai" value', () => {
    expect(normalizeSettings({ aiMode: 'noai' }).aiMode).toBe('noai')
  })

  it('falls back to "ai" for an unknown value', () => {
    const legacy = { aiMode: 'other' as unknown as AiMode }
    expect(normalizeSettings(legacy).aiMode).toBe('ai')
  })
})

describe('main-process AI gate', () => {
  it('throws AI_DISABLED when No AI Mode is active', () => {
    try {
      assertAiEnabled({ aiMode: 'noai' })
      throw new Error('assertAiEnabled should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(AiDisabledError)
      expect((error as AiDisabledError).code).toBe('AI_DISABLED')
    }
  })

  it('allows AI when AI Mode is active', () => {
    expect(() => assertAiEnabled({ aiMode: 'ai' })).not.toThrow()
    expect(isAiEnabled({ aiMode: 'ai' })).toBe(true)
    expect(isAiEnabled({ aiMode: 'noai' })).toBe(false)
  })
})
