import { describe, expect, it } from 'vitest'
import {
  coerceDate,
  coerceProjectItem,
  coerceUrl,
  extractJsonText,
  extractProjectItems,
  formatZodError,
  parseJsonText
} from '../src/shared/coerce'
import { projectImportItemSchema } from '../src/shared/schemas'

describe('coerceUrl', () => {
  it('adds https to a bare domain', () => {
    expect(coerceUrl('abc.com')).toBe('https://abc.com')
    expect(coerceUrl('  www.abc.com/path  ')).toBe('https://www.abc.com/path')
  })

  it('keeps valid http(s) URLs and rejects other protocols', () => {
    expect(coerceUrl('https://abc.com/x?y=1')).toBe('https://abc.com/x?y=1')
    expect(coerceUrl('http://abc.com')).toBe('http://abc.com')
    expect(coerceUrl('javascript:alert(1)')).toBeUndefined()
    expect(coerceUrl('ftp://abc.com')).toBeUndefined()
    expect(coerceUrl('not a url')).toBeUndefined()
  })

  it('turns @handle into an X or Telegram profile link', () => {
    expect(coerceUrl('@alpha', 'x')).toBe('https://x.com/alpha')
    expect(coerceUrl('@alpha', 'telegram')).toBe('https://t.me/alpha')
    expect(coerceUrl('@bad handle', 'x')).toBeUndefined()
  })

  it('treats null and empty strings as missing', () => {
    expect(coerceUrl(null)).toBeUndefined()
    expect(coerceUrl('')).toBeUndefined()
    expect(coerceUrl(undefined)).toBeUndefined()
    expect(coerceUrl(42)).toBeUndefined()
  })
})

describe('coerceDate', () => {
  it('accepts the four supported formats', () => {
    expect(coerceDate('2026-12-31')).toBe('2026-12-31')
    expect(coerceDate('2026/12/31')).toBe('2026-12-31')
    expect(coerceDate('31/12/2026')).toBe('2026-12-31')
    expect(coerceDate('31-12-2026')).toBe('2026-12-31')
  })

  it('rejects impossible dates and keeps null', () => {
    expect(coerceDate('31/02/2026')).toBeUndefined()
    expect(coerceDate('2026-13-01')).toBeUndefined()
    expect(coerceDate('hôm nay')).toBeUndefined()
    expect(coerceDate(null)).toBeNull()
    expect(coerceDate('')).toBeUndefined()
  })
})

describe('coerceProjectItem', () => {
  it('treats null and empty strings as an empty object', () => {
    expect(coerceProjectItem(null)).toEqual({})
    expect(coerceProjectItem('')).toEqual({})
  })

  it('normalises category aliases, title and url', () => {
    const item = coerceProjectItem({
      type: 'Airdrop',
      title: 'Alpha',
      url: 'abc.com',
      costType: 'paid',
      cost: '$5',
      startDate: '31/12/2026',
      twitter: '@alpha'
    })

    expect(item).toMatchObject({
      category: 'airdrop',
      name: 'Alpha',
      website: 'https://abc.com',
      costType: 'paid',
      costAmountUsd: 5,
      startDate: '2026-12-31',
      socials: { x: 'https://x.com/alpha' }
    })
  })

  it('maps event/mmo aliases to event_mmo', () => {
    expect((coerceProjectItem({ category: 'Event', name: 'X' }) as { category: string }).category).toBe('event_mmo')
    expect((coerceProjectItem({ category: 'MMO', name: 'X' }) as { category: string }).category).toBe('event_mmo')
    expect((coerceProjectItem({ category: 'air_drop', name: 'X' }) as { category: string }).category).toBe('airdrop')
  })

  it('downgrades paid projects without an amount to unverified', () => {
    const item = coerceProjectItem({ category: 'airdrop', name: 'X', costType: 'paid' })
    expect(item).toMatchObject({ costType: 'unverified', costAmountUsd: undefined })
  })

  it('drops broken source links instead of failing the project', () => {
    const item = coerceProjectItem({
      category: 'airdrop',
      name: 'X',
      sources: ['https://ok.example.com', 'not a url', 'ok.example.com', 'javascript:alert(1)']
    }) as { sources: string[] }

    expect(item.sources).toEqual(['https://ok.example.com'])
  })

  it('produces an item accepted by the strict zod schema', () => {
    const parsed = projectImportItemSchema.parse(
      coerceProjectItem({
        type: 'event',
        title: 'Loose',
        url: 'loose.example.com',
        socials: { telegram: '@loose' },
        costType: 'free',
        endDate: '31/12/2026'
      })
    )

    expect(parsed.category).toBe('event_mmo')
    expect(parsed.name).toBe('Loose')
    expect(parsed.socials?.telegram).toBe('https://t.me/loose')
    expect(parsed.endDate).toBe('2026-12-31')
  })
})

describe('extractProjectItems', () => {
  it('supports the accepted wrappers', () => {
    expect(extractProjectItems([{ name: 'a' }])).toEqual([{ name: 'a' }])
    expect(extractProjectItems({ projects: [{ name: 'a' }] })).toEqual([{ name: 'a' }])
    expect(extractProjectItems({ items: [{ name: 'a' }] })).toEqual([{ name: 'a' }])
    expect(extractProjectItems({ data: [{ name: 'a' }] })).toEqual([{ name: 'a' }])
    expect(extractProjectItems({ name: 'single' })).toEqual([{ name: 'single' }])
  })

  it('ignores schemaVersion and unrelated payloads', () => {
    expect(extractProjectItems({ schemaVersion: '9.9' })).toEqual([])
    expect(extractProjectItems('nope')).toEqual([])
    expect(extractProjectItems(null)).toEqual([])
  })
})

describe('extractJsonText', () => {
  it('extracts a fenced json block first', () => {
    const text = 'Đây là dữ liệu:\n```json\n{"projects":[{"name":"A"}]}\n```\nCảm ơn'
    expect(extractJsonText(text)).toBe('{"projects":[{"name":"A"}]}')
  })

  it('extracts a balanced object or array from a sentence', () => {
    expect(extractJsonText('thêm { "name": "A" } giúp tôi')).toBe('{ "name": "A" }')
    expect(extractJsonText('danh sách [{"name":"A"}] nhé')).toBe('[{"name":"A"}]')
  })

  it('does not crash on braces inside strings', () => {
    expect(extractJsonText('{"name":"A {B}"}')).toBe('{"name":"A {B}"}')
  })

  it('returns null when there is no JSON', () => {
    expect(extractJsonText('thêm airdrop X')).toBeNull()
  })
})

describe('formatZodError', () => {
  it('lists at most three issues with their paths', () => {
    const result = projectImportItemSchema.safeParse({})
    expect(result.success).toBe(false)
    if (result.success) {
      return
    }
    const message = formatZodError(result.error)
    expect(message).toContain('category')
    expect(message.split('; ').length).toBeLessThanOrEqual(4)
  })
})

describe('parseJsonText', () => {
  it('strips a UTF-8 BOM', () => {
    expect(parseJsonText('\uFEFF{"projects":[]}')).toEqual({ projects: [] })
  })

  it('reports invalid JSON with a readable message', () => {
    expect(() => parseJsonText('{ bad')).toThrow(/JSON không hợp lệ/)
  })
})
