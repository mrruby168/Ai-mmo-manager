import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, getDatabase, openDatabase } from '../src/main/db/connection'
import { insertProject, listProjectsPage } from '../src/main/db/projectsRepo'
import type { ProjectRecord } from '../src/main/db/projectsRepo'
import type { CostType, ProjectCategory, ProjectStatus } from '../src/shared/constants'
import { daysRemaining } from '../src/shared/date-utils'
import { normalizeNameKey } from '../src/shared/normalize'
import type { CostFilter, DeadlineFilter } from '../src/shared/projectList'

const TODAY = '2026-11-19'
const DAY = 86_400_000
const dayOffset = (n: number): string => new Date(Date.UTC(2026, 10, 19) + n * DAY).toISOString().slice(0, 10)

interface SeedProject {
  id: string
  name: string
  endDate: string | null
  status: ProjectStatus
  costType: CostType
}

interface FilterState {
  search: string
  status: ProjectStatus | 'all'
  cost: CostFilter
  deadline: DeadlineFilter
}

/* ---------- bản sao nguyên văn applyProjectFilters + sortByDeadline hiện tại ---------- */

function matchesDeadline(project: SeedProject, filter: DeadlineFilter, today: string): boolean {
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

function sortByDeadline(projects: SeedProject[], today: string): SeedProject[] {
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

function applyReference(projects: SeedProject[], filters: FilterState, today: string): SeedProject[] {
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

/* ---------- seed ---------- */

openDatabase(':memory:')

afterAll(() => {
  closeDatabase()
})

let seedProjects: SeedProject[] = []

function makeRecord(input: {
  id: string
  name: string
  category?: ProjectCategory
  endDate: string | null
  status?: ProjectStatus
  costType?: CostType
  taskSummary?: string
  howToJoin?: string
  nameKey?: string
}): ProjectRecord {
  return {
    id: input.id,
    category: input.category ?? 'airdrop',
    name: input.name,
    nameKey: input.nameKey ?? normalizeNameKey(input.name),
    domainKey: null,
    website: null,
    socials: {},
    taskSummary: input.taskSummary ?? `Nhiệm vụ ${input.id}`,
    howToJoin: input.howToJoin ?? '',
    startDate: null,
    endDate: input.endDate,
    costType: input.costType ?? 'free',
    costAmountUsd: null,
    status: input.status ?? 'not_joined',
    verification: 'unverified',
    sources: [],
    logoPath: null,
    notes: '',
    origin: 'manual',
    createdAt: '2026-11-19T00:00:00.000Z',
    updatedAt: '2026-11-19T00:00:00.000Z'
  }
}

function seed(): SeedProject[] {
  const rows: SeedProject[] = []
  const statuses: ProjectStatus[] = ['not_joined', 'in_progress', 'completed']
  const costs: CostType[] = ['free', 'paid', 'unverified']

  for (let index = 0; index < 240; index += 1) {
    const id = `PRJ-${String(index + 1).padStart(3, '0')}`
    const name = index % 2 === 0 ? `Alpha ${index}` : `beta ${index}`
    const endDate = index % 9 === 0 ? null : dayOffset(((index * 37) % 120) - 40)
    const status = statuses[index % 3]
    const costType = costs[(index >> 1) % 3]
    insertProject(makeRecord({ id, name, endDate, status, costType }))
    rows.push({ id, name, endDate, status, costType })
  }

  for (let index = 0; index < 10; index += 1) {
    insertProject(
      makeRecord({
        id: `EVT-${String(index + 1).padStart(3, '0')}`,
        name: `Event ${index}`,
        category: 'event_mmo',
        endDate: dayOffset(index)
      })
    )
  }

  return rows
}

beforeEach(() => {
  getDatabase().exec('DELETE FROM projects')
  getDatabase().exec("UPDATE meta SET value = '0' WHERE key = 'next_project_seq'")
  seedProjects = seed()
})

function collectAll(filter: FilterState): { ids: string[]; total: number } {
  const ids: string[] = []
  let total = 0
  let pageNo = 1
  for (;;) {
    const result = listProjectsPage({
      category: 'airdrop',
      ...filter,
      today: TODAY,
      page: pageNo,
      pageSize: 20
    })
    total = result.total
    ids.push(...result.items.map((item) => item.id))
    if (pageNo >= result.pageCount) {
      break
    }
    pageNo += 1
  }
  return { ids, total }
}

const DEADLINES: DeadlineFilter[] = ['all', 'soon3', 'soon7', 'active', 'expired', 'none']
const STATUSES: Array<ProjectStatus | 'all'> = ['all', 'in_progress']
const COSTS: CostFilter[] = ['all', 'free']
const SEARCHES = ['', 'alpha', 'zz-khong-co']

const COMBINATIONS: FilterState[] = DEADLINES.flatMap((deadline) =>
  STATUSES.flatMap((status) => COSTS.flatMap((cost) => SEARCHES.map((search) => ({ deadline, status, cost, search }))))
)

describe('listProjectsPage khớp logic lọc/sắp xếp cũ trên tập seed đã thử', () => {
  it.each(COMBINATIONS)('khớp trên seed: %j', (filter) => {
    const expected = applyReference(seedProjects, filter, TODAY)
    const { ids, total } = collectAll(filter)

    expect(total).toBe(expected.length)
    expect(ids).toEqual(expected.map((project) => project.id))
  })
})

describe('listProjectsPage biên', () => {
  it('page quá lớn trả về trang cuối', () => {
    const filter: FilterState = { search: '', status: 'all', cost: 'all', deadline: 'all' }
    const expected = applyReference(seedProjects, filter, TODAY)
    const last = listProjectsPage({
      category: 'airdrop',
      ...filter,
      today: TODAY,
      page: 999,
      pageSize: 20
    })

    expect(last.page).toBe(last.pageCount)
    expect(last.items.map((item) => item.id)).toEqual(expected.slice((last.pageCount - 1) * 20).map((project) => project.id))
  })

  it('totalAll đúng dù bộ lọc loại hết', () => {
    const result = listProjectsPage({
      category: 'airdrop',
      search: 'zz-khong-co',
      status: 'all',
      cost: 'all',
      deadline: 'all',
      today: TODAY,
      page: 1,
      pageSize: 20
    })

    expect(result.total).toBe(0)
    expect(result.totalAll).toBe(240)
    expect(result.items).toEqual([])
    expect(result.pageCount).toBe(1)
  })

  it('end_date rỗng nằm cùng nhóm không có hạn và khớp bản tham chiếu', () => {
    insertProject(makeRecord({ id: 'PRJ-902', name: 'Empty End', endDate: null }))
    getDatabase().prepare('UPDATE projects SET end_date = ? WHERE id = ?').run('', 'PRJ-902')

    const withEmpty: SeedProject[] = [
      ...seedProjects,
      { id: 'PRJ-902', name: 'Empty End', endDate: '', status: 'not_joined', costType: 'free' }
    ]
    const filter: FilterState = { search: '', status: 'all', cost: 'all', deadline: 'none' }
    const expected = applyReference(withEmpty, filter, TODAY)
    const { ids, total } = collectAll(filter)

    expect(ids).toContain('PRJ-902')
    expect(total).toBe(expected.length)
    expect(ids).toEqual(expected.map((project) => project.id))
  })

  it('tìm tên tiếng Việt bằng chữ hoa không dấu', () => {
    insertProject(makeRecord({ id: 'PRJ-900', name: 'Đồng Tiền', nameKey: 'dong tien', endDate: dayOffset(5) }))
    const filter: FilterState = { search: 'ĐỒNG', status: 'all', cost: 'all', deadline: 'all' }
    const expected = applyReference(
      [...seedProjects, { id: 'PRJ-900', name: 'Đồng Tiền', endDate: dayOffset(5), status: 'not_joined', costType: 'free' }],
      filter,
      TODAY
    )
    const { ids, total } = collectAll(filter)

    expect(total).toBe(expected.length)
    expect(new Set(ids)).toEqual(new Set(expected.map((project) => project.id)))
  })

  it('tên chỉ có ký tự đặc biệt dùng name_key fallback giống bản tham chiếu', () => {
    insertProject(makeRecord({ id: 'PRJ-901', name: '!!!', nameKey: '!!!', endDate: dayOffset(3) }))
    const filter: FilterState = { search: '!!!', status: 'all', cost: 'all', deadline: 'all' }
    const expected = applyReference(
      [...seedProjects, { id: 'PRJ-901', name: '!!!', endDate: dayOffset(3), status: 'not_joined', costType: 'free' }],
      filter,
      TODAY
    )
    const { ids, total } = collectAll(filter)

    expect(total).toBe(expected.length)
    expect(new Set(ids)).toEqual(new Set(expected.map((project) => project.id)))
  })

  it('summary cắt 300 ký tự và lấy howToJoin khi taskSummary rỗng', () => {
    insertProject(makeRecord({ id: 'PRJ-903', name: 'Summary Long', endDate: dayOffset(4), taskSummary: 'x'.repeat(1000) }))
    insertProject(
      makeRecord({ id: 'PRJ-904', name: 'Summary Fallback', endDate: dayOffset(4), taskSummary: '', howToJoin: 'Join here' })
    )

    const longResult = listProjectsPage({
      category: 'airdrop',
      search: 'Summary Long',
      status: 'all',
      cost: 'all',
      deadline: 'all',
      today: TODAY,
      page: 1,
      pageSize: 20
    })
    const fallbackResult = listProjectsPage({
      category: 'airdrop',
      search: 'Summary Fallback',
      status: 'all',
      cost: 'all',
      deadline: 'all',
      today: TODAY,
      page: 1,
      pageSize: 20
    })

    expect(longResult.items[0]?.summary).toHaveLength(300)
    expect(fallbackResult.items[0]?.summary).toBe('Join here')
  })

  it('item danh sách không có notes, howToJoin, sources, socials', () => {
    const result = listProjectsPage({
      category: 'airdrop',
      search: 'Alpha 0',
      status: 'all',
      cost: 'all',
      deadline: 'all',
      today: TODAY,
      page: 1,
      pageSize: 20
    })
    const item = result.items[0]

    expect(item).toBeDefined()
    expect(item).not.toHaveProperty('notes')
    expect(item).not.toHaveProperty('howToJoin')
    expect(item).not.toHaveProperty('sources')
    expect(item).not.toHaveProperty('socials')
  })
})
