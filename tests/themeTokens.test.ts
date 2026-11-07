import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const STYLES = join(ROOT, 'src', 'renderer', 'src', 'styles')
const SRC = join(ROOT, 'src')

function readStyles(name: string): string {
  return readFileSync(join(STYLES, name), 'utf8')
}

function tokenValue(css: string, token: string): string | null {
  const match = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(css)
  return match ? match[1].trim().toLowerCase() : null
}

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...listFiles(full))
    } else {
      files.push(full)
    }
  }
  return files
}

// Màu teal cũ (Soft Royal Blue thay thế ở FIX 7).
const STALE_TEAL = /14b8a6|2dd4bf|0f9f8f|04141a|20,\s?184,\s?166|45,\s?212,\s?191/i

describe('theme tokens (FIX 7)', () => {
  const tokens = readStyles('tokens.css')

  it('dùng bảng màu Soft Royal Blue', () => {
    expect(tokenValue(tokens, '--color-primary')).toBe('#5b8def')
    expect(tokenValue(tokens, '--color-primary-hover')).toBe('#709bf2')
    expect(tokenValue(tokens, '--color-primary-active')).toBe('#4779d0')
    expect(tokenValue(tokens, '--color-on-primary')).toBe('#ffffff')
    expect(tokenValue(tokens, '--color-focus')).toBe('#8cb0ff')
    expect(tokenValue(tokens, '--color-primary-soft')).toBe('rgba(91, 141, 239, 0.16)')
  })

  it('có hai biến ring thay cho màu hard-code', () => {
    expect(tokenValue(tokens, '--color-primary-ring')).toBe('rgba(91, 141, 239, 0.18)')
    expect(tokenValue(tokens, '--color-primary-ring-strong')).toBe('rgba(91, 141, 239, 0.35)')
  })

  it('nút Primary giữ chữ trắng, đậm và tối thiểu 14px', () => {
    const components = readStyles('components.css')
    const block = /\.btn--primary\s*\{([^}]*)\}/.exec(components)?.[1] ?? ''
    expect(block).toMatch(/color:\s*var\(--color-on-primary\)/)
    expect(block).toMatch(/font-weight:\s*600/)
    expect(block).toMatch(/font-size:\s*max\(0\.875rem,\s*14px\)/)
  })

  it('không còn màu teal nào trong src/', () => {
    const offenders = listFiles(SRC)
      .filter((file) => /\.(css|ts|tsx|html)$/.test(file))
      .filter((file) => STALE_TEAL.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(ROOT.length + 1))
    expect(offenders).toEqual([])
  })
})
