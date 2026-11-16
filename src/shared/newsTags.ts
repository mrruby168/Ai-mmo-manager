/**
 * v0.1.4: nhãn hiển thị nhanh cho một tin trong bảng News.
 * Thuần dữ liệu, không phụ thuộc React/Electron nên test được trực tiếp.
 */

import type { MilestoneKind, VerificationState } from './constants'
import { daysRemaining, todayDateOnly } from './date-utils'

export type NewsTag = 'new' | 'deadline' | 'milestone' | 'unverified'

export const NEWS_TAG_LABEL: Record<NewsTag, string> = {
  new: 'Mới',
  deadline: 'Cần làm',
  milestone: 'Mốc',
  unverified: 'Chưa xác minh'
}

/** Tin được coi là "mới" trong khoảng này (hôm nay và hôm qua). */
export const NEWS_NEW_TAG_DAYS = 1

/** Todo có hạn trong khoảng này (hoặc đã quá hạn) được gắn "Cần làm". */
export const NEWS_DEADLINE_TAG_DAYS = 7

export interface NewsTagInput {
  publishedAt: string
  todoDeadline: string | null
  milestoneKind: MilestoneKind | null
  verification: VerificationState
}

/**
 * Trả các nhãn theo thứ tự ưu tiên: mới → cần làm → mốc → chưa xác minh.
 * Ngày không hợp lệ thì bỏ qua nhãn tương ứng, không ném lỗi.
 */
export function deriveNewsTags(input: NewsTagInput, today: string = todayDateOnly()): NewsTag[] {
  const tags: NewsTag[] = []

  const publishedDay = typeof input.publishedAt === 'string' ? input.publishedAt.slice(0, 10) : ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(publishedDay)) {
    const age = daysRemaining(today, publishedDay)
    if (age >= 0 && age <= NEWS_NEW_TAG_DAYS) {
      tags.push('new')
    }
  }

  if (input.todoDeadline && /^\d{4}-\d{2}-\d{2}$/.test(input.todoDeadline)) {
    const left = daysRemaining(input.todoDeadline, today)
    if (left <= NEWS_DEADLINE_TAG_DAYS) {
      tags.push('deadline')
    }
  }

  if (input.milestoneKind !== null) {
    tags.push('milestone')
  }

  if (input.verification !== 'verified') {
    tags.push('unverified')
  }

  return tags
}
