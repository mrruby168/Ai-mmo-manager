import { describe, expect, it } from 'vitest'
import {
  PROJECT_NAME_QUERY_MAX_RESULTS,
  PROJECT_X_QUERY_MAX_RESULTS,
  buildGroupedProjectNameQueries,
  buildProjectQueries,
  extractXHandle,
  queryTextHitsProject
} from '../src/shared/projectQueries'
import type { Project } from '../src/shared/types'

function project(id: string, name: string, x: string | null = null): Project {
  return {
    id,
    category: 'airdrop',
    name,
    nameKey: name.toLowerCase(),
    domainKey: null,
    website: null,
    socials: x ? { x } : {},
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
    rowVersion: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z'
  }
}

describe('extractXHandle', () => {
  it('nhận URL x.com/twitter.com, @handle và handle trần', () => {
    expect(extractXHandle('https://x.com/Alpha_Drop')).toBe('Alpha_Drop')
    expect(extractXHandle('https://www.twitter.com/Alpha_Drop/status/123')).toBe('Alpha_Drop')
    expect(extractXHandle('https://mobile.twitter.com/Alpha_Drop')).toBe('Alpha_Drop')
    expect(extractXHandle('@Alpha_Drop')).toBe('Alpha_Drop')
    expect(extractXHandle('Alpha_Drop')).toBe('Alpha_Drop')
  })

  it('từ chối domain khác, handle quá dài hoặc rỗng', () => {
    expect(extractXHandle('https://example.com/Alpha')).toBeNull()
    expect(extractXHandle('https://x.com/')).toBeNull()
    expect(extractXHandle('@handle-quá-dài-1234567890')).toBeNull()
    expect(extractXHandle('')).toBeNull()
    expect(extractXHandle(null)).toBeNull()
  })
})

describe('buildProjectQueries', () => {
  it('dự án có handle X: truy vấn X trước (8 kết quả) rồi tên (6 kết quả)', () => {
    const queries = buildProjectQueries(project('PRJ-001', 'Alpha Drop', 'https://x.com/Alpha_Drop'))
    expect(queries).toHaveLength(2)
    expect(queries[0]).toMatchObject({
      projectId: 'PRJ-001',
      kind: 'x',
      maxResults: PROJECT_X_QUERY_MAX_RESULTS
    })
    expect(queries[0].query).toContain('Alpha_Drop')
    expect(queries[1]).toMatchObject({
      projectId: 'PRJ-001',
      kind: 'name',
      maxResults: PROJECT_NAME_QUERY_MAX_RESULTS
    })
    expect(queries[1].query).toContain('Alpha Drop')
  })

  it('dự án không có handle X: chỉ truy vấn tên', () => {
    const queries = buildProjectQueries(project('PRJ-002', 'Beta Net'))
    expect(queries).toHaveLength(1)
    expect(queries[0].kind).toBe('name')
    expect(queries[0].query).toContain('Beta Net')
  })

  it('không dùng toán tử site:/from: hay bộ lọc thời gian (D24)', () => {
    for (const query of buildProjectQueries(project('PRJ-003', 'Gamma', 'https://x.com/gamma'))) {
      expect(query.query.toLowerCase()).not.toContain('site:')
      expect(query.query.toLowerCase()).not.toContain('from:')
      expect(query.query).not.toMatch(/since:|until:|after:|before:/i)
    }
  })

  it('làm sạch tên có ngoặc kép/ngoặc tròn', () => {
    const queries = buildProjectQueries(project('PRJ-004', 'Delta "X" (Y)'))
    expect(queries[0].query).toContain('"Delta X Y"')
  })
})

describe('buildGroupedProjectNameQueries', () => {
  it('chỉ gộp dự án không có handle, 3 tên mỗi truy vấn kèm projectIds', () => {
    const groups = buildGroupedProjectNameQueries([
      project('PRJ-001', 'Alpha', 'https://x.com/alpha'),
      project('PRJ-002', 'Beta'),
      project('PRJ-003', 'Gamma'),
      project('PRJ-004', 'Delta')
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].projectIds).toEqual(['PRJ-002', 'PRJ-003', 'PRJ-004'])
    expect(groups[0].query).toContain('Beta')
    expect(groups[0].query).toContain('Gamma')
    expect(groups[0].query).toContain('Delta')
    expect(groups[0].query).not.toContain('Alpha')
    expect(groups[0].maxResults).toBe(PROJECT_NAME_QUERY_MAX_RESULTS)
  })

  it('chia nhóm khi quá 3 dự án', () => {
    const groups = buildGroupedProjectNameQueries(
      Array.from({ length: 5 }, (_, index) => project(`PRJ-00${index}`, `Project ${index}`))
    )
    expect(groups).toHaveLength(2)
    expect(groups[0].projectIds).toHaveLength(3)
    expect(groups[1].projectIds).toHaveLength(2)
  })

  it('trả rỗng khi mọi dự án đều có handle X', () => {
    expect(
      buildGroupedProjectNameQueries([project('PRJ-001', 'Alpha', 'https://x.com/alpha')])
    ).toEqual([])
  })
})

describe('queryTextHitsProject', () => {
  const alpha = project('PRJ-001', 'Alpha Drop', 'https://x.com/Alpha_Drop')

  it('khớp theo tên dự án', () => {
    expect(
      queryTextHitsProject(
        { title: 'Alpha Drop ra mắt', url: 'https://news.example.com/a', snippet: 'airdrop' },
        alpha
      )
    ).toBe(true)
  })

  it('khớp theo handle X trong URL bài đăng', () => {
    expect(
      queryTextHitsProject(
        { title: 'Airdrop mới', url: 'https://x.com/Alpha_Drop/status/123', snippet: '' },
        alpha
      )
    ).toBe(true)
  })

  it('không khớp khi kết quả nói về dự án khác', () => {
    expect(
      queryTextHitsProject(
        { title: 'Beta Net airdrop', url: 'https://news.example.com/b', snippet: 'beta' },
        alpha
      )
    ).toBe(false)
  })
})
