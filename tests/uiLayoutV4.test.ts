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
const SETTINGS_PAGE = join(SRC, 'features', 'settings', 'SettingsPage.tsx')
const AI_MODE_PANEL = join(SRC, 'features', 'settings', 'AiModePanel.tsx')
const CHAT_PANEL = join(SRC, 'features', 'chat', 'ChatPanel.tsx')

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

describe('U6: Settings tab một hàng và nội dung 2 cột', () => {
  const page = readSource(SETTINGS_PAGE)
  const mode = readSource(AI_MODE_PANEL)

  it('giữ đủ 6 tab, không đổi tên', () => {
    expect(page.match(/id: '/g)?.length).toBe(6)
    expect(page).toContain("label: 'Model Configuration'")
  })

  it('tab không xuống hàng, cuộn ngang khi hẹp', () => {
    expect(baseCss).toMatch(/\.settings-tabs\s*\{[^}]*overflow-x:\s*auto/)
    expect(baseCss).toMatch(/\.settings-tabs \.segmented\s*\{[^}]*flex-wrap:\s*nowrap/)
    expect(baseCss).toMatch(/\.settings-tabs \.segmented__item\s*\{[^}]*white-space:\s*nowrap/)
  })

  it('nội dung 2 cột khi ≥1100px, Model Configuration full chiều rộng', () => {
    expect(page).toContain('settings-panel--${section}')
    expect(css).toMatch(/@media \(min-width: 1100px\)[\s\S]*?\.settings-panel > \.stack\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
    expect(css).toMatch(/\.settings-panel--models > \.stack\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/)
  })

  it('thanh AI Mode gọn hơn', () => {
    expect(mode).toContain('ai-mode-bar')
    expect(baseCss).toMatch(/\.ai-mode-bar\s*\{[^}]*padding:\s*var\(--space-3\) var\(--space-4\)/)
  })
})

describe('U7: Chat, Sidebar và Dialog', () => {
  const chat = readSource(CHAT_PANEL)

  it('Chat giữ 84vh, vùng tin nhắn cuộn riêng, thanh nhập ở cuối', () => {
    expect(baseCss).toMatch(/\.chat-panel\s*\{[^}]*height:\s*84vh/)
    expect(baseCss).toMatch(/\.chat-messages\s*\{[^}]*overflow-y:\s*auto/)
    expect(baseCss).toMatch(/\.chat-composer\s*\{[^}]*flex:\s*0 0 auto/)
  })

  it('PendingAction: nút xác nhận luôn thấy, JSON dài tự xuống dòng', () => {
    expect(chat).toContain('pending-action__buttons')
    expect(baseCss).toMatch(/\.pending-action__buttons\s*\{[^}]*position:\s*sticky/)
    expect(baseCss).toMatch(/\.pending-action__block\s*\{[^}]*max-height:\s*9rem/)
    expect(baseCss).toMatch(/\.pending-action__block\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })

  it('Sidebar active rõ hơn nhưng vẫn 48px và icon 20px', () => {
    expect(baseCss).toMatch(/\.sidebar__item\s*\{[^}]*height:\s*3rem/)
    expect(baseCss).toMatch(/\.sidebar__icon\s*\{[^}]*width:\s*1\.25rem/)
    expect(baseCss).toMatch(/\.sidebar__item--active\s*\{[^}]*background:\s*var\(--color-primary-soft\)/)
  })

  it('Dialog giữ header/footer cố định, thân cuộn', () => {
    expect(baseCss).toMatch(/\.modal\s*\{[^}]*width:\s*min\(44rem, 100%\)/)
    expect(baseCss).toMatch(/\.modal__header\s*\{[^}]*flex:\s*0 0 auto/)
    expect(baseCss).toMatch(/\.modal__footer\s*\{[^}]*flex:\s*0 0 auto/)
    expect(baseCss).toMatch(/\.modal__body\s*\{[^}]*min-height:\s*0/)
  })
})
