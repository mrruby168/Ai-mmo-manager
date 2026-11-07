import { z } from 'zod'
import { newsResultSchema } from '@shared/schemas'
import type { NewsImportRejectReason, NewsImportRejectionSummary } from '@shared/types'
import { isWithinNewsWindow } from '@shared/newsPrompt'
import { getDatabase } from '../db/connection'
import { listProjects } from '../db/projectsRepo'
import { newsDedupeHash, saveNewsBatch } from './newsService'
import type { NewsBatchInput, NewsBatchResult } from './newsService'

/** Validates the outer file shape only; each item is checked against newsResultSchema. */
const newsFileShape = z.object({ items: z.array(z.unknown()).max(500) })

export interface NewsImportRejection {
  reason: NewsImportRejectReason
  message: string
  /** Index of the offending item in the source file, absent for file-level errors. */
  index?: number
}

export interface NewsImportParseResult {
  total: number
  items: NewsBatchInput[]
  rejections: NewsImportRejection[]
}

export interface NewsImportPreviewInternal {
  total: number
  items: NewsBatchInput[]
  rejections: NewsImportRejection[]
}

const IMPORT_WINDOW_DAYS = 7

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Pure parser: BOM, JSON, schema, project existence, 7-day window and
 * within-file dedupe. It never touches the database.
 */
export function parseNewsImportText(
  rawText: string,
  allowedProjectIds: ReadonlySet<string>,
  now: Date
): NewsImportParseResult {
  const text = stripBom(rawText).trim()
  if (text.length === 0) {
    return {
      total: 0,
      items: [],
      rejections: [{ reason: 'invalid_json', message: 'File rỗng hoặc không phải JSON hợp lệ' }]
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      total: 0,
      items: [],
      rejections: [{ reason: 'invalid_json', message: 'File rỗng hoặc không phải JSON hợp lệ' }]
    }
  }

  const fileShape = newsFileShape.safeParse(parsed)
  if (!fileShape.success) {
    return {
      total: 0,
      items: [],
      rejections: [{ reason: 'invalid_schema', message: 'File không đúng cấu trúc { "items": [...] }' }]
    }
  }

  const items: NewsBatchInput[] = []
  const rejections: NewsImportRejection[] = []
  const seen = new Set<string>()

  fileShape.data.items.forEach((raw, index) => {
    // Validate one item at a time so one bad row (e.g. a wrong URL) does not
    // discard the whole file. The wrapper keeps using the real newsResultSchema.
    const parsedItem = newsResultSchema.safeParse({ items: [raw] })
    if (!parsedItem.success) {
      rejections.push({
        reason: 'invalid_schema',
        message: 'Tin không đúng schema hoặc URL không hợp lệ',
        index
      })
      return
    }
    const item = parsedItem.data.items[0]

    if (!allowedProjectIds.has(item.projectId)) {
      rejections.push({
        reason: 'unknown_project',
        message: `projectId "${item.projectId}" không tồn tại`,
        index
      })
      return
    }

    if (!isWithinNewsWindow(item.publishedAt, now, IMPORT_WINDOW_DAYS)) {
      rejections.push({
        reason: 'out_of_window',
        message: 'Ngày xuất bản nằm ngoài cửa sổ 7 ngày gần nhất (UTC+7)',
        index
      })
      return
    }

    const hash = newsDedupeHash(item.projectId, item.sourceUrl)
    if (seen.has(hash)) {
      rejections.push({
        reason: 'duplicate',
        message: 'Tin trùng trong cùng file',
        index
      })
      return
    }
    seen.add(hash)

    items.push({
      projectId: item.projectId,
      kind: item.kind,
      summary: item.summary,
      verification: item.verification,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName ?? null,
      publishedAt: item.publishedAt,
      todoDeadline: item.todoDeadline ?? null
    })
  })

  return { total: fileShape.data.items.length, items, rejections }
}

function findExistingHashes(items: NewsBatchInput[]): Set<string> {
  if (items.length === 0) {
    return new Set()
  }
  const hashes = items.map((item) => newsDedupeHash(item.projectId, item.sourceUrl))
  const placeholders = hashes.map(() => '?').join(',')
  const rows = getDatabase()
    .prepare(`SELECT dedupe_hash FROM news_items WHERE dedupe_hash IN (${placeholders})`)
    .all(...hashes) as unknown as Array<{ dedupe_hash: string }>
  return new Set(rows.map((row) => row.dedupe_hash))
}

/**
 * Read-only preview used before the user confirms. Existing rows are counted
 * as duplicates so the UI can explain why they will not be written.
 */
export function previewNewsImport(rawText: string, now: Date = new Date()): NewsImportPreviewInternal {
  const projects = listProjects()
  const allowed = new Set(projects.map((project) => project.id))
  const parsed = parseNewsImportText(rawText, allowed, now)
  const existing = findExistingHashes(parsed.items)

  const items: NewsBatchInput[] = []
  const rejections = [...parsed.rejections]
  for (const item of parsed.items) {
    if (existing.has(newsDedupeHash(item.projectId, item.sourceUrl))) {
      rejections.push({ reason: 'duplicate', message: 'Tin đã có trong ứng dụng' })
      continue
    }
    items.push(item)
  }

  return { total: parsed.total, items, rejections }
}

/** Writes the previewed items with the same batch guard used by AI Check News. */
export function importNewsBatch(items: NewsBatchInput[], now: Date = new Date()): NewsBatchResult {
  const allowed = new Set(listProjects().map((project) => project.id))
  return saveNewsBatch(
    items,
    now.toISOString(),
    (iso) => isWithinNewsWindow(iso, now, IMPORT_WINDOW_DAYS),
    allowed
  )
}

export function summarizeImportRejections(rejections: NewsImportRejection[]): NewsImportRejectionSummary[] {
  const counts = new Map<NewsImportRejectReason, number>()
  for (const rejection of rejections) {
    counts.set(rejection.reason, (counts.get(rejection.reason) ?? 0) + 1)
  }
  return Array.from(counts, ([reason, count]) => ({ reason, count }))
}
