import { describe, expect, it } from 'vitest'
import {
  aiConfigImportSchema,
  newsResultSchema,
  projectImportSchema,
  revenueInputSchema,
  scanResultSchema
} from '@shared/schemas'

describe('project import schema', () => {
  it('accepts a minimal valid payload', () => {
    const result = projectImportSchema.safeParse({
      schemaVersion: '1.0',
      projects: [{ category: 'airdrop', name: 'Demo' }]
    })
    expect(result.success).toBe(true)
  })

  it('rejects paid projects without an amount', () => {
    const result = projectImportSchema.safeParse({
      schemaVersion: '1.0',
      projects: [{ category: 'airdrop', name: 'Demo', costType: 'paid' }]
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid URLs, empty names and inverted dates', () => {
    expect(
      projectImportSchema.safeParse({
        schemaVersion: '1.0',
        projects: [{ category: 'airdrop', name: 'Demo', website: 'not-a-url' }]
      }).success
    ).toBe(false)

    expect(
      projectImportSchema.safeParse({
        schemaVersion: '1.0',
        projects: [{ category: 'airdrop', name: '   ' }]
      }).success
    ).toBe(false)

    expect(
      projectImportSchema.safeParse({
        schemaVersion: '1.0',
        projects: [{ category: 'airdrop', name: 'Demo', startDate: '2026-11-10', endDate: '2026-11-01' }]
      }).success
    ).toBe(false)
  })
})

describe('scan result schema', () => {
  it('applies conservative defaults when evidence is missing', () => {
    const parsed = scanResultSchema.parse({
      items: [{ name: 'Demo', category: 'event_mmo' }]
    })

    expect(parsed.items[0]).toMatchObject({
      costType: 'unverified',
      riskLevel: 'unknown',
      verification: 'unverified',
      sources: [],
      summary: ''
    })
  })

  it('allows the insufficient category and rejects paid without amount', () => {
    expect(
      scanResultSchema.safeParse({ items: [{ name: 'Demo', category: 'insufficient' }] }).success
    ).toBe(true)

    expect(
      scanResultSchema.safeParse({ items: [{ name: 'Demo', category: 'airdrop', costType: 'paid' }] }).success
    ).toBe(false)
  })
})

describe('news result schema', () => {
  it('rejects summaries longer than 280 characters', () => {
    const result = newsResultSchema.safeParse({
      items: [
        {
          projectId: 'PRJ-001',
          kind: 'important',
          summary: 'x'.repeat(281),
          verification: 'verified',
          sourceUrl: 'https://example.com/post',
          publishedAt: '2026-11-05T08:00:00.000Z'
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('accepts a valid news item', () => {
    const result = newsResultSchema.safeParse({
      items: [
        {
          projectId: 'PRJ-001',
          kind: 'todo',
          summary: 'Hoàn thành nhiệm vụ X trước deadline',
          verification: 'unverified',
          sourceUrl: 'https://example.com/post',
          publishedAt: '2026-11-05T08:00:00.000Z',
          todoDeadline: '2026-11-07'
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('accepts an optional milestone and rejects a malformed date', () => {
    const base = {
      projectId: 'PRJ-001',
      kind: 'important',
      summary: 'Snapshot sắp tới',
      verification: 'verified',
      sourceUrl: 'https://example.com/post',
      publishedAt: '2026-11-05T08:00:00.000Z'
    }

    const ok = newsResultSchema.safeParse({
      items: [{ ...base, milestoneKind: 'snapshot', milestoneDate: '2026-11-10' }]
    })
    expect(ok.success).toBe(true)

    const legacy = newsResultSchema.safeParse({ items: [base] })
    expect(legacy.success).toBe(true)

    const badDate = newsResultSchema.safeParse({
      items: [{ ...base, milestoneKind: 'snapshot', milestoneDate: '10/11/2026' }]
    })
    expect(badDate.success).toBe(false)

    const badKind = newsResultSchema.safeParse({
      items: [{ ...base, milestoneKind: 'launch', milestoneDate: '2026-11-10' }]
    })
    expect(badKind.success).toBe(false)
  })
})

describe('ai config import schema', () => {
  it('requires at least one provider but keeps the api key optional', () => {
    expect(aiConfigImportSchema.safeParse({ schemaVersion: '1.0', providers: [] }).success).toBe(false)

    const result = aiConfigImportSchema.safeParse({
      schemaVersion: '1.0',
      providers: [
        {
          id: 'custom-1',
          type: 'custom',
          name: 'Local',
          baseUrl: 'https://api.example.com/v1',
          models: [{ id: 'model-a', label: 'Model A' }]
        }
      ]
    })
    expect(result.success).toBe(true)
  })
})

describe('revenue input schema', () => {
  it('requires received amount for claimed non-point entries', () => {
    expect(
      revenueInputSchema.safeParse({
        projectId: 'PRJ-001',
        projectNameSnapshot: 'Demo',
        rewardKind: 'token',
        rewardSymbol: 'ABC',
        claimStatus: 'claimed'
      }).success
    ).toBe(false)

    expect(
      revenueInputSchema.safeParse({
        projectId: 'PRJ-001',
        projectNameSnapshot: 'Demo',
        rewardKind: 'points',
        rewardSymbol: 'points',
        claimStatus: 'claimed',
        receivedAmount: 100
      }).success
    ).toBe(true)
  })
})
