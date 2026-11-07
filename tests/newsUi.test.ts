import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const NEWS_PAGE = join(ROOT, 'src', 'renderer', 'src', 'features', 'news', 'NewsPage.tsx')
const NEWS_FORM = join(ROOT, 'src', 'renderer', 'src', 'features', 'news', 'NewsFormDialog.tsx')
const COMPONENTS = join(ROOT, 'src', 'renderer', 'src', 'styles', 'components.css')

describe('News UI — tiêu đề emoji và panel cuộn (FIX 1)', () => {
  const source = readFileSync(NEWS_PAGE, 'utf8')
  const css = readFileSync(COMPONENTS, 'utf8')

  it('ba tiêu đề có emoji và aria-hidden', () => {
    expect(source).toContain('<span aria-hidden="true">🔔</span> Tin quan trọng mới')
    expect(source).toContain('<span aria-hidden="true">⏰</span> Deadline sắp hết')
    expect(source).toContain('<span aria-hidden="true">🎯</span> Việc cần làm ngay')
  })

  it('panel chỉ cao tối đa, danh sách bên trong tự cuộn với scrollbar mảnh', () => {
    expect(css).toMatch(/\.news-panel\s*\{[^}]*min-height:\s*0/)
    expect(css).toMatch(/\.news-panel__scroll\s*\{[^}]*max-height:/)
    expect(css).toMatch(/\.news-panel__scroll\s*\{[^}]*overflow-y:\s*auto/)
    expect(css).toMatch(/\.news-panel__scroll\s*\{[^}]*min-height:\s*0/)
    expect(css).toMatch(/\.news-panel__scroll::-webkit-scrollbar\s*\{[^}]*width:\s*var\(--scrollbar-thin-width\)/)
  })

  it('chỉ render một danh sách đã chọn tin, không còn nhóm "Chưa xác minh"', () => {
    expect(source).toContain('selectTopImportantPerProject(important, today)')
    expect(source).not.toContain('news-group-title')
    expect(source).toContain('{topImportant.length} dự án')
    expect(css).not.toContain('.news-group-title')
  })
})

describe('News UI — card một dòng (FIX 1)', () => {
  const source = readFileSync(NEWS_PAGE, 'utf8')
  const css = readFileSync(COMPONENTS, 'utf8')

  it('card nền tối, bo 16–20px, viền mảnh, highlight trên, logo tile gradient', () => {
    expect(css).toMatch(/\.news-card\s*\{[^}]*background:\s*var\(--gradient-news-card\)/)
    expect(css).toMatch(/\.news-card\s*\{[^}]*border:\s*1px solid var\(--color-news-card-border\)/)
    expect(css).toMatch(/\.news-card\s*\{[^}]*border-radius:\s*(1[6-9]|20)px/)
    expect(css).toMatch(/\.news-card\s*\{[^}]*box-shadow:\s*inset 0 1px 0/)
    expect(css).toMatch(/\.news-card__logo\s*\{[^}]*background:\s*var\(--gradient-news-logo\)/)
    expect(css).toMatch(/\.news-card__logo\s*\{[^}]*border-radius:\s*1[4-6]px/)
  })

  it('tên + mô tả một dòng có ellipsis, chữ trắng', () => {
    expect(source).toContain('const summary = oneLine(item.summary, 160)')
    expect(source).toContain('title={`${name} · ${item.summary}`}')
    expect(source).not.toContain('buildHeadline')
    expect(css).toMatch(/\.news-card__text\s*\{[^}]*white-space:\s*nowrap/)
    expect(css).toMatch(/\.news-card__text\s*\{[^}]*text-overflow:\s*ellipsis/)
    expect(css).toMatch(/\.news-card__name\s*\{[^}]*color:\s*var\(--color-text\)/)
    expect(css).toMatch(/\.news-card__text\s*\{[^}]*color:\s*var\(--color-text\)/)
  })

  it('mở bài gốc bằng biểu tượng có aria-label', () => {
    expect(source).toContain('ariaLabel="Mở bài gốc"')
  })
})

describe('News UI — deadline (FIX 1.2)', () => {
  const source = readFileSync(NEWS_PAGE, 'utf8')
  const css = readFileSync(COMPONENTS, 'utf8')

  it('dựng deadline từ project + news qua buildDeadlineRows', () => {
    expect(source).toContain('buildDeadlineRows(')
    expect(source).toContain('...important, ...todos')
    expect(source).toContain('MILESTONE_LABEL[item.kind]')
    expect(source).toContain('formatDmy(item.date)')
  })

  it('badge đỏ cho 14 day, Overdue và Today', () => {
    expect(source).toContain("return 'Overdue'")
    expect(source).toContain("return 'Today'")
    expect(source).toContain('return `${daysRemaining} day`')
    expect(css).toMatch(/\.news-card__badge\s*\{[^}]*border-radius:\s*12px/)
    expect(css).toMatch(/\.news-card__badge\s*\{[^}]*color:\s*var\(--color-error\)/)
  })
})

describe('News UI — việc cần làm (FIX 1.3)', () => {
  const source = readFileSync(NEWS_PAGE, 'utf8')
  const css = readFileSync(COMPONENTS, 'utf8')

  it('checkbox Primary, tên + task một dòng', () => {
    expect(source).toContain('className="news-card__check"')
    expect(css).toMatch(/\.news-card__check\s*\{[^}]*accent-color:\s*var\(--color-primary\)/)
    expect(source).toContain('oneLine(item.summary, 160)')
    expect(css).toMatch(/\.news-card__text--single\s*\{[^}]*color:\s*var\(--color-text\)/)
  })
})

describe('News UI — form thêm/sửa/xóa (FIX 1)', () => {
  const source = readFileSync(NEWS_PAGE, 'utf8')
  const form = readFileSync(NEWS_FORM, 'utf8')

  it('dùng chung một form cho thêm và sửa, validate bằng zod', () => {
    expect(form).toContain('newsManualInputSchema.safeParse(candidate)')
    expect(form).toContain("title={initial ? 'Sửa tin / mốc' : 'Thêm tin / mốc'}")
    expect(source).toContain('<NewsFormDialog')
  })

  it('xóa có xác nhận', () => {
    expect(source).toContain('<ConfirmDialog')
    expect(source).toContain('title="Xóa tin / mốc"')
    expect(source).toContain('window.api.news.remove(deleteTarget.id)')
  })
})
