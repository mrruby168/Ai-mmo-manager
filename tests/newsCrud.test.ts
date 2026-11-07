import { afterAll, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../src/main/db/connection'
import { insertProject } from '../src/main/db/projectsRepo'
import type { ProjectRecord } from '../src/main/db/projectsRepo'
import { getNewsById, listNews } from '../src/main/db/newsRepo'
import {
  createManualNews,
  deleteManualNews,
  updateManualNews
} from '../src/main/services/newsService'

openDatabase(':memory:')

afterAll(() => {
  closeDatabase()
})

let projectSeq = 0

function addProject(): string {
  projectSeq += 1
  const id = `PRJ-${String(500 + projectSeq).padStart(3, '0')}`
  const record: ProjectRecord = {
    id,
    category: 'airdrop',
    name: `Manual Project ${projectSeq}`,
    nameKey: `manual project ${projectSeq}`,
    domainKey: `manual${projectSeq}.example.com`,
    website: `https://manual${projectSeq}.example.com`,
    socials: {},
    taskSummary: '',
    howToJoin: '',
    startDate: null,
    endDate: null,
    costType: 'free',
    costAmountUsd: null,
    status: 'not_joined',
    verification: 'unverified',
    sources: [],
    logoPath: null,
    notes: '',
    origin: 'manual',
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z'
  }
  insertProject(record)
  return id
}

function importantInput(projectId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId,
    kind: 'important',
    summary: 'Snapshot ngày 20/11',
    verification: 'verified',
    sourceUrl: null,
    sourceName: null,
    date: '2026-11-20',
    milestoneKind: 'snapshot',
    ...overrides
  }
}

function todoInput(projectId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId,
    kind: 'todo',
    summary: 'Kiểm tra ví trước hạn',
    verification: 'unverified',
    sourceUrl: null,
    sourceName: null,
    date: '2026-11-18',
    milestoneKind: null,
    ...overrides
  }
}

const NOW = new Date('2026-11-07T03:00:00.000Z')

describe('news manual CRUD — create (FIX 1)', () => {
  it('tạo tin quan trọng, lưu ngày mốc và nguồn trống', () => {
    const projectId = addProject()
    const created = createManualNews(importantInput(projectId), NOW)

    expect(created.projectId).toBe(projectId)
    expect(created.kind).toBe('important')
    expect(created.summary).toBe('Snapshot ngày 20/11')
    expect(created.milestoneKind).toBe('snapshot')
    expect(created.milestoneDate).toBe('2026-11-20')
    expect(created.publishedAt).toBe('2026-11-20T00:00:00.000Z')
    expect(created.todoDeadline).toBeNull()
    expect(created.sourceUrl).toBe('')
    expect(created.sourceName).toBeNull()
    expect(created.fetchedAt).toBe(NOW.toISOString())
  })

  it('tạo việc cần làm với hạn riêng và không có mốc', () => {
    const projectId = addProject()
    const created = createManualNews(todoInput(projectId), NOW)

    expect(created.kind).toBe('todo')
    expect(created.todoDeadline).toBe('2026-11-18')
    expect(created.publishedAt).toBe('2026-11-18T00:00:00.000Z')
    expect(created.milestoneKind).toBeNull()
    expect(created.milestoneDate).toBeNull()
  })
})

describe('news manual CRUD — one important per project (FIX 1)', () => {
  it('từ chối tin quan trọng thứ hai cùng dự án với thông báo rõ', () => {
    const projectId = addProject()
    createManualNews(importantInput(projectId), NOW)

    expect(() => createManualNews(importantInput(projectId, { summary: 'Tin thứ hai' }), NOW)).toThrow(
      /đã có một tin quan trọng/
    )
  })

  it('vẫn cho phép nhiều todo cùng dự án', () => {
    const projectId = addProject()
    createManualNews(todoInput(projectId), NOW)
    const second = createManualNews(todoInput(projectId, { summary: 'Việc thứ hai', date: '2026-11-19' }), NOW)

    expect(second.kind).toBe('todo')
  })
})

describe('news manual CRUD — update/delete (FIX 1)', () => {
  it('sửa giữ nguyên id và không tự đếm chính nó là tin quan trọng trùng', () => {
    const projectId = addProject()
    const created = createManualNews(importantInput(projectId), NOW)

    const updated = updateManualNews(created.id, importantInput(projectId, {
      summary: 'Đã cập nhật',
      milestoneKind: 'claim',
      date: '2026-11-25'
    }))

    expect(updated.id).toBe(created.id)
    expect(updated.summary).toBe('Đã cập nhật')
    expect(updated.milestoneKind).toBe('claim')
    expect(updated.milestoneDate).toBe('2026-11-25')
  })

  it('xóa tin và báo lỗi khi xóa lại', () => {
    const projectId = addProject()
    const created = createManualNews(todoInput(projectId), NOW)

    expect(deleteManualNews(created.id)).toEqual({ id: created.id })
    expect(getNewsById(created.id)).toBeNull()
    expect(() => deleteManualNews(created.id)).toThrow(/Không tìm thấy tin/)
  })

  it('cập nhật tin không tồn tại báo lỗi', () => {
    expect(() => updateManualNews(999999, todoInput(addProject()))).toThrow(/Không tìm thấy tin/)
  })
})

describe('news manual CRUD — validation (FIX 1)', () => {
  it('chặn dự án không tồn tại', () => {
    expect(() => createManualNews(importantInput('PRJ-9999'), NOW)).toThrow(/không tồn tại/)
  })

  it('chặn summary rỗng, ngày sai định dạng và todo có milestoneKind', () => {
    const projectId = addProject()

    expect(() => createManualNews(importantInput(projectId, { summary: '   ' }), NOW)).toThrow()
    expect(() => createManualNews(importantInput(projectId, { date: '20/11/2026' }), NOW)).toThrow()
    expect(() => createManualNews(todoInput(projectId, { milestoneKind: 'end' }), NOW)).toThrow(/không có loại mốc/)
  })

  it('chặn nguồn trùng cho cùng dự án', () => {
    const projectId = addProject()
    const sourceUrl = 'https://example.com/news/alpha'

    createManualNews(importantInput(projectId, { sourceUrl }), NOW)
    expect(() =>
      createManualNews(todoInput(projectId, { sourceUrl, summary: 'Việc khác' }), NOW)
    ).toThrow(/cùng nguồn/)
  })

  it('không ghi dữ liệu khi validation thất bại', () => {
    const projectId = addProject()
    const before = listNews().length

    expect(() => createManualNews(importantInput(projectId, { date: 'bad' }), NOW)).toThrow()
    expect(listNews().length).toBe(before)
  })
})
