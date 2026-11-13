import { describe, expect, it } from 'vitest'
import { deadlineTone, formatDeadlineBadge } from '../src/shared/deadlineView'

describe('formatDeadlineBadge (tiếng Việt, D18)', () => {
  it.each([
    [-30, 'Quá hạn'],
    [-1, 'Quá hạn'],
    [0, 'Hôm nay'],
    [1, 'Ngày mai'],
    [2, 'Còn 2 ngày'],
    [3, 'Còn 3 ngày'],
    [4, 'Còn 4 ngày'],
    [7, 'Còn 7 ngày'],
    [8, 'Còn 8 ngày'],
    [999, 'Còn 999 ngày']
  ])('%i ngày còn lại → %s', (daysLeft, expected) => {
    expect(formatDeadlineBadge(daysLeft)).toBe(expected)
  })
})

describe('deadlineTone', () => {
  it('ranh giới theo mức: quá hạn xám, ≤3 đỏ, 4–7 vàng, >7 trung tính', () => {
    expect(deadlineTone(-1)).toBe('muted')
    expect(deadlineTone(-365)).toBe('muted')
    expect(deadlineTone(0)).toBe('error')
    expect(deadlineTone(3)).toBe('error')
    expect(deadlineTone(4)).toBe('warning')
    expect(deadlineTone(7)).toBe('warning')
    expect(deadlineTone(8)).toBe('neutral')
    expect(deadlineTone(365)).toBe('neutral')
  })
})
