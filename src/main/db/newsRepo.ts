import type { NewsKind, VerificationState } from '@shared/constants'
import type { NewsItem } from '@shared/types'
import { getDatabase } from './connection'

const COLUMNS = `id, project_id, kind, summary, verification, source_url, source_name,
  published_at, fetched_at, todo_deadline, is_done, dedupe_hash`

interface NewsRow {
  id: number
  project_id: string
  kind: string
  summary: string
  verification: string
  source_url: string
  source_name: string | null
  published_at: string
  fetched_at: string
  todo_deadline: string | null
  is_done: number
  dedupe_hash: string
}

export interface NewsRecord {
  projectId: string
  kind: NewsKind
  summary: string
  verification: VerificationState
  sourceUrl: string
  sourceName: string | null
  publishedAt: string
  fetchedAt: string
  todoDeadline: string | null
  dedupeHash: string
}

function mapRow(row: NewsRow): NewsItem {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as NewsKind,
    summary: row.summary,
    verification: row.verification as VerificationState,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    todoDeadline: row.todo_deadline,
    isDone: row.is_done === 1,
    dedupeHash: row.dedupe_hash
  }
}

export function insertNews(record: NewsRecord): boolean {
  const result = getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO news_items (
        project_id, kind, summary, verification, source_url, source_name,
        published_at, fetched_at, todo_deadline, is_done, dedupe_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    )
    .run(
      record.projectId,
      record.kind,
      record.summary,
      record.verification,
      record.sourceUrl,
      record.sourceName,
      record.publishedAt,
      record.fetchedAt,
      record.todoDeadline,
      record.dedupeHash
    )
  return Number(result.changes) > 0
}

export function listNews(kind?: NewsKind): NewsItem[] {
  const order = `ORDER BY CASE verification WHEN 'verified' THEN 0 ELSE 1 END, published_at DESC, id DESC`
  const database = getDatabase()
  const rows = kind
    ? database.prepare(`SELECT ${COLUMNS} FROM news_items WHERE kind = ? ${order}`).all(kind)
    : database.prepare(`SELECT ${COLUMNS} FROM news_items ${order}`).all()
  return (rows as unknown as NewsRow[]).map(mapRow)
}

export function toggleNewsTodo(id: number, isDone: boolean): boolean {
  const result = getDatabase().prepare('UPDATE news_items SET is_done = ? WHERE id = ? AND kind = ?').run(isDone ? 1 : 0, id, 'todo')
  return Number(result.changes) > 0
}

export function getLastNewsFetchAt(): string | null {
  const row = getDatabase().prepare('SELECT MAX(fetched_at) AS fetched_at FROM news_items').get()
  const value = row ? row.fetched_at : null
  return typeof value === 'string' ? value : null
}
