import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const NEWS_PAGE = join(ROOT, 'src', 'renderer', 'src', 'features', 'news', 'NewsPage.tsx')
const NEWS_FORM = join(ROOT, 'src', 'renderer', 'src', 'features', 'news', 'NewsFormDialog.tsx')
const DEADLINE_VIEW = join(ROOT, 'src', 'shared', 'deadlineView.ts')
const COMPONENTS = join(ROOT, 'src', 'renderer', 'src', 'styles', 'components.css')
const deadlineView = readFileSync(DEADLINE_VIEW, 'utf8')

describe('News UI — tiêu đề emoji và panel cuộn (FIX 1)', () => {
  const source = readFileSync(NEWS_PAGE, 'utf8')
  const css = readFileSync(COMPONENTS, 'utf8')

  it('ba tiêu đề có emoji và aria-hidden', () => {
    expect(source).toContain('<span aria-hidden="true">🔔</span> Tin quan trọng mới')
    expect(source).toContain('<span aria-hidden="true">⏰</span> Deadline sắp hết')
    expect(source).toContain('<span aria-hidden="true">🎯</span> Việc cần làm ngay')
  })

  it('khung card 2×2: đầu card 48px, thân cuộn bên trong', () => {
    expect(css).toMatch(/\.news-card\s*\{[^}]*overflow:\s*hidden/)
    expect(css).toMatch(/\.news-card\s*\{[^}]*min-height:\s*0/)
    expect(css).toMatch(/\.news-card__head\s*\{[^}]*flex:\s*0 0 48px/)
    expect(css).toMatch(/\.news-card__body\s*\{[^}]*overflow-y:\s*auto/)
    expect(css).toMatch(/\.news-card__body\s*\{[^}]*overflow-x:\s*hidden/)
    expect(css).toMatch(/\.news-card__body\s*\{[^}]*min-height:\s*0/)
    expect(css).toMatch(/\.news-card__body::-webkit-scrollbar\s*\{[^}]*width:\s*var\(--scrollbar-thin-width\)/)
  })

  it('chỉ render một danh sách đã chọn tin, không còn nhóm "Chưa xác minh"', () => {
    expect(source).toContain('selectTopImportantPerProject(important, today)')
    expect(source).not.toContain('news-group-title')
    expect(source).toContain('{topImportant.length} dự án')
    expect(css).not.toContain('.news-group-title')
  })
})

describe('News UI — card hai dòng (FIX 1, đổi có chủ đích sang lưới 2×2)', () => {
  const source = readFileSync(NEWS_PAGE, 'utf8')
  const css = readFileSync(COMPONENTS, 'utf8')

  it('card nền tối, bo 14px, viền mảnh, highlight trên, logo tile gradient', () => {
    expect(css).toMatch(/\.news-item\s*\{[^}]*background:\s*var\(--gradient-news-card\)/)
    expect(css).toMatch(/\.news-item\s*\{[^}]*border:\s*1px solid var\(--color-news-card-border\)/)
    expect(css).toMatch(/\.news-item\s*\{[^}]*border-radius:\s*\d+px/)
    expect(css).toMatch(/\.news-item\s*\{[^}]*box-shadow:\s*inset 0 1px 0/)
    expect(css).toMatch(/\.news-item__logo\s*\{[^}]*background:\s*var\(--gradient-news-logo\)/)
    expect(css).toMatch(/\.news-item__logo\s*\{[^}]*border-radius:\s*\d+px/)
  })

  it('tiêu đề một dòng có ellipsis, dòng phụ suy luận, chữ trắng', () => {
    expect(source).toContain('const summary = oneLine(item.summary, 160)')
    expect(source).toContain('title={`${name} · ${item.summary}`}')
    expect(source).not.toContain('buildHeadline')
    expect(css).toMatch(/\.news-item__title\s*\{[^}]*white-space:\s*nowrap/)
    expect(css).toMatch(/\.news-item__title\s*\{[^}]*text-overflow:\s*ellipsis/)
    expect(css).toMatch(/\.news-item__title\s*\{[^}]*color:\s*var\(--color-text\)/)
    expect(css).toMatch(/\.news-item__sub\s*\{[^}]*color:\s*var\(--color-muted\)/)
    expect(css).toMatch(/\.news-item__project\s*\{[^}]*text-overflow:\s*ellipsis/)
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

  it('badge tiếng Việt theo mức khẩn (Quá hạn / Hôm nay / Ngày mai / Còn N ngày)', () => {
    expect(deadlineView).toContain("return 'Quá hạn'")
    expect(deadlineView).toContain("return 'Hôm nay'")
    expect(deadlineView).toContain("return 'Ngày mai'")
    expect(deadlineView).toContain('return `Còn ${days} ngày`')
    expect(css).toMatch(/\.news-item__badge\s*\{[^}]*border-radius:\s*12px/)
    expect(css).toMatch(/\.news-item__badge--error\s*\{[^}]*color:\s*var\(--color-error\)/)
    expect(css).toMatch(/\.news-item__badge--warning\s*\{[^}]*color:\s*var\(--color-warning\)/)
    expect(css).toMatch(/\.news-item__badge--muted\s*\{[^}]*color:\s*var\(--color-muted\)/)
  })
})

describe('News UI — việc cần làm (FIX 1.3)', () => {
  const source = readFileSync(NEWS_PAGE, 'utf8')
  const css = readFileSync(COMPONENTS, 'utf8')

  it('checkbox Primary, tên + task hai dòng', () => {
    expect(source).toContain('className="news-item__check"')
    expect(css).toMatch(/\.news-item__check\s*\{[^}]*accent-color:\s*var\(--color-primary\)/)
    expect(source).toContain('oneLine(item.summary, 160)')
    expect(css).toMatch(/\.news-item__title\s*\{[^}]*color:\s*var\(--color-text\)/)
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
