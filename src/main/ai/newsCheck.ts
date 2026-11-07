import { isSameLocalDay } from '@shared/date-utils'
import { mentionsMilestone } from '@shared/newsView'
import { isHttpUrl, newsItemSchema } from '@shared/schemas'
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
}

/**
 * Validates one model submission against the exact batch that was sent to it.
 * A projectId from another batch (or one that no longer exists) is rejected,
 * not silently stored.
 */
export function parseNewsSubmission(
  items: unknown,
  allowedProjectIds: ReadonlySet<string>,
  isToday: (iso: string) => boolean = isSameLocalDay
): NewsSubmission {
  if (!Array.isArray(items)) {
    return { items: [], rejected: 1 }
  }

  const accepted: VerifiedNewsItem[] = []
  let rejected = 0

  for (const raw of items) {
    const parsed = newsItemSchema.safeParse(raw)
    if (!parsed.success) {
      rejected += 1
      continue
    }
    const value = parsed.data
    if (!allowedProjectIds.has(value.projectId) || !isHttpUrl(value.sourceUrl) || !isToday(value.publishedAt)) {
      rejected += 1
      continue
    }
    accepted.push({
      projectId: value.projectId,
      kind: value.kind,
      summary: value.summary,
      verification: value.verification,
      sourceUrl: value.sourceUrl,
      sourceName: value.sourceName ?? null,
      publishedAt: value.publishedAt,
      todoDeadline: value.todoDeadline ?? null,
      milestoneKind: value.milestoneKind ?? null,
      milestoneDate: value.milestoneDate ?? null
    })
  }

  return { items: accepted, rejected }
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
  const kept: VerifiedNewsItem[] = []
  let rejected = 0
  let unverified = 0

  for (const item of items) {
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
        continue
      }
      unverified += 1
      kept.push({ ...item, verification: 'unverified' })
      continue
    }

    if (fetched.status === 404 || fetched.status === 410) {
      rejected += 1
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

  return { items: kept, rejected, unverified }
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
  return parts.length > 0 ? parts.join(' · ') : 'Không có tin mới trong 7 ngày gần nhất'
}
