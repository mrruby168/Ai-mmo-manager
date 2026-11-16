import { parseXStatusUrl, xDateFromStatusId } from './xLinks'

/** Kết quả tìm kiếm tối thiểu mà module này cần (khớp SearchResultItem). */
export interface XPostSearchItem {
  title: string
  url: string
  snippet: string
  publishedAt: string | null
}

export interface XPost {
  url: string
  statusId: string
  /** ISO; lấy từ status ID, nếu không được thì từ publishedAt của kết quả tìm kiếm. */
  postedAt: string
  snippet: string
}

const MS_PER_DAY = 86_400_000
const UTC7_OFFSET_MS = 7 * 3_600_000

/** 00:00 (UTC+7) của ngày cách hôm nay `daysBack` ngày, tính bằng mili giây UTC. */
export function startOfDayUtc7Ms(nowMs: number, daysBack: number): number {
  const local = nowMs + UTC7_OFFSET_MS
  const dayStart = Math.floor(local / MS_PER_DAY) * MS_PER_DAY
  return dayStart - UTC7_OFFSET_MS - daysBack * MS_PER_DAY
}

/** URL là bài đăng của đúng handle này (không phân biệt hoa thường)? */
export function isOwnStatusUrl(url: string, handle: string): boolean {
  const parsed = parseXStatusUrl(url)
  return parsed !== null && parsed.handle.toLowerCase() === handle.toLowerCase()
}

/** So sánh status ID dạng chuỗi số, mới nhất trước. Không dùng Number (ID vượt 2^53). */
export function compareStatusIdDesc(a: string, b: string): number {
  if (a.length !== b.length) {
    return b.length - a.length
  }
  if (a === b) {
    return 0
  }
  return a < b ? 1 : -1
}

/**
 * Chọn tối đa `limit` bài MỚI NHẤT do chính `handle` đăng từ `windowStartMs`.
 * Bài không xác định được ngày thì bỏ (không đoán).
 */
export function pickLatestPosts(
  results: readonly XPostSearchItem[],
  handle: string,
  windowStartMs: number,
  limit = 3
): XPost[] {
  const seen = new Set<string>()
  const posts: XPost[] = []
  for (const item of results) {
    const parsed = parseXStatusUrl(item.url)
    if (!parsed || parsed.handle.toLowerCase() !== handle.toLowerCase() || seen.has(parsed.statusId)) {
      continue
    }
    seen.add(parsed.statusId)
    const postedAt = xDateFromStatusId(parsed.statusId) ?? item.publishedAt
    if (!postedAt) {
      continue
    }
    const time = Date.parse(postedAt)
    if (Number.isNaN(time) || time < windowStartMs) {
      continue
    }
    posts.push({ url: item.url, statusId: parsed.statusId, postedAt, snippet: item.snippet })
  }
  posts.sort((a, b) => compareStatusIdDesc(a.statusId, b.statusId))
  return posts.slice(0, Math.max(0, limit))
}
