import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureThumb, removeThumb, setThumbResizer, THUMB_SIZE, thumbAbsolutePath } from '../src/main/services/logoThumb'

let roots: string[] = []

function makeRoot(): { root: string; original: string } {
  const root = mkdtempSync(join(tmpdir(), 'mmo-thumb-'))
  roots.push(root)
  mkdirSync(join(root, 'logos'), { recursive: true })
  const original = join(root, 'logos', 'PRJ-001.png')
  writeFileSync(original, new Uint8Array([9, 9, 9]))
  return { root, original }
}

afterEach(() => {
  setThumbResizer(null)
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true })
  }
  roots = []
})

describe('logoThumb', () => {
  it('trả null khi chưa gắn bộ thu nhỏ', () => {
    const { root, original } = makeRoot()
    expect(ensureThumb(root, 'PRJ-001', original)).toBeNull()
  })

  it('tạo thumbnail đúng thư mục và nội dung', () => {
    const { root, original } = makeRoot()
    let receivedSide = 0
    setThumbResizer((bytes, longestSide) => {
      receivedSide = longestSide
      expect(bytes.byteLength).toBe(3)
      return new Uint8Array([1, 2, 3])
    })

    const result = ensureThumb(root, 'PRJ-001', original)

    expect(result).toBe(thumbAbsolutePath(root, 'PRJ-001'))
    expect(receivedSide).toBe(THUMB_SIZE)
    expect(existsSync(result as string)).toBe(true)
    expect([...readFileSync(result as string)]).toEqual([1, 2, 3])
  })

  it('không gọi lại bộ thu nhỏ khi thumbnail còn mới', () => {
    const { root, original } = makeRoot()
    let calls = 0
    setThumbResizer(() => {
      calls += 1
      return new Uint8Array([1, 2, 3])
    })

    expect(ensureThumb(root, 'PRJ-001', original)).not.toBeNull()
    expect(ensureThumb(root, 'PRJ-001', original)).not.toBeNull()
    expect(calls).toBe(1)
  })

  it('tạo lại khi ảnh gốc mới hơn thumbnail', () => {
    const { root, original } = makeRoot()
    let calls = 0
    setThumbResizer(() => {
      calls += 1
      return new Uint8Array([calls])
    })

    expect(ensureThumb(root, 'PRJ-001', original)).not.toBeNull()
    const future = new Date(Date.now() + 5_000)
    utimesSync(original, future, future)

    expect(ensureThumb(root, 'PRJ-001', original)).not.toBeNull()
    expect(calls).toBe(2)
  })

  it('trả null khi bộ thu nhỏ trả null', () => {
    const { root, original } = makeRoot()
    setThumbResizer(() => null)
    expect(ensureThumb(root, 'PRJ-001', original)).toBeNull()
    expect(existsSync(thumbAbsolutePath(root, 'PRJ-001'))).toBe(false)
  })

  it('trả null khi bộ thu nhỏ ném lỗi', () => {
    const { root, original } = makeRoot()
    setThumbResizer(() => {
      throw new Error('boom')
    })
    expect(() => ensureThumb(root, 'PRJ-001', original)).not.toThrow()
    expect(ensureThumb(root, 'PRJ-001', original)).toBeNull()
  })

  it('removeThumb xoá file và gọi lần hai không lỗi', () => {
    const { root, original } = makeRoot()
    setThumbResizer(() => new Uint8Array([1, 2, 3]))
    const target = ensureThumb(root, 'PRJ-001', original)
    expect(target).not.toBeNull()

    removeThumb(root, 'PRJ-001')
    expect(existsSync(target as string)).toBe(false)
    expect(() => removeThumb(root, 'PRJ-001')).not.toThrow()
  })
})
