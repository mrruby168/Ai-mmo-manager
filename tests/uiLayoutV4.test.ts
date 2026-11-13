import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src', 'renderer', 'src')
const COMPONENTS = join(SRC, 'styles', 'components.css')
const PROJECT_ROW = join(SRC, 'features', 'projects', 'ProjectRow.tsx')
const PROJECT_DETAIL = join(SRC, 'features', 'projects', 'ProjectDetailPage.tsx')

// CI checkouts may use CRLF; normalize so multi-line assertions stay stable.
const readSource = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

const css = readSource(COMPONENTS)

/** Bỏ khối @media để chỉ xét rule gốc. */
const baseCss = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gu, '')

describe('U3: hàng dự án không ẩn dữ liệu khi cửa sổ hẹp', () => {
  const row = readSource(PROJECT_ROW)

  it('hàng dự án dùng grid-area cho 2 hàng', () => {
    expect(baseCss).toMatch(/\.project-row\s*\{[^}]*grid-template-areas:/)
    expect(baseCss).toMatch(/\.project-row__identity\s*\{[^}]*grid-area:\s*id/)
    expect(baseCss).toMatch(/\.project-row__task\s*\{[^}]*grid-area:\s*task/)
    expect(baseCss).toMatch(/\.project-row__deadline\s*\{[^}]*grid-area:\s*dl/)
    expect(baseCss).toMatch(/\.project-row__status\s*\{[^}]*grid-area:\s*st/)
    expect(baseCss).toMatch(/\.project-row__cost\s*\{[^}]*grid-area:\s*cost/)
  })

  it('media query 1100px không còn display: none', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 1100px)'))
    const block = narrow.slice(0, narrow.indexOf('}\n\n') + 2)
    expect(block).not.toContain('display: none')
    expect(block).toContain("'task task cost'")
  })

  it('chi phí căn phải và dùng số đều', () => {
    expect(baseCss).toMatch(/\.project-row__cost\s*\{[^}]*font-variant-numeric:\s*tabular-nums/)
    expect(baseCss).toMatch(/\.project-row__cost\s*\{[^}]*text-align:\s*right/)
  })

  it('hàng dự án cao 4.75rem và tên/mô tả tối đa 2 dòng', () => {
    expect(baseCss).toMatch(/\.project-row\s*\{[^}]*min-height:\s*4\.75rem/)
    expect(row).toContain('project-row__name text-clamp-2')
    expect(row).toContain('project-row__task text-clamp-2')
    expect(row).toContain('project-row__status')
  })
})

describe('U4: Project Detail chia vùng và cuộn nội dung dài', () => {
  const detail = readSource(PROJECT_DETAIL)

  it('dùng lưới project-detail với 4 vùng', () => {
    expect(detail).toContain('className="project-detail"')
    expect(detail).toContain('project-detail__info')
    expect(detail).toContain('project-detail__tasks')
    expect(detail).toContain('project-detail__notes')
    expect(baseCss).toMatch(/\.project-detail\s*\{[^}]*display:\s*grid/)
    expect(css).toMatch(/@media \(min-width: 1100px\)[\s\S]*?\.project-detail\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/)
  })

  it('nhiệm vụ và ghi chú cuộn riêng, URL dài xuống dòng', () => {
    expect(baseCss).toMatch(/\.project-detail__text\s*\{[^}]*max-height:\s*18rem/)
    expect(baseCss).toMatch(/\.project-detail__text\s*\{[^}]*overflow-y:\s*auto/)
    expect(baseCss).toMatch(/\.project-detail__text\s*\{[^}]*overflow-wrap:\s*anywhere/)
    expect(baseCss).toMatch(/\.project-detail__notes-input\s*\{[^}]*max-height:\s*18rem/)
  })

  it('trạng thái nằm trong vùng thông tin dự án', () => {
    const infoStart = detail.indexOf('project-detail__info')
    const tasksStart = detail.indexOf('project-detail__tasks')
    expect(detail.indexOf('aria-label="Trạng thái dự án"')).toBeGreaterThan(infoStart)
    expect(detail.indexOf('aria-label="Trạng thái dự án"')).toBeLessThan(tasksStart)
  })
})
