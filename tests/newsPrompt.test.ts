import { describe, expect, it } from 'vitest'
import {
  buildNewsPrompt,
  isWithinNewsWindow,
  newsResultJsonSchema,
  promptDateOnly
} from '../src/shared/newsPrompt'
import type { NewsPromptProject } from '../src/shared/newsPrompt'

const now = new Date('2026-11-06T03:00:00.000Z') // 10:00 in Asia/Bangkok

function project(overrides: Partial<NewsPromptProject> = {}): NewsPromptProject {
  return {
    id: 'PRJ-001',
    name: 'Alpha',
    category: 'airdrop',
    website: 'https://alpha.example.com',
    x: 'https://x.com/alpha',
    discord: null,
    telegram: null,
    other: [],
    ...overrides
  }
}

describe('buildNewsPrompt', () => {
  it('includes every project id and keeps projects without X', () => {
    const prompt = buildNewsPrompt(
      [project(), project({ id: 'PRJ-002', name: 'Beta', x: null })],
      now
    )

    expect(prompt).toContain('"id": "PRJ-001"')
    expect(prompt).toContain('"id": "PRJ-002"')
    expect(prompt).toContain('"x": "không có"')
  })

  it('embeds the JSON Schema generated from newsResultSchema', () => {
    const schema = newsResultJsonSchema()
    const prompt = buildNewsPrompt([project()], now)

    expect(schema).toHaveProperty('properties')
    expect(prompt).toContain('"projectId"')
    expect(prompt).toContain('"kind"')
    expect(prompt).toContain('"summary"')
    expect(prompt).toContain('"sourceUrl"')
  })

  it('uses the Asia/Bangkok date, not the host timezone', () => {
    expect(promptDateOnly(now)).toBe('2026-11-06')
    // 18:00 UTC on Nov 5 is already Nov 6 in UTC+7.
    expect(promptDateOnly(new Date('2026-11-05T18:00:00.000Z'))).toBe('2026-11-06')
    expect(buildNewsPrompt([project()], now)).toContain('2026-11-06')
  })

  it('never contains API key material', () => {
    const prompt = buildNewsPrompt([project()], now)
    expect(prompt).not.toContain('sk-')
    expect(prompt.toLowerCase()).not.toContain('api key:')
  })
})

describe('isWithinNewsWindow', () => {
  it('accepts today and the previous 6 days (UTC+7)', () => {
    expect(isWithinNewsWindow('2026-11-06T08:00:00+07:00', now)).toBe(true)
    expect(isWithinNewsWindow('2026-10-31T00:00:00+07:00', now)).toBe(true)
  })

  it('rejects anything older than 7 days', () => {
    expect(isWithinNewsWindow('2026-10-30T23:59:59+07:00', now)).toBe(false)
  })

  it('rejects an unparseable date', () => {
    expect(isWithinNewsWindow('not-a-date', now)).toBe(false)
  })
})
