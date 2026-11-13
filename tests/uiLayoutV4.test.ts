import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src', 'renderer', 'src')
const COMPONENTS = join(SRC, 'styles', 'components.css')
const PROJECT_ROW = join(SRC, 'features', 'projects', 'ProjectRow.tsx')
const PROJECT_DETAIL = join(SRC, 'features', 'projects', 'ProjectDetailPage.tsx')
const REVENUE_PAGE = join(SRC, 'features', 'revenue', 'RevenuePage.tsx')
const REVENUE_DETAIL = join(SRC, 'features', 'revenue', 'RevenueDetailPage.tsx')

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

describe('U5: Revenue nổi bật số tiền và không ẩn dữ liệu', () => {
  const page = readSource(REVENUE_PAGE)
  const detail = readSource(REVENUE_DETAIL)

  it('màu trạng thái cho đang chờ và chi phí', () => {
    expect(page).toContain('summary-card__value summary-card__value--warning')
    expect(page).toContain('summary-card__value summary-card__value--cost')
    expect(baseCss).toMatch(/\.summary-card__value--warning\s*\{[^}]*color:\s*var\(--color-warning\)/)
    expect(baseCss).toMatch(/\.summary-card__value--cost\s*\{[^}]*color:\s*var\(--color-error\)/)
    expect(baseCss).toMatch(/\.summary-card__value\s*\{[^}]*font-size:\s*1\.5rem/)
  })

  it('hàng doanh thu không ẩn cột khi hẹp', () => {
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*?\.revenue-row\s*\{[^}]*'details details'/)
    const narrow = css.slice(css.indexOf('.revenue-row__details'))
    expect(narrow.slice(0, 200)).not.toContain('display: none')
  })

  it('Revenue Detail đặt lãi thực tế lên đầu, 2 cột, 1 cột dưới 900px', () => {
    expect(detail.indexOf('revenue-detail__profit')).toBeLessThan(detail.indexOf('revenue-detail-grid'))
    expect(css).toMatch(/\.revenue-detail-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/)
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.revenue-detail-grid\s*\{[^}]*grid-template-columns:\s*1fr/)
  })

  it('Tx Hash dài tự xuống dòng', () => {
    expect(detail).toContain('mono revenue-detail__tx')
    expect(baseCss).toMatch(/\.revenue-detail__tx\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })
})
