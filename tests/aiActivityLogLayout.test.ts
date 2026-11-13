import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const COMPONENTS = join(ROOT, 'src', 'renderer', 'src', 'styles', 'components.css')

// CI checkouts may use CRLF (windows runner + autocrlf); normalize so the
// rule extraction below stays line-ending agnostic.
const css = readFileSync(COMPONENTS, 'utf8').replace(/\r\n/g, '\n')

/** Lấy nội dung khai báo của rule đầu tiên khớp đúng selector (bỏ qua rule trong @media). */
function ruleBody(selector: string): string {
  const pattern = new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'u')
  const match = pattern.exec(css)
  return match ? match[1] : ''
}

/** Bỏ khối @media để chỉ xét rule gốc. */
const baseCss = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gu, '')

function baseRuleBody(selector: string): string {
  const pattern = new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'u')
  const match = pattern.exec(baseCss)
  return match ? match[1] : ''
}

describe('Activity Log: khung cố định, log dài thì cuộn bên trong', () => {
  it('khung .ai-log có chiều cao cố định và không co giãn theo nội dung', () => {
    const rule = baseRuleBody('.ai-log')
    expect(rule).not.toBe('')
    // Không được dùng flex co giãn theo nội dung (nguyên nhân card bị giãn khi chạy).
    expect(rule).not.toContain('flex: 1 1 auto')
    expect(rule).toContain('flex: 0 0 auto')
    expect(rule).toMatch(/\bheight:\s*\d+px/u)
    expect(rule).toContain('max-height: clamp(')
    expect(rule).toContain('min-height:')
    expect(rule).toContain('overflow: hidden')
  })

  it('thân log co giãn trong khung cố định và tự cuộn', () => {
    const rule = baseRuleBody('.ai-log__body')
    expect(rule).toContain('flex: 1 1 0')
    expect(rule).toContain('min-height: 0')
    expect(rule).toContain('overflow-y: auto')
    expect(rule).toContain('overscroll-behavior: contain')
    expect(rule).toContain('scrollbar-gutter: stable')
  })

  it('thân log có thanh cuộn mảnh, đầu và chân khung không bị bóp', () => {
    expect(css).toContain('.ai-log__body::-webkit-scrollbar {')
    expect(css).toContain('.ai-log__body::-webkit-scrollbar-thumb {')
    expect(css).toContain('.ai-log__body::-webkit-scrollbar-track {')
    expect(baseRuleBody('.ai-log__head')).toContain('flex: 0 0 auto')
    expect(baseRuleBody('.ai-log__foot')).toContain('flex: 0 0 auto')
  })

  it('cửa sổ hẹp dùng chiều cao nhỏ hơn nhưng vẫn cố định', () => {
    const media = /@media \(max-width: 1100px\) \{\s*\.ai-log \{([^}]*)\}/u.exec(css)
    expect(media).not.toBeNull()
    expect(media![1]).toMatch(/\bheight:\s*\d+px/u)
    expect(media![1]).toContain('max-height: clamp(')
  })

  it('component giữ nguyên hành vi tự cuộn xuống cuối khi có dòng mới', () => {
    const component = readFileSync(
      join(ROOT, 'src', 'renderer', 'src', 'common', 'AiActivityLog.tsx'),
      'utf8'
    ).replace(/\r\n/g, '\n')
    expect(component).toContain('className="ai-log__body"')
    expect(component).toContain('body.scrollTop = body.scrollHeight')
    expect(component).toContain('onScroll={handleScroll}')
    // Chỉ giữ 200 dòng gần nhất để khung không phình theo thời gian.
    expect(component).toContain('.slice(-200)')
  })

  it('helper ruleBody vẫn hoạt động (chống test tự trượt)', () => {
    expect(ruleBody('.ai-log').length).toBeGreaterThan(0)
    expect(ruleBody('.khong-ton-tai')).toBe('')
  })
})
