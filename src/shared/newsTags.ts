/**
 * v0.1.4: nhãn hiển thị nhanh cho một tin trong bảng News.
 * Nhãn được suy ra từ `milestoneKind` / ngày, không lưu thêm cột nào vào DB.
 * Thuần dữ liệu, không phụ thuộc React/Electron nên test được trực tiếp.
 */

import type { MilestoneKind } from './constants'
import { daysRemaining, todayDateOnly } from './date-utils'

export type NewsTag = 'deadline_soon' | 'claim_open' | 'ended'

export const NEWS_TAG_LABEL: Record<NewsTag, string> = {
  deadline_soon: 'Sắp đến hạn',
  claim_open: 'Claim mở',
  ended: 'Đã kết thúc'
}

/** Mốc có hạn trong khoảng này (0–3 ngày tới) được gắn "Sắp đến hạn". */
export const NEWS_DEADLINE_TAG_DAYS = 3

export interface NewsTagInput {
  /** Hạn của việc cần làm (todo); null nếu không phải todo. */
  todoDeadline: string | null
  milestoneKind: MilestoneKind | null
  milestoneDate: string | null
}

function isoDay(value: string | null | undefined): string | null {
  const day = value?.slice(0, 10)
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/**
 * Trả các nhãn theo thứ tự ưu tiên: sắp đến hạn → claim mở → đã kết thúc.
 * Ngày không hợp lệ thì bỏ qua nhãn tương ứng, không ném lỗi.
 */
export function deriveNewsTags(input: NewsTagInput, today: string = todayDateOnly()): NewsTag[] {
  const tags: NewsTag[] = []
  const todayDay = isoDay(today) ?? today.slice(0, 10)

  const milestoneDate = isoDay(input.milestoneDate)
  const todoDeadline = isoDay(input.todoDeadline)

  // deadline_soon: milestoneDate hoặc todoDeadline trong 0–3 ngày tới.
  for (const day of [milestoneDate, todoDeadline]) {
    if (day) {
      const left = daysRemaining(day, todayDay)
      if (Number.isFinite(left) && left >= 0 && left <= NEWS_DEADLINE_TAG_DAYS) {
        tags.push('deadline_soon')
        break
      }
    }
  }

  // claim_open: mốc claim còn mở (không có ngày, hoặc ngày từ hôm nay trở đi).
  if (input.milestoneKind === 'claim' && (!milestoneDate || milestoneDate >= todayDay)) {
    tags.push('claim_open')
  }

  // ended: mốc end đã tới hoặc đã qua.
  if (input.milestoneKind === 'end' && milestoneDate && milestoneDate <= todayDay) {
    tags.push('ended')
  }

  return tags
}
