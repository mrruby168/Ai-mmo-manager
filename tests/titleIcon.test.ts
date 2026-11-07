import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const ORIGINAL = join(ROOT, 'readtofix', 'new_icon.svg')
const COPY = join(ROOT, 'src', 'renderer', 'src', 'assets', 'new-icon.svg')
const SIDEBAR = join(ROOT, 'src', 'renderer', 'src', 'layout', 'Sidebar.tsx')
const COMPONENTS = join(ROOT, 'src', 'renderer', 'src', 'styles', 'components.css')

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('title icon (FIX 6)', () => {
  it('sao chép nguyên bản new_icon.svg (cùng hash)', () => {
    expect(sha256(COPY)).toBe(sha256(ORIGINAL))
    expect(readFileSync(COPY)).toEqual(readFileSync(ORIGINAL))
  })

  it('Sidebar dùng ảnh thay cho chữ M', () => {
    const source = readFileSync(SIDEBAR, 'utf8')
    expect(source).toContain("from '../assets/new-icon.svg'")
    expect(source).toContain('width={28}')
    expect(source).toContain('height={28}')
    expect(source).toContain('alt=""')
    expect(source).toContain('MMO Manager')
    expect(source).not.toMatch(/brand-mark[^>]*>\s*M\s*</)
  })

  it('.sidebar__brand-mark không còn nền/màu/chữ để tránh hai lớp', () => {
    const css = readFileSync(COMPONENTS, 'utf8')
    const block = /\.sidebar__brand-mark\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(block).not.toMatch(/background/)
    expect(block).not.toMatch(/color:/)
    expect(block).not.toMatch(/font-size/)
    expect(block).not.toMatch(/font-weight/)
    expect(block).not.toMatch(/border-radius/)
  })
})
