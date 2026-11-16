/**
 * FIX 5 / 9b: truy vấn Check News theo từng dự án.
 * Ưu tiên handle X (nếu có), sau đó tên dự án; dự án không có handle được gộp
 * 3 tên mỗi truy vấn để tiết kiệm ngân sách. Hàm thuần, không import Electron.
 */

import { buildGroupedSearchQueries } from './costControl'
import { normalizeXHandle } from './xLinks'
import type { Project } from './types'

export const PROJECT_QUERY_SUFFIX = 'airdrop news'

/** v0.1.4: Daily chỉ cần tin 2–3 ngày nên truy vấn ngắn, ít kết quả hơn. */
export const PROJECT_DAILY_SUFFIX = 'airdrop'

/**
 * v0.1.4: truy vấn theo tên dự án ở Daily, dùng bộ từ khóa Daily của bản kế hoạch
 * (gộp trong ngoặc để OR không làm loãng điều kiện tên).
 */
export const PROJECT_DAILY_NAME_SUFFIX = '(airdrop OR snapshot OR TGE OR claim OR deadline OR ended OR season)'

/** v0.1.4: truy vấn sâu của vòng 2, chỉ chạy cho dự án chưa có tin ở vòng 1. */
export const PROJECT_DEEP_SUFFIX = '(snapshot OR TGE OR claim OR "airdrop ends" OR "season ends")'

/** Bài trên X thường ít nhưng cần phủ rộng hơn tên dự án. */
export const PROJECT_X_QUERY_MAX_RESULTS = 8
export const PROJECT_NAME_QUERY_MAX_RESULTS = 6

export const PROJECT_DAILY_X_QUERY_MAX_RESULTS = 6
export const PROJECT_DAILY_NAME_QUERY_MAX_RESULTS = 4
export const PROJECT_DEEP_X_QUERY_MAX_RESULTS = 6
export const PROJECT_DEEP_NAME_QUERY_MAX_RESULTS = 6

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

function buildQueries(
  project: ProjectQueryTarget,
  xSuffix: string,
  nameSuffix: string,
  xMaxResults: number,
  nameMaxResults: number
): ProjectQuery[] {
  const queries: ProjectQuery[] = []
  const handle = extractXHandle(project.socials?.x)
  if (handle) {
    queries.push({
      projectId: project.id,
      kind: 'x',
      query: `@${handle} ${xSuffix}`,
      maxResults: xMaxResults
    })
  }
  const name = cleanName(project.name)
  if (name.length > 0) {
    queries.push({
      projectId: project.id,
      kind: 'name',
      query: `"${name}" ${nameSuffix}`,
      maxResults: nameMaxResults
    })
  }
  return queries
}

/** Handle X luôn đi với "airdrop" ngắn để không làm loãng kết quả. */
export const PROJECT_X_QUERY_SUFFIX = 'airdrop'

/**
 * Truy vấn của một dự án: X trước (nếu có handle), tên sau.
 * Không dùng `site:`/`from:` hay bộ lọc thời gian (D24).
 */
export function buildProjectQueries(project: ProjectQueryTarget): ProjectQuery[] {
  return buildQueries(
    project,
    PROJECT_X_QUERY_SUFFIX,
    PROJECT_QUERY_SUFFIX,
    PROJECT_X_QUERY_MAX_RESULTS,
    PROJECT_NAME_QUERY_MAX_RESULTS
  )
}

/** v0.1.4: truy vấn gọn cho Daily Scan (cửa sổ 2–3 ngày). */
export function buildProjectDailyQueries(project: ProjectQueryTarget): ProjectQuery[] {
  return buildQueries(
    project,
    PROJECT_DAILY_SUFFIX,
    PROJECT_DAILY_NAME_SUFFIX,
    PROJECT_DAILY_X_QUERY_MAX_RESULTS,
    PROJECT_DAILY_NAME_QUERY_MAX_RESULTS
  )
}

/** v0.1.4: truy vấn sâu cho vòng 2 của dự án chưa có tin. */
export function buildProjectDeepQueries(project: ProjectQueryTarget): ProjectQuery[] {
  return buildQueries(
    project,
    PROJECT_DEEP_SUFFIX,
    PROJECT_DEEP_SUFFIX,
    PROJECT_DEEP_X_QUERY_MAX_RESULTS,
    PROJECT_DEEP_NAME_QUERY_MAX_RESULTS
  )
}

/**
 * Gộp tên các dự án KHÔNG có handle X thành từng truy vấn 3 tên.
 * Trả kèm `projectIds` để biết kết quả thuộc nhóm nào.
 */
export function buildGroupedProjectNameQueries(
  projects: readonly ProjectQueryTarget[],
  suffix: string = PROJECT_QUERY_SUFFIX
): ProjectQueryGroup[] {
  const result: ProjectQueryGroup[] = []
  const candidates = projects.filter((project) => cleanName(project.name).length > 0 && !extractXHandle(project.socials?.x))
  for (let index = 0; index < candidates.length; index += 3) {
    const slice = candidates.slice(index, index + 3)
    const queries = buildGroupedSearchQueries(
      slice.map((project) => project.name),
      suffix,
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
