import type { CostType, ProjectCategory, ProjectStatus, VerificationState } from './constants'

export const PROJECT_COST_FILTERS = ['all', 'free', 'paid', 'unverified'] as const
export type CostFilter = (typeof PROJECT_COST_FILTERS)[number]

export const PROJECT_DEADLINE_FILTERS = ['all', 'soon3', 'soon7', 'active', 'expired', 'none'] as const
export type DeadlineFilter = (typeof PROJECT_DEADLINE_FILTERS)[number]

export const PROJECT_PAGE_SIZES = [20, 50, 100] as const
export type ProjectPageSize = (typeof PROJECT_PAGE_SIZES)[number]
export const DEFAULT_PROJECT_PAGE_SIZE: ProjectPageSize = 20

export interface ProjectListQuery {
  category: ProjectCategory
  search: string
  status: ProjectStatus | 'all'
  cost: CostFilter
  deadline: DeadlineFilter
  /** YYYY-MM-DD theo giờ máy người dùng (renderer gửi lên). */
  today: string
  page: number
  pageSize: ProjectPageSize
}

/** Dòng gọn cho danh sách: KHÔNG có notes, howToJoin, sources, socials. */
export interface ProjectListItem {
  id: string
  category: ProjectCategory
  name: string
  summary: string
  endDate: string | null
  costType: CostType
  costAmountUsd: number | null
  status: ProjectStatus
  verification: VerificationState
  logoPath: string | null
  rowVersion: number
}

export interface ProjectListResult {
  items: ProjectListItem[]
  /** Số dự án khớp bộ lọc. */
  total: number
  /** Số dự án của category, bỏ qua bộ lọc (để phân biệt "chưa có dự án" và "không khớp"). */
  totalAll: number
  page: number
  pageSize: ProjectPageSize
  pageCount: number
}
