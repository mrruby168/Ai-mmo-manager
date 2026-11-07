import { createHash, randomUUID } from 'node:crypto'
import {
  countImportantNews,
  deleteNews,
  getLastNewsFetchAt,
  getNewsById,
  insertNews,
  listNews,
  toggleNewsTodo,
  updateNews
} from '../db/newsRepo'
import type { NewsRecord } from '../db/newsRepo'
import { getDatabase } from '../db/connection'
import { listProjects } from '../db/projectsRepo'
import { newsManualInputSchema } from '@shared/schemas'
import type { MilestoneKind, NewsKind, VerificationState } from '@shared/constants'
import type { DeadlineItem, NewsItem, NewsSnapshot } from '@shared/types'
import { getDeadlineInfo, todayDateOnly } from '@shared/date-utils'

export function listImportant(): NewsItem[] {
  return listNews('important')
}

export function listTodos(): NewsItem[] {
  return listNews('todo')
}

export function getNewsSnapshot(): NewsSnapshot {
  return {
    important: listImportant(),
    todos: listTodos(),
    lastCheckedAt: getLastNewsFetchAt()
  }
}

export function getDeadlines(today: string = todayDateOnly()): DeadlineItem[] {
  const { urgent, soon, expired } = computeDeadlines(today)
  return [...urgent, ...soon, ...expired]
}

export interface DeadlineBuckets {
  urgent: DeadlineItem[]
  soon: DeadlineItem[]
  expired: DeadlineItem[]
}

/** Chia hạn theo DEADLINE_WINDOWS; chỉ dùng project.endDate như trước FIX 1. */
export function computeDeadlines(today: string): DeadlineBuckets {
  const items = listProjects()
    .filter((project) => project.status !== 'completed' && project.endDate !== null && project.endDate !== undefined)
    .map((project) => ({
      projectId: project.id,
      projectName: project.name,
      category: project.category,
      date: project.endDate as string,
      kind: 'end' as MilestoneKind,
      verification: project.verification,
      daysRemaining: getDeadlineInfo(project.endDate, today).days ?? 0,
      logoPath: project.logoPath
    }))

  const expired = items
    .filter((item) => item.daysRemaining < 0)
    .sort((left, right) => left.daysRemaining - right.daysRemaining)

  const urgent = items
    .filter((item) => item.daysRemaining >= 0 && item.daysRemaining <= 3)
    .sort((left, right) => left.daysRemaining - right.daysRemaining)

  const soon = items
    .filter((item) => item.daysRemaining >= 4 && item.daysRemaining <= 14)
    .sort((left, right) => left.daysRemaining - right.daysRemaining)

  return { urgent, soon, expired }
}

export function toggleTodo(id: number, isDone: boolean): { id: number; isDone: boolean } {
  const applied = toggleNewsTodo(id, isDone)
  if (!applied) {
    throw new Error('Không tìm thấy việc cần làm')
  }
  const row = getDatabase().prepare('SELECT is_done FROM news_items WHERE id = ?').get(id)
  return { id, isDone: row?.is_done === 1 }
}

function isProjectIdValid(projectId: string): boolean {
  const row = getDatabase().prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  return Boolean(row)
}

export interface NewsBatchInput {
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

export interface NewsBatchResult {
  added: number
  rejected: number
}

/** Stable dedupe key for one project + source URL. */
export function newsDedupeHash(projectId: string, sourceUrl: string): string {
  const canonical = sourceUrl.trim().toLowerCase().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/$/, '')
  return createHash('sha256').update(`${projectId}|${canonical}`).digest('hex')
}

export function saveNewsBatch(
  items: NewsBatchInput[],
  fetchedAt: string,
  isToday: (iso: string) => boolean,
  allowedProjectIds: ReadonlySet<string>
): NewsBatchResult {
  let added = 0
  let rejected = 0

  for (const item of items) {
    // The id must be one of the projects this batch was built from, otherwise a
    // hallucinated id could attach news to an unrelated project.
    if (!allowedProjectIds.has(item.projectId)) {
      rejected += 1
      continue
    }

    if (!isToday(item.publishedAt)) {
      rejected += 1
      continue
    }

    if (!isProjectIdValid(item.projectId)) {
      rejected += 1
      continue
    }

    const dedupeHash = newsDedupeHash(item.projectId, item.sourceUrl)

    const record: NewsRecord = {
      projectId: item.projectId,
      kind: item.kind,
      summary: item.summary,
      verification: item.verification,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      publishedAt: item.publishedAt,
      fetchedAt,
      todoDeadline: item.todoDeadline,
      dedupeHash,
      milestoneKind: item.milestoneKind,
      milestoneDate: item.milestoneDate
    }

    const inserted = insertNews(record)
    if (inserted) {
      added += 1
    }
  }

  return { added, rejected }
}

/* ---------- FIX 1: manual CRUD in No AI Mode ---------- */

function assertProjectExists(projectId: string): void {
  if (!isProjectIdValid(projectId)) {
    throw new Error('Dự án đã chọn không tồn tại. Hãy chọn lại.')
  }
}

function assertSingleImportant(projectId: string, excludeId?: number): void {
  if (countImportantNews(projectId, excludeId) > 0) {
    throw new Error('Dự án này đã có một tin quan trọng. Hãy sửa tin đó thay vì thêm tin mới.')
  }
}

function manualRecord(
  input: ReturnType<typeof newsManualInputSchema.parse>,
  fetchedAt: string,
  dedupeHash: string
): NewsRecord {
  const isTodo = input.kind === 'todo'
  const date = input.date
  const milestoneKind = isTodo ? null : (input.milestoneKind ?? null)
  return {
    projectId: input.projectId,
    kind: input.kind,
    summary: input.summary,
    verification: input.verification,
    sourceUrl: input.sourceUrl?.trim() ?? '',
    sourceName: input.sourceName?.trim() || null,
    publishedAt: `${date}T00:00:00.000Z`,
    fetchedAt,
    todoDeadline: isTodo ? date : null,
    dedupeHash,
    milestoneKind,
    milestoneDate: milestoneKind ? date : null
  }
}

export function createManualNews(rawInput: unknown, now: Date = new Date()): NewsItem {
  const input = newsManualInputSchema.parse(rawInput)
  assertProjectExists(input.projectId)
  if (input.kind === 'important') {
    assertSingleImportant(input.projectId)
  }

  const sourceUrl = input.sourceUrl?.trim() ?? ''
  const dedupeHash = newsDedupeHash(input.projectId, sourceUrl || `manual:${randomUUID()}`)
  const inserted = insertNews(manualRecord(input, now.toISOString(), dedupeHash))
  if (!inserted) {
    throw new Error('Không thêm được tin. Tin có thể đã tồn tại với cùng nguồn.')
  }
  const row = getDatabase().prepare('SELECT id FROM news_items WHERE dedupe_hash = ?').get(dedupeHash)
  const created = row ? getNewsById(Number(row.id)) : null
  if (!created) {
    throw new Error('Đã thêm tin nhưng không đọc lại được dữ liệu')
  }
  return created
}

export function updateManualNews(id: number, rawInput: unknown): NewsItem {
  const existing = getNewsById(id)
  if (!existing) {
    throw new Error('Không tìm thấy tin cần sửa')
  }

  const input = newsManualInputSchema.parse(rawInput)
  assertProjectExists(input.projectId)
  if (input.kind === 'important') {
    assertSingleImportant(input.projectId, id)
  }

  const sourceUrl = input.sourceUrl?.trim() ?? ''
  let dedupeHash = existing.dedupeHash
  if (sourceUrl.length > 0) {
    const nextHash = newsDedupeHash(input.projectId, sourceUrl)
    if (nextHash !== existing.dedupeHash) {
      const clash = getDatabase().prepare('SELECT id FROM news_items WHERE dedupe_hash = ?').get(nextHash)
      if (clash) {
        throw new Error('Đã có tin khác cùng nguồn cho dự án này')
      }
      dedupeHash = nextHash
    }
  } else if (existing.sourceUrl.trim().length > 0) {
    // Removing the source must still keep the unique dedupe key.
    dedupeHash = newsDedupeHash(input.projectId, `manual:${randomUUID()}`)
  }

  const updated = updateNews(id, manualRecord(input, existing.fetchedAt, dedupeHash))
  if (!updated) {
    throw new Error('Không cập nhật được tin')
  }
  const next = getNewsById(id)
  if (!next) {
    throw new Error('Đã cập nhật nhưng không đọc lại được dữ liệu')
  }
  return next
}

export function deleteManualNews(id: number): { id: number } {
  if (!deleteNews(id)) {
    throw new Error('Không tìm thấy tin cần xóa')
  }
  return { id }
}
