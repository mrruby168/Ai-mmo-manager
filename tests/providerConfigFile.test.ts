import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aiConfigImportSchema } from '../src/shared/schemas'

const raw = readFileSync(resolve(process.cwd(), 'providers-current.json'), 'utf8')
const config = aiConfigImportSchema.parse(JSON.parse(raw) as unknown)

describe('providers-current.json', () => {
  it('parses with the import schema used by the app', () => {
    expect(config.schemaVersion).toBe('1.0')
    expect(config.providers).toHaveLength(5)
  })

  it('has unique provider ids and unique model ids inside each provider', () => {
    const ids = config.providers.map((provider) => provider.id ?? '')
    expect(new Set(ids).size).toBe(ids.length)
    for (const provider of config.providers) {
      const modelIds = provider.models.map((model) => model.id)
      expect(new Set(modelIds).size).toBe(modelIds.length)
    }
  })

  it('never ships an API key inside the file', () => {
    expect(config.apiKey).toBeUndefined()
    for (const provider of config.providers) {
      expect(provider.apiKey).toBeUndefined()
      expect(provider.headers).toBeUndefined()
    }
  })

  it('keeps BeatAPI on the direct text endpoint without native web search', () => {
    const beatapi = config.providers.find((provider) => provider.id === 'beatapi')
    expect(beatapi?.baseUrl).toBe('https://direct.beatapi.io/v1')
    expect(beatapi?.models.map((model) => model.id)).toEqual([
      'deepseek-v4.1-flash-free',
      'glm-5.3',
      'deepseek-v4-pro-0813'
    ])
    expect(beatapi?.models.every((model) => model.supportsWebSearch === false)).toBe(true)
    expect(beatapi?.models.filter((model) => model.costTier === 'free')).toHaveLength(1)
    expect(beatapi?.models.filter((model) => model.costTier === 'paid')).toHaveLength(2)
  })

  it('keeps a blank custom template ready to edit', () => {
    const custom = config.providers.find((provider) => provider.id === 'custom-template')
    expect(custom?.type).toBe('custom')
    expect(custom?.baseUrl).toBe('')
    expect(custom?.models).toHaveLength(1)
  })
})
