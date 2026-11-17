import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_MODE, isThemeMode, readThemeMode, resolveTheme } from '../src/renderer/src/state/theme'

const STYLES = join(resolve(__dirname, '..'), 'src', 'renderer', 'src', 'styles')
const tokens = readFileSync(join(STYLES, 'tokens.css'), 'utf8').replace(/\r\n/g, '\n')

function names(block: string): Set<string> {
  return new Set([...block.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
}

describe('v0.1.5: theme sáng/tối', () => {
  it('resolveTheme: system theo hệ điều hành, dark/light giữ nguyên', () => {
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })

  it('mặc định Tối, giá trị lạ bị loại, không có localStorage vẫn không lỗi', () => {
    expect(DEFAULT_THEME_MODE).toBe('dark')
    expect(isThemeMode('light')).toBe(true)
    expect(isThemeMode('blue')).toBe(false)
    expect(readThemeMode()).toBe('dark')
  })

  it('khối theme sáng ghi đè đủ token bề mặt/chữ/viền, không đụng Primary', () => {
    const rootEnd = tokens.indexOf(":root[data-theme='light']")
    expect(rootEnd).toBeGreaterThan(0)
    const darkBlock = tokens.slice(0, rootEnd)
    const lightBlock = tokens.slice(rootEnd)
    const light = names(lightBlock)
    for (const token of [
      '--color-background',
      '--color-surface',
      '--color-surface-raised',
      '--color-text',
      '--color-muted',
      '--color-border',
      '--color-popup-bg',
      '--chat-panel-bg',
      '--chat-text',
      '--gradient-app-bg',
      '--gradient-news-card'
    ]) {
      expect(light.has(token), token).toBe(true)
    }
    for (const token of ['--color-primary', '--color-primary-hover', '--color-primary-active', '--color-on-primary']) {
      expect(light.has(token), token).toBe(false)
    }
    expect(names(darkBlock).has('--color-primary-text')).toBe(true)
    expect(lightBlock).toContain('color-scheme: light')
  })

  it('base.css vẫn giữ color-scheme dark mặc định', () => {
    const base = readFileSync(join(STYLES, 'base.css'), 'utf8')
    expect(base).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark/)
  })
})
