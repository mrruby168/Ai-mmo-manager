import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canImportNews } from '../src/shared/newsAccess'

const ROOT = resolve(__dirname, '..')
const NEWS_PAGE = join(ROOT, 'src', 'renderer', 'src', 'features', 'news', 'NewsPage.tsx')

describe('Import News theo AI Mode (FIX 2)', () => {
  it('chỉ hiện ở No AI Mode', () => {
    expect(canImportNews(false)).toBe(true)
    expect(canImportNews(true)).toBe(false)
  })

  it('NewsPage ẩn nút và chặn mở hộp thoại ở AI Mode', () => {
    const source = readFileSync(NEWS_PAGE, 'utf8')
    expect(source).toContain('const canEdit = canImportNews(isAiEnabled)')
    // Import + add/edit/delete đều nằm sau `canEdit`.
    expect(source).toMatch(/\{canEdit \? \(\s*<Button[\s\S]{0,220}Import News/)
    expect(source).toMatch(/onEdit=\{canEdit \? \(\) => openEdit\(item\) : null\}/)
    expect(source).toMatch(/onDelete=\{canEdit \? \(\) => setDeleteTarget\(item\) : null\}/)
    // Đổi sang AI Mode thì đóng hộp thoại và chặn thao tác.
    expect(source).toMatch(/if \(!canImportNews\(isAiEnabled\)\) \{\s*setImportPreview\(null\)/)
    expect(source).toMatch(/if \(!canImportNews\(isAiEnabled\)\) \{\s*return/)
  })
})
