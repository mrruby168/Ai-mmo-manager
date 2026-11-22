import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')

describe('layout trang danh sách dự án (fix scroll)', () => {
  it('base.css khoá cuộn document và tạo containing block cho .app-content', () => {
    const css = read('src/renderer/src/styles/base.css')
    expect(css).toMatch(/html,\s*body\s*\{[^}]*overflow:\s*hidden/)
    const appContent = /^\.app-content\s*\{([^}]*)\}/m.exec(css)
    expect(appContent).not.toBeNull()
    expect(appContent?.[1]).toContain('position: relative')
  })

  it('components.css có khung trang dự án và vùng danh sách cuộn', () => {
    const css = read('src/renderer/src/styles/components.css')
    expect(css).toContain('.app-content--fit')
    expect(css).toContain('.project-page__list')
    expect(css).toContain('overflow-y: auto')
    expect(css).toContain('.project-page__footer')
  })

  it('AppShell bật chế độ fit cho tab danh sách dự án', () => {
    const shell = read('src/renderer/src/layout/AppShell.tsx')
    expect(shell).toContain('app-content--fit')
    expect(shell).toMatch(/fitPage\s*=[^\n]*event_mmo[^\n]*airdrop/)
  })

  it('ProjectListPage dùng khung cuộn riêng và không cuộn document', () => {
    const page = read('src/renderer/src/features/projects/ProjectListPage.tsx')
    expect(page).toContain('project-page__footer')
    expect(page).toContain('listRef')
    expect(page).not.toContain('scrollIntoView')
  })
})
