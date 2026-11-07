import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteLogoFile } = vi.hoisted(() => ({ deleteLogoFile: vi.fn() }))

vi.mock('../src/main/services/logoService', () => ({
  deleteLogoFile,
  captureLogoFromFile: vi.fn(),
  fetchLogoForProject: vi.fn(),
  extractLogoCandidates: vi.fn(),
  resolveLogoAbsolutePath: vi.fn(),
  logoMimeForPath: vi.fn(),
  detectImageType: vi.fn()
}))

import { closeDatabase, openDatabase } from '../src/main/db/connection'
import { getDatabase } from '../src/main/db/connection'
import {
  addProject,
  createProject,
  deleteProjectById,
  getProject,
  importProjects,
  listProjects,
  ProjectError,
  projectToInput,
  setProjectLogo,
  updateProjectById,
  updateProjectWithChanges
} from '../src/main/services/projectService'

openDatabase(':memory:')

beforeEach(() => {
  getDatabase().exec('DELETE FROM projects')
  getDatabase().exec("UPDATE meta SET value = '0' WHERE key = 'next_project_seq'")
  deleteLogoFile.mockClear()
})

afterAll(() => {
  closeDatabase()
})

function baseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: 'airdrop',
    name: 'Alpha Drop',
    website: 'https://alpha.example.com',
    taskSummary: 'Làm nhiệm vụ',
    howToJoin: 'Kết nối ví',
    endDate: '2026-11-20',
    costType: 'free',
    ...overrides
  }
}

describe('projectService create', () => {
  it('adds a project and reads it back', () => {
    const project = createProject(baseInput())

    expect(project.id).toBe('PRJ-001')
    expect(project.name).toBe('Alpha Drop')
    expect(project.nameKey).toBe('alpha drop')
    expect(project.domainKey).toBe('alpha.example.com')
    expect(project.origin).toBe('manual')
    expect(project.rowVersion).toBe(1)
    expect(getProject('PRJ-001')?.taskSummary).toBe('Làm nhiệm vụ')
  })

  it('blocks duplicates by normalized name inside the same category', () => {
    createProject(baseInput())

    expect(() => createProject(baseInput({ name: '  ALPHA   drop ', website: 'https://other.example.com' }))).toThrow(
      ProjectError
    )

    const result = addProject(baseInput({ name: 'Alpha Drop', website: 'https://other.example.com' }), 'scan')
    expect(result.project).toBeNull()
    expect(result.duplicateOf).toBe('PRJ-001')
  })

  it('adds a domain duplicate across categories but reports a warning', () => {
    createProject(baseInput())

    const result = addProject(baseInput({ category: 'event_mmo', name: 'Khác tên' }), 'manual')
    expect(result.project?.id).toBe('PRJ-002')
    expect(result.duplicateOf).toBeNull()
    expect(result.warning).toContain('Trùng domain')
    expect(result.warning).toContain('PRJ-001')
  })

  it('rejects empty names and inverted dates before writing', () => {
    expect(() => createProject(baseInput({ name: '   ', website: 'https://other.example.com' }))).toThrow()
    expect(() => createProject(baseInput({ startDate: '2026-11-10', endDate: '2026-11-01' }))).toThrow()
    expect(listProjects()).toHaveLength(0)
  })

  it('normalises loose input such as "abc.com" and paid without an amount', () => {
    const project = createProject(
      baseInput({ website: 'abc.com', costType: 'paid', costAmountUsd: undefined, startDate: '01/01/2026' })
    )

    expect(project.website).toBe('https://abc.com')
    expect(project.costType).toBe('unverified')
    expect(project.startDate).toBe('2026-01-01')
  })

  it('keeps the amount only for paid projects', () => {
    const project = createProject(baseInput({ costType: 'unverified', costAmountUsd: 25 }))
    expect(project.costAmountUsd).toBeNull()
  })
})

describe('projectService update', () => {
  it('updates fields and bumps the row version', () => {
    const project = createProject(baseInput())

    const updated = updateProjectById(
      project.id,
      baseInput({ name: 'Alpha Drop 2', status: 'in_progress', notes: 'ghi chú' }),
      project.rowVersion
    )

    expect(updated.name).toBe('Alpha Drop 2')
    expect(updated.status).toBe('in_progress')
    expect(updated.rowVersion).toBe(2)
    expect(updated.logoPath).toBeNull()
  })

  it('rejects stale row versions', () => {
    const project = createProject(baseInput())
    updateProjectById(project.id, baseInput({ name: 'Beta' }), project.rowVersion)

    expect(() => updateProjectById(project.id, baseInput({ name: 'Gamma' }), project.rowVersion)).toThrow(
      /đã thay đổi ở nơi khác/
    )
  })

  it('rejects renaming onto another project', () => {
    createProject(baseInput())
    const second = createProject(baseInput({ name: 'Beta', website: 'https://beta.example.com' }))

    expect(() => updateProjectById(second.id, baseInput({ name: 'Alpha Drop', website: 'https://beta.example.com' }))).toThrow(
      /Trùng với dự án/
    )
  })

  it('reports missing projects', () => {
    expect(() => updateProjectById('PRJ-999', baseInput())).toThrow(/Không tìm thấy/)
  })
})

describe('projectService chat update (partial changes)', () => {
  function richInput(): Record<string, unknown> {
    return baseInput({
      socials: { x: 'https://x.com/alpha', discord: 'https://discord.gg/alpha' },
      sources: ['https://alpha.example.com/docs'],
      notes: 'giữ nguyên ghi chú',
      costType: 'paid',
      costAmountUsd: 5,
      status: 'in_progress'
    })
  }

  it('changes only the requested field and keeps the rest', () => {
    const created = createProject(richInput())

    const updated = updateProjectWithChanges(created.id, { website: 'https://new.example.com' }, created.rowVersion)

    expect(updated.website).toBe('https://new.example.com')
    expect(updated.name).toBe(created.name)
    expect(updated.category).toBe(created.category)
    expect(updated.taskSummary).toBe(created.taskSummary)
    expect(updated.howToJoin).toBe(created.howToJoin)
    expect(updated.endDate).toBe(created.endDate)
    expect(updated.costType).toBe('paid')
    expect(updated.costAmountUsd).toBe(5)
    expect(updated.status).toBe('in_progress')
    expect(updated.verification).toBe(created.verification)
    expect(updated.notes).toBe('giữ nguyên ghi chú')
    expect(updated.sources).toEqual(['https://alpha.example.com/docs'])
    expect(updated.socials).toEqual({ x: 'https://x.com/alpha', discord: 'https://discord.gg/alpha' })
  })

  it('merges nested social links instead of dropping the untouched ones', () => {
    const created = createProject(richInput())

    const updated = updateProjectWithChanges(created.id, { socials: { telegram: 'https://t.me/alpha' } }, created.rowVersion)

    expect(updated.socials).toEqual({
      x: 'https://x.com/alpha',
      discord: 'https://discord.gg/alpha',
      telegram: 'https://t.me/alpha'
    })
  })

  it('reports a project deleted before the user pressed OK', () => {
    const created = createProject(richInput())
    deleteProjectById(created.id)

    expect(() => updateProjectWithChanges(created.id, { notes: 'x' }, created.rowVersion)).toThrow(
      /Không tìm thấy dự án cần sửa/
    )
  })

  it('reports a stale row version', () => {
    const created = createProject(richInput())
    updateProjectWithChanges(created.id, { notes: 'lần 1' }, created.rowVersion)

    expect(() => updateProjectWithChanges(created.id, { notes: 'lần 2' }, created.rowVersion)).toThrow(
      /đã thay đổi ở nơi khác/
    )
  })

  it('exposes every editable field through projectToInput', () => {
    const created = createProject(richInput())
    const input = projectToInput(created)

    expect(Object.keys(input).sort()).toEqual(
      [
        'category',
        'costAmountUsd',
        'costType',
        'endDate',
        'howToJoin',
        'name',
        'notes',
        'socials',
        'sources',
        'startDate',
        'status',
        'taskSummary',
        'verification',
        'website'
      ].sort()
    )
  })
})

describe('projectService delete and logo', () => {
  it('deletes the row and its logo file', () => {
    const project = createProject(baseInput())
    const withLogo = setProjectLogo(project.id, 'logos/PRJ-001.png')
    expect(withLogo.logoPath).toBe('logos/PRJ-001.png')

    deleteProjectById(project.id)
    expect(getProject(project.id)).toBeNull()
    expect(deleteLogoFile).toHaveBeenCalledWith('logos/PRJ-001.png')
  })

  it('refuses to delete a missing project', () => {
    expect(() => deleteProjectById('PRJ-404')).toThrow(/Không tìm thấy/)
  })
})

describe('projectService import', () => {
  it('reports added, duplicate and failed items without aborting the batch', () => {
    createProject(baseInput())

    const result = importProjects({
      schemaVersion: '1.0',
      projects: [
        { category: 'airdrop', name: 'Alpha Drop', website: 'https://alpha.example.com' },
        { category: 'airdrop', name: 'Beta', website: 'https://beta.example.com' }
      ]
    })

    expect(result.addedCount).toBe(1)
    expect(result.duplicateCount).toBe(1)
    expect(result.results).toHaveLength(2)
    expect(result.results[0].duplicateOf).toBe('PRJ-001')
    expect(result.results[1].project?.name).toBe('Beta')
    expect(getProject('PRJ-002')?.origin).toBe('import')
  })

  it('adds the valid items and lists the invalid one instead of aborting', () => {
    const result = importProjects({
      schemaVersion: '1.0',
      projects: [
        { category: 'airdrop', name: 'Alpha Drop', website: 'https://alpha.example.com' },
        { category: 'airdrop', name: '   ' }
      ]
    })

    expect(result.addedCount).toBe(1)
    expect(result.failedCount).toBe(1)
    expect(result.results[0].project?.name).toBe('Alpha Drop')
    expect(result.results[1].project).toBeNull()
    expect(result.results[1].error).toMatch(/name/)
    expect(getProject('PRJ-001')?.name).toBe('Alpha Drop')
  })

  it('rejects a payload without any project list', () => {
    expect(() => importProjects({ schemaVersion: '2.0', projects: [] })).toThrow(/Không tìm thấy danh sách dự án/)
    expect(() => importProjects('không phải json')).toThrow(/Không tìm thấy danh sách dự án/)
  })

  it('accepts a bare array, items/data wrappers and ignores schemaVersion', () => {
    const bare = importProjects([{ category: 'Airdrop', name: 'Bare', website: 'bare.example.com' }])
    expect(bare.addedCount).toBe(1)

    const wrapped = importProjects({
      data: [{ type: 'event', title: 'Wrapped', url: 'wrapped.example.com' }]
    })
    expect(wrapped.addedCount).toBe(1)
    expect(wrapped.results[0].project?.category).toBe('event_mmo')
    expect(wrapped.results[0].project?.website).toBe('https://wrapped.example.com')
  })

  it('imports four of five items when one is broken', () => {
    const projects: Array<{ category: string; name: string; website: string }> = [1, 2, 3, 4, 5].map((index) => ({
      category: 'airdrop',
      name: `Drop ${index}`,
      website: `https://drop-${index}.example.com`
    }))
    projects[2] = { category: 'airdrop', name: '', website: 'https://broken.example.com' }

    const result = importProjects({ projects })

    expect(result.addedCount).toBe(4)
    expect(result.failedCount).toBe(1)
    expect(result.results).toHaveLength(5)
    expect(result.results[2].error).toBeTruthy()
  })
})
