import { afterAll, describe, expect, it } from 'vitest'
import {
  COST_LIMITS,
  buildGroupedSearchQueries,
  chunk,
  isCacheFresh,
  pickNewsBatchSize
} from '../src/shared/costControl'
import { extractRelevantText } from '../src/shared/pageExcerpt'
import { createSearchBudget } from '../src/main/ai/searchBudget'
import { projectLinkFingerprint, scanCacheKey } from '../src/main/ai/cacheKeys'
import { applyAnthropicPromptCache } from '../src/main/ai/providers/anthropic'
import { compactToolMessages, runAgent } from '../src/main/ai/agentRunner'
import { createWebSearchTool, getNewsTools, getScanTools } from '../src/main/ai/tools'
import { closeDatabase, getDatabase as getDatabaseForTest, openDatabase } from '../src/main/db/connection'
import {
  getNewsCheckEntries,
  getScanCacheEntries,
  markNewsChecked,
  purgeAiCache,
  putScanCacheEntries
} from '../src/main/db/aiCacheRepo'
import { insertProject } from '../src/main/db/projectsRepo'
import type { AiMessage, AiRequest, ModelClient } from '../src/main/ai/types'
import type { ScanItem } from '../src/shared/types'

/** TTL 12 giờ cố định cho các test cache thuần (app dùng TTL trong settings). */
const NEWS_TTL_MS = 12 * 60 * 60 * 1000

describe('grouped search queries', () => {
  it('merges projects with OR and quotes multi-word names', () => {
    expect(buildGroupedSearchQueries(['Alpha Net', 'Beta', 'Gamma'], 'airdrop news')).toEqual([
      '("Alpha Net" OR Beta OR Gamma) airdrop news'
    ])
  })

  it('splits groups of more than 3 and never merges a single project with OR', () => {
    const queries = buildGroupedSearchQueries(['A1', 'B2', 'C3', 'D4', 'E5'], 'airdrop news')
    expect(queries).toEqual(['(A1 OR B2 OR C3) airdrop news', '(D4 OR E5) airdrop news'])
    expect(buildGroupedSearchQueries(['Solo'], 'airdrop news')).toEqual(['Solo airdrop news'])
  })

  it('drops duplicates, blanks and boolean-breaking characters', () => {
    expect(buildGroupedSearchQueries(['Alpha', 'alpha', '  ', 'Be"ta (x)'], 'news')).toEqual([
      '(Alpha OR "Be ta x") news'
    ])
  })

  it('keeps every query below the length cap', () => {
    const names = Array.from({ length: 6 }, (_, index) => `Very Long Project Name Number ${index}`)
    const queries = buildGroupedSearchQueries(names, 'airdrop news', { maxLength: 120 })
    expect(queries.length).toBeGreaterThan(1)
    for (const query of queries) {
      expect(query.length).toBeLessThanOrEqual(120)
    }
  })
})

describe('batching helpers', () => {
  it('chunks lists', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
  })

  it('keeps 3 per batch only for Anthropic native search', () => {
    expect(pickNewsBatchSize('anthropic', true)).toBe(3)
    expect(pickNewsBatchSize('anthropic', false)).toBe(5)
    expect(pickNewsBatchSize('google', true)).toBe(5)
  })
})

describe('cache freshness', () => {
  const now = Date.parse('2026-11-09T12:00:00.000Z')
  const ttl = NEWS_TTL_MS

  it('is fresh inside the TTL and stale outside it', () => {
    expect(isCacheFresh('2026-11-09T05:00:00.000Z', now, ttl)).toBe(true)
    expect(isCacheFresh('2026-11-08T23:59:00.000Z', now, ttl)).toBe(false)
  })

  it('rejects missing, invalid and future timestamps', () => {
    expect(isCacheFresh(null, now, ttl)).toBe(false)
    expect(isCacheFresh('not a date', now, ttl)).toBe(false)
    expect(isCacheFresh('2026-11-10T00:00:00.000Z', now, ttl)).toBe(false)
  })
})

describe('page excerpt', () => {
  it('returns short pages untouched', () => {
    expect(extractRelevantText('hello\nworld', { maxChars: 500 })).toBe('hello\nworld')
  })

  it('keeps keyword and date lines and drops filler', () => {
    const filler = Array.from({ length: 400 }, (_, index) => `Cookie banner line ${index} about nothing`)
    const page = [
      'Alpha Network',
      ...filler,
      'Snapshot will happen on 2026-11-20 UTC',
      ...filler,
      'Claim opens Dec 3 for eligible wallets'
    ].join('\n')

    const excerpt = extractRelevantText(page, { maxChars: 1_500 })
    expect(excerpt.length).toBeLessThanOrEqual(1_500)
    expect(excerpt).toContain('Alpha Network')
    expect(excerpt).toContain('Snapshot will happen on 2026-11-20 UTC')
    expect(excerpt).toContain('Claim opens Dec 3')
    expect(excerpt).not.toContain('Cookie banner line 200')
  })

  it('falls back to the page head when nothing matches', () => {
    const page = Array.from({ length: 300 }, (_, index) => `plain row ${index}`).join('\n')
    const excerpt = extractRelevantText(page, { maxChars: 400 })
    expect(excerpt.startsWith('plain row 0')).toBe(true)
    expect(excerpt).toContain('không thấy từ khóa liên quan')
  })
})

describe('search budget', () => {
  it('blocks app-side searches once the cap is reached', () => {
    const budget = createSearchBudget(2)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(false)
    expect(budget.exhausted()).toBe(true)
    expect(budget.used()).toBe(2)
  })

  it('counts provider-side searches after the fact', () => {
    const budget = createSearchBudget(5)
    budget.record(4)
    expect(budget.remaining()).toBe(1)
    budget.record(3)
    expect(budget.exhausted()).toBe(true)
  })
})

describe('cache keys', () => {
  const base = { name: 'Alpha Net', website: 'https://www.alpha.io/', socials: { x: 'https://x.com/alpha' } }

  it('ignores cosmetic URL differences', () => {
    expect(projectLinkFingerprint(base)).toBe(
      projectLinkFingerprint({ ...base, website: 'http://alpha.io', socials: { x: 'https://x.com/alpha/' } })
    )
  })

  it('changes when a link or the name changes', () => {
    const original = projectLinkFingerprint(base)
    expect(projectLinkFingerprint({ ...base, website: 'https://alpha.xyz' })).not.toBe(original)
    expect(projectLinkFingerprint({ ...base, socials: { x: 'https://x.com/other' } })).not.toBe(original)
    expect(projectLinkFingerprint({ ...base, name: 'Alpha Net 2' })).not.toBe(original)
  })

  it('keys scan results by normalised name and domain', () => {
    expect(scanCacheKey('Alpha  Net', 'https://www.alpha.io/path')).toBe(scanCacheKey('alpha net', 'https://alpha.io'))
    expect(scanCacheKey('Alpha Net', 'https://beta.io')).not.toBe(scanCacheKey('Alpha Net', 'https://alpha.io'))
  })
})

describe('aiCacheRepo', () => {
  openDatabase(':memory:')
  afterAll(() => closeDatabase())

  const item: ScanItem = {
    name: 'Alpha',
    category: 'airdrop',
    website: 'https://alpha.io',
    summary: 's',
    taskSummary: '',
    howToJoin: '',
    startDate: null,
    endDate: null,
    costType: 'free',
    costAmountUsd: null,
    riskLevel: 'low',
    riskReason: null,
    potential: null,
    verification: 'verified',
    sources: ['https://alpha.io/blog'],
    duplicateOf: null
  }

  it('stores and reads news check entries', () => {
    markNewsChecked([{ projectId: 'PRJ-001', fingerprint: 'abc' }], '2026-11-09T01:00:00.000Z')
    const entries = getNewsCheckEntries()
    expect(entries.get('PRJ-001')).toEqual({ fingerprint: 'abc', checkedAt: '2026-11-09T01:00:00.000Z' })
  })

  it('overwrites an entry for the same project', () => {
    markNewsChecked([{ projectId: 'PRJ-001', fingerprint: 'def' }], '2026-11-09T02:00:00.000Z')
    expect(getNewsCheckEntries().get('PRJ-001')?.fingerprint).toBe('def')
  })

  it('stores scan results by key and only returns the requested keys', () => {
    putScanCacheEntries([{ key: 'k1', item }], '2026-11-09T01:00:00.000Z')
    putScanCacheEntries([{ key: 'k2', item: { ...item, name: 'Beta' } }], '2026-11-09T01:00:00.000Z')
    const found = getScanCacheEntries(['k1'])
    expect([...found.keys()]).toEqual(['k1'])
    expect(found.get('k1')?.item.name).toBe('Alpha')
  })

  it('purges expired entries and entries of deleted projects', () => {
    insertProject({
      id: 'PRJ-009',
      category: 'airdrop',
      name: 'Keep',
      nameKey: 'keep',
      domainKey: null,
      website: null,
      socials: {},
      taskSummary: '',
      howToJoin: '',
      startDate: null,
      endDate: null,
      costType: 'free',
      costAmountUsd: null,
      status: 'not_joined',
      verification: 'unverified',
      sources: [],
      logoPath: null,
      notes: '',
      origin: 'manual',
      createdAt: '2026-11-09T00:00:00.000Z',
      updatedAt: '2026-11-09T00:00:00.000Z'
    })
    markNewsChecked([{ projectId: 'PRJ-009', fingerprint: 'keep' }], '2026-11-09T11:00:00.000Z')

    const now = Date.parse('2026-11-09T12:00:00.000Z')
    const removed = purgeAiCache(now, NEWS_TTL_MS, COST_LIMITS.scanCacheTtlMs)
    // PRJ-001 has no project row, k1/k2 are 11h old (< 24h) so only PRJ-001 goes.
    expect(removed).toBe(1)
    expect(getNewsCheckEntries().has('PRJ-001')).toBe(false)
    expect(getNewsCheckEntries().has('PRJ-009')).toBe(true)
    expect(getScanCacheEntries(['k1', 'k2']).size).toBe(2)

    const later = Date.parse('2026-11-11T00:00:00.000Z')
    expect(purgeAiCache(later, NEWS_TTL_MS, COST_LIMITS.scanCacheTtlMs)).toBe(3)
  })
})

describe('tool sets in cost-control mode', () => {
  it('drops list_projects/get_project and keeps the legacy set without the option', () => {
    const lean = getNewsTools({ costControl: {} }).map((tool) => tool.name)
    expect(lean).toEqual(['web_fetch', 'submit_news'])
    expect(getNewsTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['list_projects', 'get_project'])
    )
    expect(getScanTools({ costControl: {} }).map((tool) => tool.name)).toEqual([
      'web_fetch',
      'list_existing_projects',
      'submit_scan_result'
    ])
  })

  it('charges the shared budget for every app-side search', async () => {
    const budget = createSearchBudget(1)
    let calls = 0
    const tool = createWebSearchTool(
      {
        provider: 'tavily',
        search: async () => {
          calls += 1
          return []
        }
      },
      undefined,
      4,
      budget
    )
    const signal = new AbortController().signal
    await tool.handler({ query: 'a' }, { signal })
    const blocked = await tool.handler({ query: 'b' }, { signal })
    expect(calls).toBe(1)
    expect(String(blocked)).toContain('hạn mức')
  })
})

describe('Anthropic prompt cache markers', () => {
  it('marks system, the last custom tool and the last user block, and nothing else', () => {
    const body: Record<string, unknown> = {
      system: 'SYS',
      tools: [
        { name: 'a', description: 'a', input_schema: {} },
        { name: 'b', description: 'b', input_schema: {} },
        { type: 'web_search_20250305', name: 'web_search', max_uses: 5 }
      ],
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'first' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'raw' }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'x' }] }
      ]
    }
    applyAnthropicPromptCache(body)

    expect(body.system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }])
    const tools = body.tools as Array<Record<string, unknown>>
    expect(tools[0].cache_control).toBeUndefined()
    expect(tools[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(tools[2].cache_control).toBeUndefined()
    const messages = body.messages as Array<{ content: Array<Record<string, unknown>> }>
    expect(messages[0].content[0].cache_control).toBeUndefined()
    expect(messages[2].content[0].cache_control).toEqual({ type: 'ephemeral' })
  })
})

describe('agent loop cost control', () => {
  const long = 'x'.repeat(5_000)

  it('shortens only stale tool results, in the copy sent to the model', () => {
    const messages: AiMessage[] = [
      { role: 'user', content: 'go' },
      { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 't', arguments: {} }] },
      { role: 'tool', toolCallId: '1', toolName: 't', content: `<untrusted_web_content source="u">\n${long}\n</untrusted_web_content>` },
      { role: 'assistant', content: '', toolCalls: [{ id: '2', name: 't', arguments: {} }] },
      { role: 'tool', toolCallId: '2', toolName: 't', content: long },
      { role: 'assistant', content: '', toolCalls: [{ id: '3', name: 't', arguments: {} }] },
      { role: 'tool', toolCallId: '3', toolName: 't', content: long }
    ]
    const compact = compactToolMessages(messages, { keepFullTurns: 2, maxChars: 1_000 })

    expect(compact[2].content.length).toBeLessThan(1_200)
    expect(compact[2].content.endsWith('</untrusted_web_content>')).toBe(true)
    expect(compact[4].content).toBe(long)
    expect(compact[6].content).toBe(long)
    expect(messages[2].content.length).toBeGreaterThan(5_000)
  })

  it('reports usage and forwards promptCache on every step', async () => {
    const requests: AiRequest[] = []
    const responses = [
      { text: '', toolCalls: [{ id: 'c1', name: 'ping', arguments: {} }], usage: { inputTokens: 100, outputTokens: 10 }, searchCount: 2 },
      { text: 'done', toolCalls: [], usage: { inputTokens: 150, outputTokens: 5 } }
    ]
    const client: ModelClient = {
      complete: async (request) => {
        requests.push({ ...request, messages: [...request.messages] })
        return responses.shift()!
      }
    }
    const usages: Array<{ inputTokens: number; outputTokens: number; searches: number }> = []
    await runAgent({
      client,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'ping', description: 'p', parameters: { type: 'object', properties: {} }, handler: () => 'pong' }],
      signal: new AbortController().signal,
      promptCache: true,
      onUsage: (usage) => usages.push(usage)
    })

    expect(usages).toEqual([
      { inputTokens: 100, outputTokens: 10, searches: 2 },
      { inputTokens: 150, outputTokens: 5, searches: 0 }
    ])
    expect(requests.every((request) => request.promptCache === true)).toBe(true)
  })

  it('does not add promptCache when it was not requested', async () => {
    const requests: AiRequest[] = []
    const client: ModelClient = {
      complete: async (request) => {
        requests.push(request)
        return { text: 'ok', toolCalls: [], usage: null }
      }
    }
    await runAgent({ client, system: 's', messages: [{ role: 'user', content: 'x' }], tools: [], signal: new AbortController().signal })
    expect('promptCache' in requests[0]).toBe(false)
  })
})

describe('aiCacheRepo without an open database', () => {
  it('reads as empty and skips writes instead of throwing (old tests never open the DB)', () => {
    closeDatabase()
    expect(getNewsCheckEntries().size).toBe(0)
    expect(getScanCacheEntries(['k1']).size).toBe(0)
    expect(() => markNewsChecked([{ projectId: 'PRJ-001', fingerprint: 'x' }], '2026-11-09T00:00:00.000Z')).not.toThrow()
    expect(() => putScanCacheEntries([{ key: 'k', item: {} as ScanItem }], '2026-11-09T00:00:00.000Z')).not.toThrow()
    expect(purgeAiCache(Date.now(), NEWS_TTL_MS, COST_LIMITS.scanCacheTtlMs)).toBe(0)
  })

  it('still throws real database errors once a database is open', () => {
    openDatabase(':memory:')
    getDatabaseForTest().exec('DROP TABLE meta')
    expect(() => getNewsCheckEntries()).toThrow()
    closeDatabase()
  })
})
