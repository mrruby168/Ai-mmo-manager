import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')

const SRC = 'src/renderer/src'

describe('v0.1.8: Settings cố định thanh tab, card AI Mode gọn', () => {
  const page = read(`${SRC}/features/settings/SettingsPage.tsx`)
  const mode = read(`${SRC}/features/settings/AiModePanel.tsx`)
  const shell = read(`${SRC}/layout/AppShell.tsx`)
  const css = read(`${SRC}/styles/components.css`)

  it('đã bỏ phụ đề Settings và đoạn chú thích AI Mode', () => {
    expect(page).not.toContain('Provider AI, model dự phòng')
    expect(page).not.toContain('page-header__subtitle')
    expect(mode).not.toContain('main process không gọi AI')
    expect(mode).toContain('ai-mode-bar')
  })

  it('SettingsPage: head cố định, body cuộn, key theo tab con', () => {
    expect(page).toContain('settings-page__head')
    expect(page).toContain('settings-page__body')
    expect(page).toContain('key={section}')
    expect(page).toContain('settings-panel--${section}')
  })

  it('AppShell dùng khung fit cho event_mmo, airdrop và settings', () => {
    expect(shell).toMatch(/fitPage\s*=[^\n]*event_mmo[^\n]*airdrop[^\n]*settings/)
  })

  it('CSS: body Settings cuộn, head không co, card không bị ép co', () => {
    expect(css).toMatch(/\.settings-page__body\s*\{[^}]*overflow-y:\s*auto/)
    expect(css).toMatch(/\.settings-page__head\s*\{[^}]*flex:\s*0 0 auto/)
    expect(css).toMatch(/\.settings-page__body > \*\s*\{[^}]*flex:\s*0 0 auto/)
  })

  it('CSS: AI đang chạy vẫn cuộn được vùng danh sách / Settings nhưng không bấm được', () => {
    expect(css).toMatch(/\.app--locked \.project-page__list,\s*\.app--locked \.settings-page__body\s*\{[^}]*pointer-events:\s*auto/)
    expect(css).toMatch(/\.app--locked \.project-page__list > \*,\s*\.app--locked \.settings-page__body > \*\s*\{[^}]*pointer-events:\s*none/)
  })
})

describe('v0.1.8: animation nhẹ (motion.css)', () => {
  const motion = read(`${SRC}/styles/motion.css`)
  const main = read(`${SRC}/main.tsx`)
  const toast = read(`${SRC}/state/ToastContext.tsx`)

  it('main.tsx import motion.css sau components.css', () => {
    const components = main.indexOf("import './styles/components.css'")
    const motionImport = main.indexOf("import './styles/motion.css'")
    expect(components).toBeGreaterThan(-1)
    expect(motionImport).toBeGreaterThan(components)
  })

  it('token thời lượng 150-200 ms', () => {
    expect(motion).toContain('--motion-fast: 150ms')
    expect(motion).toContain('--motion-base: 200ms')
  })

  it('hỗ trợ prefers-reduced-motion', () => {
    expect(motion).toContain('@media (prefers-reduced-motion: reduce)')
    expect(motion).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none\s*!important/)
  })

  it('chỉ có đúng 1 animation vô hạn (chat-busy), không áp cho bảng / dòng / Log', () => {
    expect(motion.match(/infinite/g)?.length).toBe(1)
    expect(motion).not.toMatch(/\.(project-row|ai-log__line|ai-log__body|table)\b[^{]*\{[^}]*animation/)
  })

  it('animation trang không áp cho chat và modal', () => {
    expect(motion).toContain(':not(.chat-fab):not(.chat-panel):not(.modal-overlay)')
  })

  it('toast tự mờ đúng lúc: 4300ms + 200ms = TOAST_DURATION_MS', () => {
    expect(toast).toContain('TOAST_DURATION_MS = 4_500')
    expect(motion).toContain('ui-toast-out 200ms ease-in 4300ms forwards')
  })

  it('không thêm thư viện animation', () => {
    const pkg = read('package.json')
    expect(pkg).not.toMatch(/framer-motion|react-spring|gsap|animejs|motion"/)
  })
})

describe('v0.1.8 (bổ sung): card Chế độ hoạt động cố định', () => {
  const page = read(`${SRC}/features/settings/SettingsPage.tsx`)
  const css = read(`${SRC}/styles/components.css`)

  it('AiModePanel nằm trong settings-page__head (cố định), không nằm trong settings-page__body', () => {
    const headStart = page.indexOf('settings-page__head')
    const bodyStart = page.indexOf('settings-page__body')
    expect(headStart).toBeGreaterThan(-1)
    expect(bodyStart).toBeGreaterThan(headStart)
    expect(page.slice(headStart, bodyStart)).toContain('<AiModePanel')
    expect(page.slice(bodyStart)).not.toContain('<AiModePanel')
    expect(css).toMatch(/\.settings-page__head > \.ai-mode-bar\s*\{[^}]*margin-bottom/)
  })
})

describe('v0.1.8 (chốt): AI Settings 2 cột Provider | Custom', () => {
  const panel = read(`${SRC}/features/settings/AiSettingsPanel.tsx`)
  const css = read(`${SRC}/styles/components.css`)

  it('tách Provider và Custom thành 2 card để lưới 2 cột hoạt động', () => {
    expect(panel.match(/<section className="card stack">/g)?.length).toBe(2)
    const provider = panel.indexOf('<h2>Provider</h2>')
    const custom = panel.indexOf('<h2>Custom</h2>')
    const split = panel.indexOf('</section>', provider)
    expect(provider).toBeGreaterThan(-1)
    expect(split).toBeGreaterThan(provider)
    expect(split).toBeLessThan(custom)
  })

  it('CSS căn hàng: tiêu đề hai card cao bằng nhau, nút không xuống dòng', () => {
    expect(css).toMatch(/\.settings-panel--ai \.section-title\s*\{[^}]*min-height:\s*2\.25rem/)
    expect(css).toMatch(/\.settings-panel--ai \.settings-provider \.btn\s*\{[^}]*white-space:\s*nowrap/)
  })
})
