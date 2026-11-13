import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const COMPONENTS = join(ROOT, 'src', 'renderer', 'src', 'styles', 'components.css')

// CI checkouts may use CRLF; normalize so rule extraction stays line-ending agnostic.
const css = readFileSync(COMPONENTS, 'utf8').replace(/\r\n/g, '\n')

/** Bỏ các khối @media để chỉ xét rule gốc. */
const baseCss = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gu, '')

function ruleBody(source: string, selector: string): string {
  const pattern = new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'u')
  const match = pattern.exec(source)
  return match ? match[1] : ''
}

function mediaBlock(source: string, query: string): string {
  const marker = `@media (${query}) {`
  let index = 0
  const chunks: string[] = []
  for (;;) {
    const start = source.indexOf(marker, index)
    if (start < 0) {
      break
    }
    const rest = source.slice(start)
    const next = rest.indexOf('@media', marker.length)
    chunks.push(next < 0 ? rest : rest.slice(0, next))
    index = start + marker.length
  }
  return chunks.join('\n')
}

describe('News: lưới 2×2 cố định, khung card dùng chung', () => {
  it('.news-board là grid 2 cột × 2 hàng minmax(0, 1fr), không auto rows', () => {
    const rule = ruleBody(baseCss, '.news-board')
    expect(rule).not.toBe('')
    expect((rule.match(/repeat\(2, minmax\(0, 1fr\)\)/g) ?? []).length).toBe(2)
    expect(rule).toContain('gap: var(--space-4)')
    expect(rule).not.toMatch(/grid-template-rows:\s*auto/u)
    expect(rule).toMatch(/min-height:\s*\d+px/u)
  })

  it('.news-card là khung card chung: flex cột, overflow hidden, min-height 0', () => {
    const rule = ruleBody(baseCss, '.news-card')
    expect(rule).toContain('display: flex')
    expect(rule).toContain('flex-direction: column')
    expect(rule).toContain('overflow: hidden')
    expect(rule).toContain('min-height: 0')
    expect(rule).toContain('min-width: 0')
  })

  it('đầu card không wrap, thân card cuộn dọc, không cuộn ngang', () => {
    const head = ruleBody(baseCss, '.news-card__head')
    expect(head).toContain('flex: 0 0 48px')
    expect(ruleBody(baseCss, '.news-card__head-end')).toContain('white-space: nowrap')
    const title = ruleBody(baseCss, '.news-card__head h2')
    expect(title).toContain('white-space: nowrap')
    expect(title).toContain('text-overflow: ellipsis')
    const body = ruleBody(baseCss, '.news-card__body')
    expect(body).toContain('overflow-y: auto')
    expect(body).toContain('overflow-x: hidden')
    expect(body).toContain('scrollbar-gutter: stable')
    expect(body).toContain('min-height: 0')
  })

  it('màn hình hẹp ≤900px: một cột, mỗi card đúng 320px, không cuộn ngang', () => {
    const media = mediaBlock(css, 'max-width: 900px')
    expect(media).toContain('.news-board')
    expect(media).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(media).toContain('grid-auto-rows: 320px')
    expect(media).toContain('grid-template-rows: none')
  })

  it('ô log có lớp phủ fullscreen và lớp làm mờ nền', () => {
    expect(css).toContain('.news-log--fullscreen')
    expect(css).toContain('.news-log-backdrop')
    expect(css).toContain('.ai-log--card')
    expect(css).toContain('.news-log-slot')
  })
})
