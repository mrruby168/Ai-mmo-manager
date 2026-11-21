import type { CostType, ProjectCategory, ProjectOrigin, ProjectStatus, VerificationState } from '@shared/constants'
import type { Project, SocialLinks } from '@shared/types'
import type { SQLOutputValue } from 'node:sqlite'
import { normalizeNameKey } from '@shared/normalize'
import type { ProjectListQuery, ProjectListResult, ProjectListItem } from '@shared/projectList'
import { getDatabase } from './connection'

const COLUMNS = `id, category, name, name_key, domain_key, website, socials_json, task_summary, how_to_join,
  start_date, end_date, cost_type, cost_amount_usd, status, verification, sources_json, logo_path, notes,
  origin, row_version, created_at, updated_at`

interface ProjectRow {
  id: string
  category: string
  name: string
  name_key: string
  domain_key: string | null
  website: string | null
  socials_json: string
  task_summary: string
  how_to_join: string
  start_date: string | null
  end_date: string | null
  cost_type: string
  cost_amount_usd: number | null
  status: string
  verification: string
  sources_json: string
  logo_path: string | null
  notes: string
  origin: string
  row_version: number
  created_at: string
  updated_at: string
}

export interface ProjectRecord {
  id: string
  category: ProjectCategory
  name: string
  nameKey: string
  domainKey: string | null
  website: string | null
  socials: SocialLinks
  taskSummary: string
  howToJoin: string
  startDate: string | null
  endDate: string | null
  costType: CostType
  costAmountUsd: number | null
  status: ProjectStatus
  verification: VerificationState
  sources: string[]
  logoPath: string | null
  notes: string
  origin: ProjectOrigin
  createdAt: string
  updatedAt: string
}

export interface ProjectMutableFields {
  category: ProjectCategory
  name: string
  nameKey: string
  domainKey: string | null
  website: string | null
  socials: SocialLinks
  taskSummary: string
  howToJoin: string
  startDate: string | null
  endDate: string | null
  costType: CostType
  costAmountUsd: number | null
  status: ProjectStatus
  verification: VerificationState
  sources: string[]
  notes: string
  updatedAt: string
}

export interface ProjectIndexEntry {
  id: string
  name: string
  category: ProjectCategory
  domainKey: string | null
  website: string | null
}

function mapRow(row: ProjectRow): Project {
  return {
    id: row.id,
    category: row.category as ProjectCategory,
    name: row.name,
    nameKey: row.name_key,
    domainKey: row.domain_key,
    website: row.website,
    socials: JSON.parse(row.socials_json) as SocialLinks,
    taskSummary: row.task_summary,
    howToJoin: row.how_to_join,
    startDate: row.start_date,
    endDate: row.end_date,
    costType: row.cost_type as CostType,
    costAmountUsd: row.cost_amount_usd,
    status: row.status as ProjectStatus,
    verification: row.verification as VerificationState,
    sources: JSON.parse(row.sources_json) as string[],
    logoPath: row.logo_path,
    notes: row.notes,
    origin: row.origin as ProjectOrigin,
    rowVersion: row.row_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listProjects(category?: ProjectCategory): Project[] {
  const database = getDatabase()
  if (category) {
    const rows = database
      .prepare(`SELECT ${COLUMNS} FROM projects WHERE category = ? ORDER BY end_date IS NULL, end_date, name COLLATE NOCASE`)
      .all(category)
    return (rows as unknown as ProjectRow[]).map(mapRow)
  }

  const rows = database.prepare(`SELECT ${COLUMNS} FROM projects ORDER BY category, name COLLATE NOCASE`).all()
  return (rows as unknown as ProjectRow[]).map(mapRow)
}

export function getProject(id: string): Project | null {
  const row = getDatabase().prepare(`SELECT ${COLUMNS} FROM projects WHERE id = ?`).get(id)
  return row ? mapRow(row as unknown as ProjectRow) : null
}

export function getProjectLogoPath(id: string): string | null {
  const row = getDatabase().prepare('SELECT logo_path FROM projects WHERE id = ?').get(id)
  return row && typeof row.logo_path === 'string' && row.logo_path.length > 0 ? row.logo_path : null
}

export function findProjectByNameKey(category: ProjectCategory, nameKey: string): Project | null {
  const row = getDatabase().prepare(`SELECT ${COLUMNS} FROM projects WHERE category = ? AND name_key = ?`).get(category, nameKey)
  return row ? mapRow(row as unknown as ProjectRow) : null
}

export function findProjectByDomainKey(domainKey: string): Project | null {
  const row = getDatabase().prepare(`SELECT ${COLUMNS} FROM projects WHERE domain_key = ? LIMIT 1`).get(domainKey)
  return row ? mapRow(row as unknown as ProjectRow) : null
}

export function listProjectIndex(): ProjectIndexEntry[] {
  const rows = getDatabase().prepare('SELECT id, name, category, domain_key, website FROM projects ORDER BY name COLLATE NOCASE').all()
  return (rows as unknown as Array<Record<string, string | null>>).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    category: row.category as ProjectCategory,
    domainKey: row.domain_key,
    website: row.website as string | null
  }))
}

export function allocateProjectId(): string {
  const database = getDatabase()
  const row = database.prepare("SELECT value FROM meta WHERE key = 'next_project_seq'").get()
  const current = row ? Number(row.value) : 0
  const next = current + 1
  database
    .prepare("INSERT INTO meta (key, value) VALUES ('next_project_seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(String(next))
  return `PRJ-${String(next).padStart(3, '0')}`
}

export function insertProject(record: ProjectRecord): void {
  getDatabase()
    .prepare(
      `INSERT INTO projects (
        id, category, name, name_key, domain_key, website, socials_json, task_summary, how_to_join,
        start_date, end_date, cost_type, cost_amount_usd, status, verification, sources_json, logo_path,
        notes, origin, row_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      record.id,
      record.category,
      record.name,
      record.nameKey,
      record.domainKey,
      record.website,
      JSON.stringify(record.socials),
      record.taskSummary,
      record.howToJoin,
      record.startDate,
      record.endDate,
      record.costType,
      record.costAmountUsd,
      record.status,
      record.verification,
      JSON.stringify(record.sources),
      record.logoPath,
      record.notes,
      record.origin,
      record.createdAt,
      record.updatedAt
    )
}

export function updateProject(id: string, fields: ProjectMutableFields, expectedRowVersion: number): boolean {
  const result = getDatabase()
    .prepare(
      `UPDATE projects SET
        category = ?, name = ?, name_key = ?, domain_key = ?, website = ?, socials_json = ?,
        task_summary = ?, how_to_join = ?, start_date = ?, end_date = ?, cost_type = ?,
        cost_amount_usd = ?, status = ?, verification = ?, sources_json = ?, notes = ?,
        updated_at = ?, row_version = row_version + 1
      WHERE id = ? AND row_version = ?`
    )
    .run(
      fields.category,
      fields.name,
      fields.nameKey,
      fields.domainKey,
      fields.website,
      JSON.stringify(fields.socials),
      fields.taskSummary,
      fields.howToJoin,
      fields.startDate,
      fields.endDate,
      fields.costType,
      fields.costAmountUsd,
      fields.status,
      fields.verification,
      JSON.stringify(fields.sources),
      fields.notes,
      fields.updatedAt,
      id,
      expectedRowVersion
    )
  return Number(result.changes) > 0
}

export function setProjectLogo(id: string, logoPath: string | null, updatedAt: string): boolean {
  const result = getDatabase()
    .prepare('UPDATE projects SET logo_path = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?')
    .run(logoPath, updatedAt, id)
  return Number(result.changes) > 0
}

export function deleteProject(id: string): boolean {
  const result = getDatabase().prepare('DELETE FROM projects WHERE id = ?').run(id)
  return Number(result.changes) > 0
}

type ListRow = Record<string, SQLOutputValue>

const LIST_SUMMARY_LENGTH = 300

const LIST_COLUMNS = `id, category, name, end_date, cost_type, cost_amount_usd, status, verification,
  logo_path, row_version,
  SUBSTR(COALESCE(NULLIF(task_summary, ''), how_to_join), 1, ${LIST_SUMMARY_LENGTH}) AS summary`

/** Khớp sortByDeadline ở renderer: còn hạn tăng dần → quá hạn (cũ nhất trước) → không có hạn (theo tên). */
const LIST_ORDER_BY = `CASE
    WHEN NULLIF(end_date, '') IS NULL THEN 2
    WHEN julianday(end_date) < julianday(?) THEN 1
    ELSE 0
  END, julianday(end_date), name COLLATE NOCASE, id`

function buildListWhere(query: ProjectListQuery): { sql: string; params: Array<string | number> } {
  const clauses = ['category = ?']
  const params: Array<string | number> = [query.category]

  const key = normalizeNameKey(query.search)
  if (key) {
    clauses.push("name_key LIKE ? ESCAPE '\\'")
    params.push(`%${key.replace(/[\\%_]/g, '\\$&')}%`)
  }
  if (query.status !== 'all') {
    clauses.push('status = ?')
    params.push(query.status)
  }
  if (query.cost !== 'all') {
    clauses.push('cost_type = ?')
    params.push(query.cost)
  }

  const days = 'julianday(end_date) - julianday(?)'
  switch (query.deadline) {
    case 'none':
      clauses.push("NULLIF(end_date, '') IS NULL")
      break
    case 'soon3':
      clauses.push(`NULLIF(end_date, '') IS NOT NULL AND ${days} BETWEEN 0 AND 3`)
      params.push(query.today)
      break
    case 'soon7':
      clauses.push(`NULLIF(end_date, '') IS NOT NULL AND ${days} BETWEEN 0 AND 7`)
      params.push(query.today)
      break
    case 'active':
      clauses.push(`NULLIF(end_date, '') IS NOT NULL AND ${days} >= 0`)
      params.push(query.today)
      break
    case 'expired':
      clauses.push(`NULLIF(end_date, '') IS NOT NULL AND ${days} < 0`)
      params.push(query.today)
      break
    default:
      break
  }
  return { sql: clauses.join(' AND '), params }
}

export function listProjectsPage(query: ProjectListQuery): ProjectListResult {
  const database = getDatabase()
  const where = buildListWhere(query)

  const totalRow = database
    .prepare(`SELECT COUNT(*) AS total FROM projects WHERE ${where.sql}`)
    .get(...where.params) as ListRow | undefined
  const total = Number(totalRow?.total ?? 0)
  const totalAllRow = database
    .prepare('SELECT COUNT(*) AS total FROM projects WHERE category = ?')
    .get(query.category) as ListRow | undefined
  const totalAll = Number(totalAllRow?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize))
  const page = Math.min(Math.max(1, query.page), pageCount)

  const rows = database
    .prepare(
      `SELECT ${LIST_COLUMNS} FROM projects WHERE ${where.sql} ORDER BY ${LIST_ORDER_BY} LIMIT ? OFFSET ?`
    )
    .all(...where.params, query.today, query.pageSize, (page - 1) * query.pageSize) as ListRow[]

  const items: ProjectListItem[] = rows.map((row) => ({
    id: String(row.id),
    category: row.category as ProjectListItem['category'],
    name: String(row.name),
    summary: String(row.summary ?? ''),
    endDate: row.end_date === null ? null : String(row.end_date),
    costType: row.cost_type as ProjectListItem['costType'],
    costAmountUsd: row.cost_amount_usd === null ? null : Number(row.cost_amount_usd),
    status: row.status as ProjectListItem['status'],
    verification: row.verification as ProjectListItem['verification'],
    logoPath: row.logo_path === null ? null : String(row.logo_path),
    rowVersion: Number(row.row_version)
  }))

  return { items, total, totalAll, page, pageSize: query.pageSize, pageCount }
}
