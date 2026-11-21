import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')

describe('phân trang danh sách dự án (P4)', () => {
  it('ProjectListPage dùng API phân trang và bỏ lọc phía renderer', () => {
    const page = read('src/renderer/src/features/projects/ProjectListPage.tsx')
    expect(page).toContain('window.api.projects.listPage')
    expect(page).toContain('<Pagination')
    expect(page).toContain('SEARCH_DEBOUNCE_MS')
    expect(page).not.toContain('applyProjectFilters')
    expect(page).not.toContain('projects.list(')
  })

  it('mỗi tab có một phiên bản ProjectListPage riêng', () => {
    const app = read('src/renderer/src/App.tsx')
    expect(app).toContain('key="airdrop"')
    expect(app).toContain('key="event_mmo"')
  })
})
