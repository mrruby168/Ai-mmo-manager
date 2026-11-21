import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const THUMB_SIZE = 96

/** Trả về bytes PNG đã thu nhỏ, hoặc null nếu không cần/không thể thu nhỏ. */
export type ThumbResizer = (bytes: Uint8Array, longestSide: number) => Uint8Array | null

let resizer: ThumbResizer | null = null

export function setThumbResizer(next: ThumbResizer | null): void {
  resizer = next
}

export function thumbAbsolutePath(root: string, projectId: string): string {
  return join(root, 'logos', 'thumbs', `${projectId}.png`)
}

export function removeThumb(root: string, projectId: string): void {
  try {
    rmSync(thumbAbsolutePath(root, projectId), { force: true })
  } catch {
    // Dọn thumbnail thất bại không được chặn việc khác.
  }
}

/** Đường dẫn thumbnail hợp lệ, hoặc null (khi đó dùng ảnh gốc). Không bao giờ ném lỗi. */
export function ensureThumb(root: string, projectId: string, originalPath: string): string | null {
  try {
    if (!resizer) {
      return null
    }
    const target = thumbAbsolutePath(root, projectId)
    if (existsSync(target) && statSync(target).mtimeMs >= statSync(originalPath).mtimeMs) {
      return target
    }
    const resized = resizer(readFileSync(originalPath), THUMB_SIZE)
    if (!resized || resized.byteLength === 0) {
      return null
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, resized)
    return target
  } catch {
    return null
  }
}
