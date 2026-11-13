import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src', 'renderer', 'src')
const COMPONENTS = join(SRC, 'styles', 'components.css')
const PROJECT_ROW = join(SRC, 'features', 'projects', 'ProjectRow.tsx')

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
