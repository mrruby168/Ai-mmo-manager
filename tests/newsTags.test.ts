import { describe, expect, it } from 'vitest'
import { NEWS_TAG_LABEL, deriveNewsTags } from '../src/shared/newsTags'
import type { MilestoneKind } from '../src/shared/constants'

const TODAY = '2026-11-16'

function tags(overrides: Partial<Parameters<typeof deriveNewsTags>[0]> = {}) {
  return deriveNewsTags(
    {
      todoDeadline: null,
      milestoneKind: null,
      milestoneDate: null,
      ...overrides
    },
    TODAY
  )
}

describe('deriveNewsTags', () => {
  it('gắn "Sắp đến hạn" cho mốc trong 0–3 ngày tới', () => {
    expect(tags({ milestoneKind: 'snapshot', milestoneDate: '2026-11-16' })).toContain('deadline_soon')
    expect(tags({ milestoneKind: 'snapshot', milestoneDate: '2026-11-19' })).toContain('deadline_soon')
    // 4 ngày nữa: không gắn
    expect(tags({ milestoneKind: 'snapshot', milestoneDate: '2026-11-20' })).not.toContain('deadline_soon')
    // đã qua hạn: không gắn (đây là ended nếu là milestoneKind = end)
    expect(tags({ milestoneKind: 'snapshot', milestoneDate: '2026-11-10' })).not.toContain('deadline_soon')
  })

  it('gắn "Sắp đến hạn" theo todoDeadline', () => {
    expect(tags({ todoDeadline: '2026-11-17' })).toContain('deadline_soon')
    expect(tags({ todoDeadline: '2026-11-16' })).toContain('deadline_soon')
    expect(tags({ todoDeadline: '2026-11-23' })).not.toContain('deadline_soon')
  })

  it('gắn "Claim mở" khi milestoneKind = claim và còn mở', () => {
    expect(tags({ milestoneKind: 'claim' })).toEqual(['claim_open'])
    expect(tags({ milestoneKind: 'claim', milestoneDate: '2026-11-18' })).toEqual(['deadline_soon', 'claim_open'])
    expect(tags({ milestoneKind: 'claim', milestoneDate: '2026-11-16' })).toEqual(['deadline_soon', 'claim_open'])
    // claim đã đóng (ngày đã qua): không gắn claim_open
    expect(tags({ milestoneKind: 'claim', milestoneDate: '2026-11-10' })).toEqual([])
  })

  it('gắn "Đã kết thúc" khi milestoneKind = end và ngày đã tới/qua', () => {
    expect(tags({ milestoneKind: 'end', milestoneDate: '2026-11-16' })).toEqual(['deadline_soon', 'ended'])
    expect(tags({ milestoneKind: 'end', milestoneDate: '2026-11-10' })).toEqual(['ended'])
    expect(tags({ milestoneKind: 'end', milestoneDate: '2026-11-18' })).toEqual(['deadline_soon'])
    expect(tags({ milestoneKind: 'end' })).toEqual([])
  })

  it('giữ thứ tự Sắp đến hạn → Claim mở → Đã kết thúc', () => {
    const kinds: MilestoneKind = 'claim'
    expect(
      deriveNewsTags(
        { todoDeadline: null, milestoneKind: kinds, milestoneDate: '2026-11-16' },
        TODAY
      )
    ).toEqual(['deadline_soon', 'claim_open'])
  })

  it('bỏ qua ngày không hợp lệ', () => {
    expect(tags({ milestoneKind: 'claim', milestoneDate: 'không rõ' })).toEqual(['claim_open'])
    expect(tags({ todoDeadline: '16/11/2026' })).toEqual([])
    expect(tags({ milestoneKind: 'end', milestoneDate: '2026-13-45' })).toEqual([])
  })

  it('có nhãn tiếng Việt cho mọi tag', () => {
    expect(NEWS_TAG_LABEL.deadline_soon).toBe('Sắp đến hạn')
    expect(NEWS_TAG_LABEL.claim_open).toBe('Claim mở')
    expect(NEWS_TAG_LABEL.ended).toBe('Đã kết thúc')
  })
})
