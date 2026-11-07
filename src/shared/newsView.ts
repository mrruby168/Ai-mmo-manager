import { DEADLINE_WINDOWS, MILESTONE_KINDS } from './constants'
import type {
  MilestoneKind,
  ProjectCategory,
  ProjectStatus,
  VerificationState
} from './constants'
import { daysRemaining } from './date-utils'
import type { DeadlineItem } from './types'

export const MILESTONE_LABEL: Record<MilestoneKind, string> = {
  end: 'End',
  snapshot: 'Snapshot',
  claim: 'Claim',
  whitelist: 'Whitelist',
  tge: 'TGE',
  listing: 'Listing',
  other: 'Mốc khác'
}

const MILESTONE_ORDER: Record<MilestoneKind, number> = {
  end: 0,
  snapshot: 1,
  claim: 2,
  whitelist: 3,
  tge: 4,
  listing: 5,
  other: 6
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
}

export interface Milestone {
  kind: MilestoneKind
  /** yyyy-mm-dd, or null when only the milestone name is known. */
  date: string | null
}

export interface HeadlineItem {
  summary: string
  milestoneKind: MilestoneKind | null
  milestoneDate: string | null
}

export interface ImportantNewsItem extends HeadlineItem {
  id: number
  projectId: string
  verification: VerificationState
  publishedAt: string
}

export interface DeadlineProject {
  id: string
  name: string
  category: ProjectCategory
  status: ProjectStatus
  endDate: string | null
  verification: VerificationState
  logoPath: string | null
}

export interface DeadlineNews {
  projectId: string
  verification: VerificationState
  milestoneKind: MilestoneKind | null
  milestoneDate: string | null
}

export function formatDmy(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim())
  if (!match) {
    return date
  }
  return `${match[3]}/${match[2]}/${match[1]}`
}

function toDateOnly(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

interface DateHit {
  index: number
  date: string
}

function findDate(text: string, defaultYear: number): DateHit | null {
  const hits: DateHit[] = []

  const iso = /(\d{4})-(\d{2})-(\d{2})/g
  for (const match of text.matchAll(iso)) {
    const date = toDateOnly(Number(match[1]), Number(match[2]), Number(match[3]))
    if (date) {
      hits.push({ index: match.index ?? 0, date })
    }
  }

  const slash = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g
  for (const match of text.matchAll(slash)) {
    const rawYear = match[3]
    const year = rawYear ? (rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear)) : defaultYear
    const date = toDateOnly(year, Number(match[2]), Number(match[1]))
    if (date) {
      hits.push({ index: match.index ?? 0, date })
    }
  }

  const english = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/g
  for (const match of text.matchAll(english)) {
    const month = MONTHS[match[1].toLowerCase()]
    if (month) {
      const date = toDateOnly(defaultYear, month, Number(match[2]))
      if (date) {
        hits.push({ index: match.index ?? 0, date })
      }
    }
  }

  const vietnamese = /(\d{1,2})\s*(?:tháng|thg\.?)\s*(\d{1,2})/gi
  for (const match of text.matchAll(vietnamese)) {
    const date = toDateOnly(defaultYear, Number(match[2]), Number(match[1]))
    if (date) {
      hits.push({ index: match.index ?? 0, date })
    }
  }

  return hits.sort((left, right) => left.index - right.index)[0] ?? null
}

interface KindHit {
  index: number
  kind: MilestoneKind
}

function findKind(text: string): KindHit | null {
  const patterns: Array<{ kind: MilestoneKind; pattern: RegExp }> = [
    { kind: 'end', pattern: /\bends?\b|\bending\b|kết\s*thúc/giu },
    { kind: 'snapshot', pattern: /\bsnapshot\b/gi },
    { kind: 'claim', pattern: /\bclaims?\b|\bclaiming\b/gi },
    { kind: 'whitelist', pattern: /\bwhitelist\b|\bWL\b/gi },
    { kind: 'tge', pattern: /\bTGE\b/g },
    { kind: 'listing', pattern: /\blisting\b/gi }
  ]

  const hits: KindHit[] = []
  for (const { kind, pattern } of patterns) {
    const match = pattern.exec(text)
    if (match) {
      hits.push({ index: match.index, kind })
    }
  }

  return hits.sort(
    (left, right) => left.index - right.index || MILESTONE_ORDER[left.kind] - MILESTONE_ORDER[right.kind]
  )[0] ?? null
}

/** Bắt mốc + ngày từ summary của tin cũ hoặc tin do No AI Mode nhập. */
export function extractMilestoneFromText(text: string, defaultYear: number = new Date().getFullYear()): Milestone | null {
  const kind = findKind(text)
  if (!kind) {
    return null
  }
  const date = findDate(text, defaultYear)
  return { kind: kind.kind, date: date ? date.date : null }
}

/** Ưu tiên trường đã lưu trong DB, chỉ đoán từ summary khi tin cũ chưa có. */
export function resolveMilestone(item: HeadlineItem): Milestone | null {
  if (item.milestoneKind) {
    return { kind: item.milestoneKind, date: normalizeDate(item.milestoneDate) }
  }
  return extractMilestoneFromText(item.summary, defaultYearOf(item))
}

function defaultYearOf(item: HeadlineItem): number {
  const source = 'publishedAt' in item && typeof item.publishedAt === 'string' ? item.publishedAt : ''
  const match = /^(\d{4})/.exec(source)
  return match ? Number(match[1]) : new Date().getFullYear()
}

function normalizeDate(value: string | null): string | null {
  if (!value) {
    return null
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return match ? match[1] : null
}

/** Gộp khoảng trắng, cắt còn tối đa `max` ký tự và thêm dấu ba chấm. */
export function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (max <= 0) {
    return ''
  }
  if (flat.length <= max) {
    return flat
  }
  return `${flat.slice(0, max - 1).trimEnd()}…`
}

/** Tiêu đề một dòng: ưu tiên mốc đã lưu, rồi đoán từ summary, cuối cùng là summary rút gọn. */
export function buildHeadline(item: HeadlineItem): string {
  const milestone = resolveMilestone(item)
  if (milestone) {
    const label = MILESTONE_LABEL[milestone.kind]
    return milestone.date ? `${label} ${formatDmy(milestone.date)}` : label
  }
  return oneLine(item.summary, 60)
}

function isFuture(milestone: Milestone | null, today: string): boolean {
  return Boolean(milestone?.date && milestone.date >= today)
}

function isPast(milestone: Milestone | null, today: string): boolean {
  return Boolean(milestone?.date && milestone.date < today)
}

function compareImportant(left: ImportantNewsItem, right: ImportantNewsItem, today: string): number {
  if (left.verification !== right.verification) {
    return left.verification === 'verified' ? -1 : 1
  }

  const leftMilestone = resolveMilestone(left)
  const rightMilestone = resolveMilestone(right)
  const leftFuture = isFuture(leftMilestone, today)
  const rightFuture = isFuture(rightMilestone, today)

  if (leftFuture && rightFuture) {
    const byDate = leftMilestone!.date!.localeCompare(rightMilestone!.date!)
    if (byDate !== 0) {
      return byDate
    }
  } else if (leftFuture !== rightFuture) {
    return leftFuture ? -1 : 1
  }

  const leftOrder = leftMilestone ? MILESTONE_ORDER[leftMilestone.kind] : MILESTONE_KINDS.length
  const rightOrder = rightMilestone ? MILESTONE_ORDER[rightMilestone.kind] : MILESTONE_KINDS.length
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }

  const leftPast = isPast(leftMilestone, today)
  const rightPast = isPast(rightMilestone, today)
  if (leftPast && rightPast) {
    const byDate = rightMilestone!.date!.localeCompare(leftMilestone!.date!)
    if (byDate !== 0) {
      return byDate
    }
  } else if (leftPast !== rightPast) {
    return leftPast ? -1 : 1
  }

  const byPublished = right.publishedAt.localeCompare(left.publishedAt)
  if (byPublished !== 0) {
    return byPublished
  }
  return right.id - left.id
}

/**
 * Mỗi dự án chỉ giữ một tin quan trọng nhất. Tin bị ẩn vẫn nằm nguyên trong DB.
 * Thứ hạng: verified -> mốc tương lai gần nhất -> loại mốc -> mốc đã qua -> mới nhất.
 */
export function selectTopImportantPerProject<T extends ImportantNewsItem>(items: readonly T[], today: string): T[] {
  const best = new Map<string, T>()
  for (const item of items) {
    const current = best.get(item.projectId)
    if (!current || compareImportant(item, current, today) < 0) {
      best.set(item.projectId, item)
    }
  }
  return [...best.values()].sort((left, right) => compareImportant(left, right, today))
}

function deadlineTone(days: number): number {
  if (days < 0) {
    return 2
  }
  return days <= DEADLINE_WINDOWS.urgentDays ? 0 : 1
}

/**
 * Gộp project.endDate với các mốc lưu trong tin. Mốc verified thắng endDate khi
 * cùng dự án + cùng loại; mốc unverified hiện thành dòng riêng, không ghi đè.
 */
export function buildDeadlineRows(
  projects: readonly DeadlineProject[],
  news: readonly DeadlineNews[],
  today: string
): DeadlineItem[] {
  const byId = new Map(projects.map((project) => [project.id, project]))
  const rows = new Map<string, DeadlineItem>()
  const projectEndKeys = new Set<string>()

  function toRow(project: DeadlineProject, kind: MilestoneKind, date: string, verification: VerificationState): DeadlineItem {
    return {
      projectId: project.id,
      projectName: project.name,
      category: project.category,
      date,
      kind,
      verification,
      daysRemaining: daysRemaining(date, today),
      logoPath: project.logoPath
    }
  }

  for (const project of projects) {
    if (project.status === 'completed' || !project.endDate) {
      continue
    }
    const rowKey = `${project.id}|end|${project.endDate}`
    rows.set(rowKey, toRow(project, 'end', project.endDate, project.verification))
    projectEndKeys.add(rowKey)
  }

  for (const item of news) {
    const project = byId.get(item.projectId)
    const date = normalizeDate(item.milestoneDate)
    if (!project || !item.milestoneKind || !date) {
      continue
    }

    const key = `${project.id}|${item.milestoneKind}|${date}`
    const existing = rows.get(key)
    if (existing) {
      if (existing.verification !== 'verified' && item.verification === 'verified') {
        rows.set(key, { ...existing, verification: 'verified' })
      }
      continue
    }

    if (item.milestoneKind === 'end' && item.verification === 'verified') {
      const oldKey = `${project.id}|end|${project.endDate ?? ''}`
      if (projectEndKeys.has(oldKey)) {
        rows.delete(oldKey)
        projectEndKeys.delete(oldKey)
      }
    }

    rows.set(key, toRow(project, item.milestoneKind, date, item.verification))
  }

  return [...rows.values()]
    .filter((row) => row.daysRemaining <= DEADLINE_WINDOWS.soonDays)
    .sort(
      (left, right) =>
        deadlineTone(left.daysRemaining) - deadlineTone(right.daysRemaining) ||
        left.daysRemaining - right.daysRemaining ||
        left.projectName.localeCompare(right.projectName) ||
        left.kind.localeCompare(right.kind)
    )
}
