import { describe, expect, it } from 'vitest'
import { daysRemaining, getDeadlineInfo, isSameLocalDay, toDateOnly, todayDateOnly } from '@shared/date-utils'

describe('date-utils', () => {
  it('formats a Date as local YYYY-MM-DD', () => {
    expect(toDateOnly(new Date(2026, 10, 5))).toBe('2026-11-05')
    expect(todayDateOnly(new Date(2026, 0, 9))).toBe('2026-01-09')
  })

  it('counts remaining days across month and leap-year boundaries', () => {
    expect(daysRemaining('2026-11-08', '2026-11-05')).toBe(3)
    expect(daysRemaining('2026-12-01', '2026-11-30')).toBe(1)
    expect(daysRemaining('2028-03-01', '2028-02-28')).toBe(2)
    expect(daysRemaining('2026-11-05', '2026-11-05')).toBe(0)
    expect(daysRemaining('2026-11-01', '2026-11-05')).toBe(-4)
  })

  it('returns deadline labels with the expected tone', () => {
    expect(getDeadlineInfo(null, '2026-11-05')).toEqual({ days: null, text: 'Chưa rõ', tone: 'none' })
    expect(getDeadlineInfo('2026-11-09', '2026-11-05')).toEqual({
      days: 4,
      text: 'Còn 4 ngày',
      tone: 'normal'
    })
    expect(getDeadlineInfo('2026-11-08', '2026-11-05')).toEqual({
      days: 3,
      text: 'Còn 3 ngày',
      tone: 'soon_3d'
    })
    expect(getDeadlineInfo('2026-11-05', '2026-11-05')).toEqual({
      days: 0,
      text: 'Hết hạn hôm nay',
      tone: 'today'
    })
    expect(getDeadlineInfo('2026-11-02', '2026-11-05')).toEqual({
      days: -3,
      text: 'Đã quá hạn 3 ngày',
      tone: 'expired'
    })
  })

  it('compares ISO timestamps by local day', () => {
    const now = new Date(2026, 10, 5, 10, 0, 0)
    expect(isSameLocalDay(new Date(2026, 10, 5, 23, 30, 0).toISOString(), now)).toBe(true)
    expect(isSameLocalDay(new Date(2026, 10, 6, 0, 1, 0).toISOString(), now)).toBe(false)
    expect(isSameLocalDay('not-a-date', now)).toBe(false)
  })
})
