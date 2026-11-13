import { isSameLocalDay } from '@shared/date-utils'
import { mentionsMilestone } from '@shared/newsView'
import { isHttpUrl, newsItemSchema, newsSubmissionItemSchema } from '@shared/schemas'
import { parseXStatusUrl, xDateFromStatusId } from '@shared/xLinks'
import type { MilestoneKind, NewsKind, VerificationState } from '@shared/constants'
import { SafeFetchError, safeFetch } from '../services/safeFetch'

export interface VerifiedNewsItem {
  projectId: string
  kind: NewsKind
  summary: string
  verification: VerificationState
  sourceUrl: string
  sourceName: string | null
  publishedAt: string
  todoDeadline: string | null
  milestoneKind: MilestoneKind | null
  milestoneDate: string | null
}

export interface NewsSubmission {
  items: VerifiedNewsItem[]
  rejected: number
  reasons: NewsRejectReasons
}

/** 9d: đếm lý do loại để báo cáo thay vì chỉ một con số `rejected`. */
export interface NewsRejectReasons {
  schema: number
  outsideWindow: number
  wrongProject: number
  urlNotSeen: number
  source404: number
  xHandleMismatch: number
  noDate: number
  duplicate: number
  noEvidence: number
}

export function createNewsRejectReasons(): NewsRejectReasons {
  return {
    schema: 0,
    outsideWindow: 0,
    wrongProject: 0,
    urlNotSeen: 0,
    source404: 0,
    xHandleMismatch: 0,
    noDate: 0,
    duplicate: 0,
    noEvidence: 0
  }
}

export function addRejectReasons(target: NewsRejectReasons, source: NewsRejectReasons): void {
  target.schema += source.schema
  target.outsideWindow += source.outsideWindow
  target.wrongProject += source.wrongProject
  target.urlNotSeen += source.urlNotSeen
  target.source404 += source.source404
  target.xHandleMismatch += source.xHandleMismatch
  target.noDate += source.noDate
  target.duplicate += source.duplicate
  target.noEvidence += source.noEvidence
}

const REASON_LABELS: ReadonlyArray<[keyof NewsRejectReasons, string]> = [
  ['schema', 'sai cấu trúc'],
  ['outsideWindow', 'ngoài 7 ngày'],
  ['wrongProject', 'sai dự án'],
  ['urlNotSeen', 'URL chưa thấy'],
  ['source404', 'nguồn 404'],
  ['xHandleMismatch', 'sai handle X'],
  ['noDate', 'thiếu ngày'],
  ['duplicate', 'trùng'],
  ['noEvidence', 'không bằng chứng']
]

/** Chỉ các lý do có số > 0, dạng "sai cấu trúc 2". */
export function formatNewsRejectReasons(reasons: NewsRejectReasons): string[] {
  const parts: string[] = []
  for (const [key, label] of REASON_LABELS) {
    if (reasons[key] > 0) {
      parts.push(`${label} ${reasons[key]}`)
    }
  }
  return parts
}

/** Bỏ ký tự điều khiển, gộp khoảng trắng và cắt còn tối đa `maxChars`. */
export function sanitizeLogLine(text: string, maxChars = 200): string {
  const clean = text
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= maxChars) {
    return clean
  }
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

/** Dòng Activity Log ngắn gọn cho các tin bị loại; null khi không có gì để báo. */
export function buildNewsRejectLogLine(reasons: NewsRejectReasons, maxChars = 200): string | null {
  const parts = formatNewsRejectReasons(reasons)
  if (parts.length === 0) {
    return null
  }
  const total = Object.values(reasons).reduce((sum, count) => sum + count, 0)
  return sanitizeLogLine(`Đã bỏ ${total} tin: ${parts.join(', ')}`, maxChars)
}

/**
 * Validates one model submission against the exact batch that was sent to it.
 * A projectId from another batch (or one that no longer exists) is rejected,
 * not silently stored.
 */
export function parseNewsSubmission(
  items: unknown,
  allowedProjectIds: ReadonlySet<string>,
  isToday: (iso: string) => boolean = isSameLocalDay,
  /** Handle X của từng dự án (không kèm `@`), dùng để loại bài của tài khoản lạ. */
  projectXHandles?: ReadonlyMap<string, string | null>
): NewsSubmission {
  const reasons = createNewsRejectReasons()
  if (!Array.isArray(items)) {
    reasons.schema += 1
    return { items: [], rejected: 1, reasons }
  }

  const accepted: VerifiedNewsItem[] = []
  let rejected = 0

  for (const raw of items) {
    const parsed = newsSubmissionItemSchema.safeParse(raw)
    if (!parsed.success) {
      rejected += 1
      reasons.schema += 1
      continue
    }
    const value = parsed.data
    if (!allowedProjectIds.has(value.projectId) || !isHttpUrl(value.sourceUrl)) {
      rejected += 1
      reasons.wrongProject += 1
      continue
    }

    const xStatus = parseXStatusUrl(value.sourceUrl)
    if (xStatus) {
      const projectHandle = projectXHandles?.get(value.projectId) ?? null
      if (projectHandle && projectHandle.toLowerCase() !== xStatus.handle.toLowerCase()) {
        rejected += 1
        reasons.xHandleMismatch += 1
        continue
      }
    }

    // 9c: bài X thường không đọc được ngày qua web_fetch; suy từ status ID.
    const derived = xStatus ? xDateFromStatusId(xStatus.statusId) : null
    let publishedAt = (value.publishedAt ?? '').trim()
    if (derived) {
      const shownAt = Date.parse(publishedAt)
      const actualAt = Date.parse(derived)
      // Model lệch hơn 1 ngày thì tin ngày suy từ ID.
      if (Number.isNaN(shownAt) || Math.abs(shownAt - actualAt) > 86_400_000) {
        publishedAt = derived
      }
    }
    if (publishedAt.length === 0) {
      rejected += 1
      reasons.noDate += 1
      continue
    }

    // Ngày đã điền/suy xong mới kiểm tra bằng schema nghiêm ngặt.
    const strict = newsItemSchema.safeParse({ ...value, publishedAt })
    if (!strict.success) {
      rejected += 1
      reasons.schema += 1
      continue
    }
    if (!isToday(strict.data.publishedAt)) {
      rejected += 1
      reasons.outsideWindow += 1
      continue
    }
    const item = strict.data
    accepted.push({
      projectId: item.projectId,
      kind: item.kind,
      summary: item.summary,
      // Bài X luôn unverified: web_fetch không đọc được nội dung để xác minh.
      verification: xStatus ? 'unverified' : item.verification,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName ?? null,
      publishedAt: item.publishedAt,
      todoDeadline: item.todoDeadline ?? null,
      milestoneKind: item.milestoneKind ?? null,
      milestoneDate: item.milestoneDate ?? null
    })
  }

  return { items: accepted, rejected, reasons }
}

export interface SourceFetchResult {
  status: number
  text: string
}

export type SourceFetcher = (url: string) => Promise<SourceFetchResult>

export interface SourceVerification {
  items: VerifiedNewsItem[]
  rejected: number
  unverified: number
  reasons: NewsRejectReasons
}

function mentionsProject(text: string, projectName: string): boolean {
  const haystack = text.toLowerCase()
  const name = projectName.toLowerCase().replace(/\s+/g, ' ').trim()
  if (name.length === 0) {
    return false
  }
  if (haystack.includes(name)) {
    return true
  }
  const tokens = name.split(' ').filter((token) => token.length > 2)
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token))
}

/**
 * A source URL is proof only when it can be fetched, the page actually
 * mentions the project, and — for a dated milestone — the page also shows the
 * milestone keyword plus that date. 404/410 means the source is gone, so the
 * news item is dropped. Any other failure (bot wall, X/Twitter, timeout) keeps
 * the item but downgrades it to "unverified" instead of pretending it was
 * checked.
 */
export async function verifyNewsSources(
  items: VerifiedNewsItem[],
  projectNames: ReadonlyMap<string, string>,
  fetcher: SourceFetcher = safeFetch
): Promise<SourceVerification> {
  const reasons = createNewsRejectReasons()
  const kept: VerifiedNewsItem[] = []
  let rejected = 0
  let unverified = 0

  for (const item of items) {
    // 9c: bài X luôn unverified và không tốn một lượt fetch (X chặn bot).
    if (parseXStatusUrl(item.sourceUrl)) {
      unverified += 1
      kept.push({ ...item, verification: 'unverified' })
      continue
    }

    let fetched: SourceFetchResult
    try {
      fetched = await fetcher(item.sourceUrl)
    } catch (error) {
      const gone =
        error instanceof SafeFetchError &&
        error.code === 'HTTP_ERROR' &&
        /HTTP\s+(404|410)\b/i.test(error.message)
      if (gone) {
        rejected += 1
        reasons.source404 += 1
        continue
      }
      unverified += 1
      kept.push({ ...item, verification: 'unverified' })
      continue
    }

    if (fetched.status === 404 || fetched.status === 410) {
      rejected += 1
      reasons.source404 += 1
      continue
    }

    const name = projectNames.get(item.projectId) ?? ''
    const text = fetched.text ?? ''
    const nameOk = mentionsProject(text, name)
    const milestoneOk = mentionsMilestone(text, item.milestoneKind, item.milestoneDate)
    if (nameOk && milestoneOk) {
      kept.push(item)
    } else {
      unverified += 1
      kept.push({ ...item, verification: 'unverified' })
    }
  }

  return { items: kept, rejected, unverified, reasons }
}

export interface NewsCheckSummary {
  added: number
  rejected: number
  failedBatches: number
  totalBatches: number
  searchUnverifiedBatches: number
  /** FIX 3: số lô bị bỏ vì không có bất kỳ bằng chứng tìm kiếm nào. */
  noEvidenceBatches?: number
  /** FIX 3: lý do lỗi đầu tiên để không còn `continue` im lặng. */
  firstFailure?: string | null
  /** 9d: lý do loại từng tin để người dùng biết vì sao bị bỏ. */
  reasons?: NewsRejectReasons
}

export function buildNewsCheckMessage(summary: NewsCheckSummary): string {
  const parts: string[] = []
  if (summary.added + summary.rejected > 0) {
    parts.push(`Đã thêm ${summary.added} tin, bỏ ${summary.rejected} tin không hợp lệ/trùng`)
  }
  if (summary.failedBatches > 0) {
    parts.push(`${summary.failedBatches}/${summary.totalBatches} lô AI không trả kết quả hợp lệ, hãy thử lại`)
  }
  if ((summary.noEvidenceBatches ?? 0) > 0) {
    parts.push(
      `${summary.noEvidenceBatches}/${summary.totalBatches} lô không có bằng chứng web search nên đã bỏ toàn bộ tin của lô đó`
    )
  }
  if (summary.searchUnverifiedBatches > 0) {
    parts.push(
      `${summary.searchUnverifiedBatches}/${summary.totalBatches} lô không có dấu vết tìm kiếm web, kết quả không đáng tin`
    )
  }
  if (summary.firstFailure) {
    parts.push(`Lỗi đầu tiên: ${summary.firstFailure}`)
  }
  if (summary.reasons) {
    const reasonParts = formatNewsRejectReasons(summary.reasons)
    if (reasonParts.length > 0) {
      parts.push(`Lý do bỏ: ${reasonParts.join(', ')}`)
    }
  }
  return parts.length > 0 ? parts.join(' · ') : 'Không có tin mới trong 7 ngày gần nhất'
}
