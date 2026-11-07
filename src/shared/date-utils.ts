const MS_PER_DAY = 86_400_000

export type DeadlineTone = 'none' | 'normal' | 'soon_3d' | 'today' | 'expired'

export interface DeadlineInfo {
  days: number | null
  text: string
  tone: DeadlineTone
}

export function toDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayDateOnly(now: Date = new Date()): string {
  return toDateOnly(now)
}

function toUtcDay(dateOnly: string): number {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function daysRemaining(endDate: string, today: string = todayDateOnly()): number {
  return Math.round((toUtcDay(endDate) - toUtcDay(today)) / MS_PER_DAY)
}

export function getDeadlineInfo(endDate: string | null, today: string = todayDateOnly()): DeadlineInfo {
  if (!endDate) {
    return { days: null, text: 'Chưa rõ', tone: 'none' }
  }

  const days = daysRemaining(endDate, today)
  if (days < 0) {
    return { days, text: `Đã quá hạn ${Math.abs(days)} ngày`, tone: 'expired' }
  }
  if (days === 0) {
    return { days, text: 'Hết hạn hôm nay', tone: 'today' }
  }
  if (days <= 3) {
    return { days, text: `Còn ${days} ngày`, tone: 'soon_3d' }
  }
  return { days, text: `Còn ${days} ngày`, tone: 'normal' }
}

export function isSameLocalDay(isoTimestamp: string, now: Date = new Date()): boolean {
  const parsed = new Date(isoTimestamp)
  if (Number.isNaN(parsed.getTime())) {
    return false
  }
  return toDateOnly(parsed) === toDateOnly(now)
}
