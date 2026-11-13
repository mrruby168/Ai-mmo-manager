/**
 * FIX 5 / 9b: truy vấn Check News theo từng dự án.
 * Ưu tiên handle X (nếu có), sau đó tên dự án; dự án không có handle được gộp
 * 3 tên mỗi truy vấn để tiết kiệm ngân sách. Hàm thuần, không import Electron.
 */

import { buildGroupedSearchQueries } from './costControl'
import { normalizeXHandle } from './xLinks'
import type { Project } from './types'

export const PROJECT_QUERY_SUFFIX = 'airdrop news'

/** Bài trên X thường ít nhưng cần phủ rộng hơn tên dự án. */
export const PROJECT_X_QUERY_MAX_RESULTS = 8
export const PROJECT_NAME_QUERY_MAX_RESULTS = 6

export type ProjectQueryKind = 'x' | 'name'

export interface ProjectQuery {
  projectId: string
  kind: ProjectQueryKind
  query: string
  maxResults: number
}

/** Một truy vấn gộp cho tối đa 3 dự án không có handle X. */
export interface ProjectQueryGroup {
  projectIds: string[]
  query: string
  maxResults: number
}

export type ProjectQueryTarget = Pick<Project, 'id' | 'name' | 'socials'>

/**
 * Nhận `https://x.com/Alpha`, `https://twitter.com/Alpha/status/...`,
 * `@Alpha` hoặc `Alpha`. Trả handle không kèm `@`, null nếu không hợp lệ.
 */
export function extractXHandle(raw: string | null | undefined): string | null {
  return normalizeXHandle(raw)
}

function cleanName(name: string): string {
  return name.replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Truy vấn của một dự án: X trước (nếu có handle), tên sau.
 * Không dùng `site:`/`from:` hay bộ lọc thời gian (D24).
 */
export function buildProjectQueries(project: ProjectQueryTarget): ProjectQuery[] {
  const queries: ProjectQuery[] = []
  const handle = extractXHandle(project.socials?.x)
  if (handle) {
    queries.push({
      projectId: project.id,
      kind: 'x',
      query: `@${handle} airdrop`,
      maxResults: PROJECT_X_QUERY_MAX_RESULTS
    })
  }
  const name = cleanName(project.name)
  if (name.length > 0) {
    queries.push({
      projectId: project.id,
      kind: 'name',
      query: `"${name}" ${PROJECT_QUERY_SUFFIX}`,
      maxResults: PROJECT_NAME_QUERY_MAX_RESULTS
    })
  }
  return queries
}

/**
 * Gộp tên các dự án KHÔNG có handle X thành từng truy vấn 3 tên.
 * Trả kèm `projectIds` để biết kết quả thuộc nhóm nào.
 */
export function buildGroupedProjectNameQueries(projects: readonly ProjectQueryTarget[]): ProjectQueryGroup[] {
  const result: ProjectQueryGroup[] = []
  const candidates = projects.filter((project) => cleanName(project.name).length > 0 && !extractXHandle(project.socials?.x))
  for (let index = 0; index < candidates.length; index += 3) {
    const slice = candidates.slice(index, index + 3)
    const queries = buildGroupedSearchQueries(
      slice.map((project) => project.name),
      PROJECT_QUERY_SUFFIX,
      { maxNamesPerQuery: 3, maxLength: 300 }
    )
    for (const query of queries) {
      result.push({
        projectIds: slice.map((project) => project.id),
        query,
        maxResults: PROJECT_NAME_QUERY_MAX_RESULTS
      })
    }
  }
  return result
}

export interface ProjectQueryResultText {
  title: string
  snippet?: string
  url: string
}

/** Kết quả tìm kiếm có nhắc tên dự án hoặc handle X hay không. */
export function queryTextHitsProject(result: ProjectQueryResultText, project: ProjectQueryTarget): boolean {
  const haystack = `${result.title}\n${result.snippet ?? ''}\n${result.url}`.toLowerCase()
  const name = cleanName(project.name).toLowerCase()
  if (name.length >= 2 && haystack.includes(name)) {
    return true
  }
  const handle = extractXHandle(project.socials?.x)
  return handle !== null && haystack.includes(handle.toLowerCase())
}
