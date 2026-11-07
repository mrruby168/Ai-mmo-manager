import { Field, SearchInput, Select } from '../../common/Field'
import type { DeadlineTone } from '@shared/date-utils'
import { daysRemaining, getDeadlineInfo } from '@shared/date-utils'
import { normalizeNameKey } from '@shared/normalize'
import type { ProjectStatus } from '@shared/constants'
import type { Project } from '@shared/types'

export type CostFilter = 'all' | 'free' | 'paid' | 'unverified'
export type DeadlineFilter = 'all' | 'soon3' | 'soon7' | 'active' | 'expired' | 'none'

export interface ProjectFilterState {
  search: string
  status: ProjectStatus | 'all'
  cost: CostFilter
  deadline: DeadlineFilter
}

export const emptyFilters: ProjectFilterState = {
  search: '',
  status: 'all',
  cost: 'all',
  deadline: 'all'
}

const STATUS_OPTIONS: Array<{ value: ProjectStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'not_joined', label: 'Chưa tham gia' },
  { value: 'in_progress', label: 'Đang thực hiện' },
  { value: 'completed', label: 'Hoàn thành' }
]

const COST_OPTIONS: Array<{ value: CostFilter; label: string }> = [
  { value: 'all', label: 'Tất cả chi phí' },
  { value: 'free', label: 'FREE' },
  { value: 'paid', label: 'Có phí' },
  { value: 'unverified', label: 'Chưa xác minh' }
]

const DEADLINE_OPTIONS: Array<{ value: DeadlineFilter; label: string }> = [
  { value: 'all', label: 'Tất cả deadline' },
  { value: 'soon3', label: 'Còn ≤ 3 ngày' },
  { value: 'soon7', label: 'Còn ≤ 7 ngày' },
  { value: 'active', label: 'Còn hạn' },
  { value: 'expired', label: 'Đã qua hạn' },
  { value: 'none', label: 'Không có deadline' }
]

function matchesDeadline(project: Project, filter: DeadlineFilter, today: string): boolean {
  if (filter === 'all') {
    return true
  }
  if (filter === 'none') {
    return !project.endDate
  }
  if (!project.endDate) {
    return false
  }
  const days = daysRemaining(project.endDate, today)
  switch (filter) {
    case 'soon3':
      return days >= 0 && days <= 3
    case 'soon7':
      return days >= 0 && days <= 7
    case 'active':
      return days >= 0
    case 'expired':
      return days < 0
  }
}

function sortByDeadline(projects: Project[], today: string): Project[] {
  return [...projects].sort((left, right) => {
    if (!left.endDate && !right.endDate) {
      return left.name.localeCompare(right.name)
    }
    if (!left.endDate) {
      return 1
    }
    if (!right.endDate) {
      return -1
    }
    const leftDays = daysRemaining(left.endDate, today)
    const rightDays = daysRemaining(right.endDate, today)
    const leftExpired = leftDays < 0
    const rightExpired = rightDays < 0
    if (leftExpired !== rightExpired) {
      return leftExpired ? 1 : -1
    }
    if (leftDays !== rightDays) {
      return leftDays - rightDays
    }
    return left.name.localeCompare(right.name)
  })
}

export function applyProjectFilters(projects: Project[], filters: ProjectFilterState, today: string): Project[] {
  const searchKey = normalizeNameKey(filters.search)
  const filtered = projects.filter((project) => {
    if (searchKey && !normalizeNameKey(project.name).includes(searchKey)) {
      return false
    }
    if (filters.status !== 'all' && project.status !== filters.status) {
      return false
    }
    if (filters.cost !== 'all' && project.costType !== filters.cost) {
      return false
    }
    return matchesDeadline(project, filters.deadline, today)
  })
  return sortByDeadline(filtered, today)
}

export function deadlineToneFor(project: Project, today: string): DeadlineTone {
  return getDeadlineInfo(project.endDate, today).tone
}

export function ProjectFilters({
  filters,
  onChange,
  disabled
}: {
  filters: ProjectFilterState
  onChange: (filters: ProjectFilterState) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className="toolbar">
      <SearchInput
        value={filters.search}
        onChange={(search) => onChange({ ...filters, search })}
        placeholder="Tìm theo tên dự án…"
        label="Tìm kiếm dự án"
      />
      <Field label="Trạng thái">
        <Select
          value={filters.status}
          disabled={disabled}
          onChange={(event) => onChange({ ...filters, status: event.target.value as ProjectStatus | 'all' })}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Chi phí">
        <Select
          value={filters.cost}
          disabled={disabled}
          onChange={(event) => onChange({ ...filters, cost: event.target.value as CostFilter })}
        >
          {COST_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Deadline">
        <Select
          value={filters.deadline}
          disabled={disabled}
          onChange={(event) => onChange({ ...filters, deadline: event.target.value as DeadlineFilter })}
        >
          {DEADLINE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}
