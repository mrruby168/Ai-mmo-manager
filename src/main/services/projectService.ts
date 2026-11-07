import { ZodError } from 'zod'
import { normalizeDomainKey, normalizeNameKey } from '@shared/normalize'
import { coerceProjectItem, extractProjectItems, formatZodError } from '@shared/coerce'
import { projectImportItemSchema } from '@shared/schemas'
import type { ProjectImportItem } from '@shared/schemas'
import type { ProjectCategory, ProjectOrigin } from '@shared/constants'
import type { Project, ProjectInput, SocialLinks } from '@shared/types'
import type { ProjectMutableFields } from '../db/projectsRepo'
import { withTransaction } from '../db/connection'
import {
  allocateProjectId,
  deleteProject as repoDeleteProject,
  findProjectByDomainKey,
  findProjectByNameKey,
  getProject as repoGetProject,
  insertProject,
  listProjectIndex,
  listProjects as repoListProjects,
  setProjectLogo as repoSetProjectLogo,
  updateProject as repoUpdateProject
} from '../db/projectsRepo'
import type { ProjectIndexEntry } from '../db/projectsRepo'
import { deleteLogoFile } from './logoService'
import { logError } from './logger'

export type ProjectErrorCode = 'INVALID' | 'DUPLICATE' | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'WRITE_MISMATCH'

export class ProjectError extends Error {
  readonly code: ProjectErrorCode

  constructor(code: ProjectErrorCode, message: string) {
    super(message)
    this.name = 'ProjectError'
    this.code = code
  }
}

export interface AddResult {
  name: string
  project: Project | null
  duplicateOf: string | null
  warning: string | null
  error: string | null
}

export interface ImportResult {
  results: AddResult[]
  addedCount: number
  duplicateCount: number
  failedCount: number
}

const INVALID_NAME_MESSAGE = 'Tên dự án không hợp lệ'

function nameKeyFor(name: string): string {
  return normalizeNameKey(name) || name.trim().toLowerCase()
}

function normalizeSocials(socials: ProjectImportItem['socials']): SocialLinks {
  const result: SocialLinks = {}
  if (socials?.x) {
    result.x = socials.x
  }
  if (socials?.discord) {
    result.discord = socials.discord
  }
  if (socials?.telegram) {
    result.telegram = socials.telegram
  }
  if (socials?.other && socials.other.length > 0) {
    result.other = [...socials.other]
  }
  return result
}

function toFields(input: ProjectImportItem, updatedAt: string): ProjectMutableFields {
  return {
    category: input.category,
    name: input.name.trim(),
    nameKey: nameKeyFor(input.name),
    domainKey: normalizeDomainKey(input.website),
    website: input.website ?? null,
    socials: normalizeSocials(input.socials),
    taskSummary: input.taskSummary ?? '',
    howToJoin: input.howToJoin ?? '',
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    costType: input.costType ?? 'unverified',
    costAmountUsd: input.costType === 'paid' ? (input.costAmountUsd ?? null) : null,
    status: input.status ?? 'not_joined',
    verification: input.verification ?? 'unverified',
    sources: input.sources ?? [],
    notes: input.notes ?? '',
    updatedAt
  }
}

function findNameDuplicate(category: ProjectImportItem['category'], nameKey: string, excludeId: string | null): Project | null {
  const byName = findProjectByNameKey(category, nameKey)
  if (byName && byName.id !== excludeId) {
    return byName
  }
  return null
}

/**
 * Domain duplicates are a warning, not a hard block: Event MMO and Airdrop
 * campaigns often share the same website. Same-name duplicates still block.
 */
function findDomainDuplicate(domainKey: string | null, excludeId: string | null): Project | null {
  if (!domainKey) {
    return null
  }
  const byDomain = findProjectByDomainKey(domainKey)
  return byDomain && byDomain.id !== excludeId ? byDomain : null
}

function verifyWritten(id: string, expected: ProjectMutableFields): Project {
  const stored = repoGetProject(id)
  if (!stored) {
    logError(`Đọc lại dự án ${id} sau khi ghi không thấy`)
    throw new ProjectError('WRITE_MISMATCH', 'Ghi dự án thất bại: không đọc lại được dữ liệu')
  }

  const mismatched =
    stored.name !== expected.name ||
    stored.category !== expected.category ||
    stored.status !== expected.status ||
    stored.costType !== expected.costType ||
    stored.endDate !== expected.endDate ||
    stored.domainKey !== expected.domainKey

  if (mismatched) {
    logError(`Dữ liệu dự án ${id} sau khi ghi không khớp giá trị gửi vào`)
    throw new ProjectError('WRITE_MISMATCH', 'Ghi dự án thất bại: dữ liệu đọc lại không khớp')
  }
  return stored
}

export function listProjects(category?: ProjectCategory): Project[] {
  return repoListProjects(category)
}

export function getProject(id: string): Project | null {
  return repoGetProject(id)
}

/**
 * Turns a stored project back into the input shape accepted by
 * `projectImportItemSchema`, so a partial chat edit can be merged onto it
 * without resetting the fields the user did not touch.
 */
export function projectToInput(project: Project): ProjectInput {
  return {
    category: project.category,
    name: project.name,
    website: project.website,
    socials: {
      x: project.socials.x,
      discord: project.socials.discord,
      telegram: project.socials.telegram,
      other: project.socials.other ? [...project.socials.other] : undefined
    },
    taskSummary: project.taskSummary,
    howToJoin: project.howToJoin,
    startDate: project.startDate,
    endDate: project.endDate,
    costType: project.costType,
    costAmountUsd: project.costAmountUsd,
    status: project.status,
    verification: project.verification,
    sources: [...project.sources],
    notes: project.notes
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Applies a partial change set (for example from the chat box) on top of the
 * stored project. Unknown fields are dropped by the zod schema later.
 */
export function updateProjectWithChanges(id: string, changes: unknown, expectedRowVersion?: number): Project {
  const existing = repoGetProject(id)
  if (!existing) {
    throw new ProjectError('NOT_FOUND', 'Không tìm thấy dự án cần sửa')
  }

  const base = projectToInput(existing)
  const patch = isRecord(changes) ? changes : {}
  const merged = { ...base, ...patch } as ProjectInput

  if (isRecord(patch.socials)) {
    merged.socials = { ...(base.socials ?? {}), ...patch.socials } as SocialLinks
  }

  return updateProjectById(id, merged, expectedRowVersion)
}

export function listIndex(): ProjectIndexEntry[] {
  return listProjectIndex()
}

export function addProject(rawInput: unknown, origin: ProjectOrigin): AddResult {
  const input = projectImportItemSchema.parse(coerceProjectItem(rawInput))
  const nameKey = nameKeyFor(input.name)
  if (!nameKey) {
    throw new ProjectError('INVALID', INVALID_NAME_MESSAGE)
  }

  const nameDuplicate = findNameDuplicate(input.category, nameKey, null)
  if (nameDuplicate) {
    return {
      name: input.name,
      project: null,
      duplicateOf: nameDuplicate.id,
      warning: null,
      error: `Trùng với dự án ${nameDuplicate.name} (${nameDuplicate.id})`
    }
  }

  const domainKey = normalizeDomainKey(input.website)
  const domainDuplicate = findDomainDuplicate(domainKey, null)
  const warning = domainDuplicate
    ? `Trùng domain với dự án ${domainDuplicate.name} (${domainDuplicate.id}) — vẫn thêm vì bạn đã xác nhận`
    : null

  const now = new Date().toISOString()
  const fields = toFields(input, now)

  const id = withTransaction(() => {
    const allocated = allocateProjectId()
    insertProject({
      id: allocated,
      ...fields,
      logoPath: null,
      origin,
      createdAt: now
    })
    return allocated
  })

  return { name: fields.name, project: verifyWritten(id, fields), duplicateOf: null, warning, error: null }
}

export function createProject(rawInput: unknown): Project {
  const result = addProject(rawInput, 'manual')
  if (!result.project) {
    throw new ProjectError('DUPLICATE', result.error ?? 'Dự án đã tồn tại')
  }
  return result.project
}

export function addProjects(items: unknown[], origin: ProjectOrigin): AddResult[] {
  return items.map((item) => {
    try {
      return addProject(item, origin)
    } catch (error) {
      const message =
        error instanceof ProjectError
          ? error.message
          : error instanceof ZodError
            ? formatZodError(error)
            : error instanceof Error
              ? error.message
              : 'Lỗi không xác định'
      const rawName = (item as { name?: unknown; title?: unknown })?.name ?? (item as { title?: unknown })?.title
      return {
        name: typeof rawName === 'string' ? String(rawName) : 'Không rõ',
        project: null,
        duplicateOf: null,
        warning: null,
        error: message
      }
    }
  })
}

export function updateProjectById(id: string, rawInput: unknown, expectedRowVersion?: number): Project {
  const existing = repoGetProject(id)
  if (!existing) {
    throw new ProjectError('NOT_FOUND', 'Không tìm thấy dự án cần sửa')
  }
  if (typeof expectedRowVersion === 'number' && existing.rowVersion !== expectedRowVersion) {
    throw new ProjectError('VERSION_CONFLICT', 'Dự án đã thay đổi ở nơi khác, hãy tải lại rồi thử lại')
  }

  const input = projectImportItemSchema.parse(coerceProjectItem(rawInput))
  const fields = toFields(input, new Date().toISOString())
  const nameDuplicate = findNameDuplicate(input.category, fields.nameKey, id)
  if (nameDuplicate) {
    throw new ProjectError('DUPLICATE', `Trùng với dự án ${nameDuplicate.name} (${nameDuplicate.id})`)
  }
  const domainDuplicate = findDomainDuplicate(fields.domainKey, id)
  if (domainDuplicate) {
    logError(`Cảnh báo: dự án ${id} trùng domain với ${domainDuplicate.id}, vẫn ghi theo yêu cầu`)
  }

  const applied = repoUpdateProject(id, fields, existing.rowVersion)
  if (!applied) {
    throw new ProjectError('VERSION_CONFLICT', 'Dự án đã thay đổi ở nơi khác, hãy tải lại rồi thử lại')
  }
  return verifyWritten(id, fields)
}

export function deleteProjectById(id: string): void {
  const existing = repoGetProject(id)
  if (!existing) {
    throw new ProjectError('NOT_FOUND', 'Không tìm thấy dự án cần xóa')
  }
  const removed = repoDeleteProject(id)
  if (!removed) {
    throw new ProjectError('NOT_FOUND', 'Không tìm thấy dự án cần xóa')
  }
  deleteLogoFile(existing.logoPath)
}

export function setProjectLogo(id: string, relativePath: string | null): Project {
  const updatedAt = new Date().toISOString()
  const applied = repoSetProjectLogo(id, relativePath, updatedAt)
  if (!applied) {
    throw new ProjectError('NOT_FOUND', 'Không tìm thấy dự án để đặt logo')
  }
  const stored = repoGetProject(id)
  if (!stored || stored.logoPath !== relativePath) {
    throw new ProjectError('WRITE_MISMATCH', 'Ghi logo thất bại: dữ liệu đọc lại không khớp')
  }
  return stored
}

export function importProjects(rawPayload: unknown): ImportResult {
  const items = extractProjectItems(rawPayload)
  if (items.length === 0) {
    throw new ProjectError('INVALID', 'Không tìm thấy danh sách dự án trong JSON (cần projects/items/data hoặc một dự án)')
  }
  const results = addProjects(items, 'import')
  return {
    results,
    addedCount: results.filter((result) => result.project !== null).length,
    duplicateCount: results.filter((result) => result.duplicateOf !== null).length,
    failedCount: results.filter((result) => result.error !== null && result.duplicateOf === null).length
  }
}
