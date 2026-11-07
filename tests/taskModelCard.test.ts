import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const COMPONENTS = join(ROOT, 'src', 'renderer', 'src', 'styles', 'components.css')
const CARD = join(ROOT, 'src', 'renderer', 'src', 'common', 'TaskModelCard.tsx')
const NEWS_PAGE = join(ROOT, 'src', 'renderer', 'src', 'features', 'news', 'NewsPage.tsx')
const SCAN_PAGE = join(ROOT, 'src', 'renderer', 'src', 'features', 'scan', 'ScanPage.tsx')
const CHAT_PANEL = join(ROOT, 'src', 'renderer', 'src', 'features', 'chat', 'ChatPanel.tsx')

// CI checkouts may use CRLF (windows runner + autocrlf); normalize so multi-line
// source assertions stay line-ending agnostic.
const readSource = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

describe('Card chọn Model — mở rộng/thu nhỏ', () => {
  const card = readSource(CARD)
  const css = readSource(COMPONENTS)

  it('mặc định thu nhỏ và có nút aria-expanded/aria-controls', () => {
    expect(card).toContain('defaultOpen = false')
    expect(card).toContain('useState(defaultOpen)')
    expect(card).toContain('aria-expanded={open}')
    expect(card).toContain('aria-controls={bodyId}')
    expect(card).toContain('hidden={!open}')
  })

  it('đổi chevron xuống/up theo trạng thái', () => {
    expect(card).toContain("open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'")
    expect(card).toContain("open ? 'Thu gọn' : 'Mở rộng'")
  })

  it('cảnh báo và ghi chú mặc định nằm ngoài vùng bị thu nhỏ để luôn hiển thị', () => {
    expect(card).toContain('{!open && hint ? <p className="muted task-model-card__hint">{hint}</p> : null}')
    expect(card).toContain(
      '<div id={bodyId} className="task-model-card__body" hidden={!open}>\n        {children}\n      </div>\n      {warning ? ('
    )
  })

  it('header giữ tiêu đề bên trái, tóm tắt model bên phải, nút chevron cuối', () => {
    expect(css).toMatch(/\.task-model-card__summary\s*\{[^}]*text-overflow:\s*ellipsis/)
    expect(css).toMatch(/\.task-model-card__summary\s*\{[^}]*white-space:\s*nowrap/)
    expect(css).toMatch(/\.task-model-card__toggle\s*\{[^}]*width:\s*2\.25rem/)
    expect(css).toMatch(/\.task-model-card__toggle\s*\{[^}]*background:\s*var\(--color-surface-raised\)/)
    expect(css).toMatch(/\.task-model-card__toggle:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/)
  })

  it('Provider và Model xếp dọc trong vùng mở rộng', () => {
    expect(css).toMatch(/\.task-model-card__body \.model-picker\s*\{[^}]*flex-direction:\s*column/)
    expect(css).toMatch(/\.task-model-card__body \.model-picker \.listbox\s*\{[^}]*width:\s*100%/)
  })
})

describe('News/Scan dùng card thu gọn, Chat giữ nguyên', () => {
  const news = readSource(NEWS_PAGE)
  const scan = readSource(SCAN_PAGE)
  const chat = readSource(CHAT_PANEL)

  it('News dùng TaskModelCard và vẫn truyền cảnh báo model', () => {
    expect(news).toContain('<TaskModelCard')
    expect(news).toContain('title="Model cho Check News"')
    expect(news).toContain('hint={newsModelHint}')
    expect(news).toContain('warning={newsModelWarning}')
    expect(news).toContain('<ModelPicker')
    expect(news).not.toContain('<div className="card stack ai-task-picker">')
  })

  it('Scan dùng TaskModelCard và vẫn truyền cảnh báo model', () => {
    expect(scan).toContain('<TaskModelCard')
    expect(scan).toContain('title="Model cho Scan Project"')
    expect(scan).toContain('hint={modelPickerHint}')
    expect(scan).toContain('warning={scanModelWarning}')
    expect(scan).toContain('<ModelPicker')
    expect(scan).not.toContain('<div className="card stack ai-task-picker">')
  })

  it('Chat không bị đổi sang card thu gọn', () => {
    expect(chat).toContain('<ModelPicker')
    expect(chat).not.toContain('TaskModelCard')
  })
})
