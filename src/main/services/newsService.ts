import { createHash } from 'node:crypto'
import { getLastNewsFetchAt, insertNews, listNews, toggleNewsTodo } from '../db/newsRepo'
import type { NewsRecord } from '../db/newsRepo'
import { getDatabase } from '../db/connection'
import { listProjects } from '../db/projectsRepo'
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
