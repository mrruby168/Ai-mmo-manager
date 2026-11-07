import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const NEWS_PAGE = join(ROOT, 'src', 'renderer', 'src', 'features', 'news', 'NewsPage.tsx')
const COMPONENTS = join(ROOT, 'src', 'renderer', 'src', 'styles', 'components.css')

describe('News UI — một dòng mỗi dự án (FIX 1.1)', () => {
  const source = readFileSync(NEWS_PAGE, 'utf8')
  const css = readFileSync(COMPONENTS, 'utf8')

  it('chỉ render một danh sách đã chọn tin, không còn nhóm "Chưa xác minh"', () => {
    expect(source).toContain('selectTopImportantPerProject(important, today)')
    expect(source).not.toContain('news-group-title')
    expect(source).toContain('{topImportant.length} dự án')
    expect(css).not.toContain('.news-group-title')
  })

  it('headline một dòng có ellipsis và title đầy đủ', () => {
    expect(source).toContain('buildHeadline(item)')
    expect(source).toContain('className="news-row__headline"')
    expect(source).toContain('title={`${headline} · ${item.summary}`}')
    expect(css).toMatch(/\.news-row__headline\s*\{[^}]*white-space:\s*nowrap/)
    expect(css).toMatch(/\.news-row__headline\s*\{[^}]*text-overflow:\s*ellipsis/)
  })

  it('mở bài gốc bằng biểu tượng có aria-label', () => {
    expect(source).toContain('ariaLabel="Mở bài gốc"')
  })
})

describe('News UI — deadline gộp mốc (FIX 1.2)', () => {
  const source = readFileSync(NEWS_PAGE, 'utf8')

  it('dựng deadline từ project + news qua buildDeadlineRows', () => {
    expect(source).toContain('buildDeadlineRows(')
    expect(source).toContain('...important, ...todos')
    expect(source).toContain('MILESTONE_LABEL[item.kind]')
    expect(source).toContain('formatDmy(item.date)')
  })
})

describe('News UI — việc cần làm một dòng (FIX 1.3)', () => {
  const source = readFileSync(NEWS_PAGE, 'utf8')
  const css = readFileSync(COMPONENTS, 'utf8')

  it('lưới auto 1fr auto, summary một dòng có ellipsis', () => {
    expect(css).toMatch(/\.todo-item\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/)
    expect(css).toMatch(/\.todo-item__summary\s*\{[^}]*white-space:\s*nowrap/)
    expect(css).toMatch(/\.todo-item__summary\s*\{[^}]*text-overflow:\s*ellipsis/)
    expect(source).toContain('oneLine(item.summary, 160)')
    expect(source).toContain('todo-item__deadline')
  })
})
