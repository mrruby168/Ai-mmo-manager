import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const BASE = join(resolve(__dirname, '..'), 'src', 'renderer', 'src', 'styles', 'base.css')

describe('hotfix select toàn cục (FIX 5a)', () => {
  const css = readFileSync(BASE, 'utf8')

  it('bật color-scheme dark cho cả app', () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark/)
  })

  it('đặt màu nền/chữ cho option của mọi select', () => {
    const block = /select option\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(block).toMatch(/background:\s*var\(--color-surface\)/)
    expect(block).toMatch(/color:\s*var\(--color-text\)/)
  })
})
