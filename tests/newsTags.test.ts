import { describe, expect, it } from 'vitest'
import { NEWS_TAG_LABEL, deriveNewsTags } from '../src/shared/newsTags'

const TODAY = '2026-11-16'

function tags(overrides: Partial<Parameters<typeof deriveNewsTags>[0]> = {}) {
  return deriveNewsTags(
    {
      publishedAt: '2026-11-16T08:00:00.000Z',
      todoDeadline: null,
      milestoneKind: null,
      verification: 'verified',
      ...overrides
    },
    TODAY
  )
}

describe('deriveNewsTags', () => {
  it('gắn "Mới" cho tin hôm nay và hôm qua', () => {
    expect(tags()).toEqual(['new'])
    expect(tags({ publishedAt: '2026-11-15T23:00:00.000Z' })).toEqual(['new'])
    expect(tags({ publishedAt: '2026-11-14T23:00:00.000Z' })).toEqual([])
  })

  it('gắn "Cần làm" khi hạn trong 7 ngày hoặc đã quá hạn', () => {
    expect(tags({ todoDeadline: '2026-11-20' })).toContain('deadline')
    expect(tags({ todoDeadline: '2026-11-10' })).toContain('deadline')
    expect(tags({ todoDeadline: '2026-11-30' })).not.toContain('deadline')
  })

  it('gắn "Mốc" khi tin có milestoneKind', () => {
    expect(tags({ milestoneKind: 'tge' })).toContain('milestone')
  })

  it('gắn "Chưa xác minh" cho tin unverified', () => {
    expect(tags({ verification: 'unverified' })).toEqual(['new', 'unverified'])
  })

  it('giữ thứ tự ưu tiên và bỏ qua ngày không hợp lệ', () => {
    expect(
      deriveNewsTags(
        {
          publishedAt: 'không rõ',
          todoDeadline: '2026-11-18',
          milestoneKind: 'snapshot',
          verification: 'unverified'
        },
        TODAY
      )
    ).toEqual(['deadline', 'milestone', 'unverified'])
  })

  it('có nhãn tiếng Việt cho mọi tag', () => {
    expect(NEWS_TAG_LABEL.new).toBe('Mới')
    expect(NEWS_TAG_LABEL.deadline).toBe('Cần làm')
    expect(NEWS_TAG_LABEL.milestone).toBe('Mốc')
    expect(NEWS_TAG_LABEL.unverified).toBe('Chưa xác minh')
  })
})
