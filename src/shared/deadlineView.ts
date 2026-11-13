/**
 * Deadline badge tiếng Việt (D18) cho dòng "Deadline sắp hết".
 * Chỉ đổi cách hiển thị; không thay đổi cách tính số ngày.
 */

export type DeadlineBadgeTone = 'muted' | 'error' | 'warning' | 'neutral'

/** `daysLeft < 0` = đã quá hạn; 0 = hôm nay; 1 = ngày mai; còn lại "Còn N ngày". */
export function formatDeadlineBadge(daysLeft: number): string {
  const days = Math.trunc(daysLeft)
  if (days < 0) {
    return 'Quá hạn'
  }
  if (days === 0) {
    return 'Hôm nay'
  }
  if (days === 1) {
    return 'Ngày mai'
  }
  return `Còn ${days} ngày`
}

/** Màu huy hiệu theo mức khẩn: quá hạn xám, ≤3 ngày đỏ, 4–7 ngày vàng, >7 ngày trung tính. */
export function deadlineTone(daysLeft: number): DeadlineBadgeTone {
  const days = Math.trunc(daysLeft)
  if (days < 0) {
    return 'muted'
  }
  if (days <= 3) {
    return 'error'
  }
  if (days <= 7) {
    return 'warning'
  }
  return 'neutral'
}
