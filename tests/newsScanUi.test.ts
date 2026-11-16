import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const NEWS_PAGE = join(ROOT, 'src', 'renderer', 'src', 'features', 'news', 'NewsPage.tsx')
const SCAN_SETTINGS = join(ROOT, 'src', 'renderer', 'src', 'features', 'settings', 'WebSearchPanel.tsx')
const NEWS_CHECK_SERVICE = join(ROOT, 'src', 'main', 'ai', 'checkNewsService.ts')
const BADGE_STORE = join(ROOT, 'src', 'renderer', 'src', 'state', 'newsBadgeStore.ts')

// CI checkouts may use CRLF (windows runner + autocrlf); normalize so multi-line
// source assertions stay line-ending agnostic.
const readSource = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

function listSources(dir: string): string[] {
  const result: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...listSources(full))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      result.push(full)
    }
  }
  return result
}

describe('v0.1.4: News có hai nút ở AI Mode, No AI giữ giao diện cũ', () => {
  const news = readSource(NEWS_PAGE)

  it('có nút Daily Scan và Full Scan, gọi handleCheck theo mode', () => {
    expect(news).toContain('Daily Scan')
    expect(news).toContain('Full Scan')
    expect(news).toContain("handleCheck('daily')")
    expect(news).toContain("handleCheck('full')")
    expect(news).toContain('window.api.news.check(runMode)')
  })

  it('hai nút chỉ nằm trong nhánh isAiEnabled, No AI vẫn là nút Check News cũ', () => {
    const branch = news.indexOf('{isAiEnabled ? (')
    expect(branch).toBeGreaterThan(0)
    const daily = news.indexOf('Daily Scan', branch)
    const full = news.indexOf('Full Scan', branch)
    const fallback = news.indexOf('Check News\n            </Button>', branch)
    expect(daily).toBeGreaterThan(branch)
    expect(full).toBeGreaterThan(daily)
    expect(fallback).toBeGreaterThan(full)
  })
})

describe('v0.1.4: khối chế độ Quét Check News ở Settings → Web Search', () => {
  const panel = readSource(SCAN_SETTINGS)

  it('ẩn hoàn toàn ở No AI Mode (isAiEnabled từ useApp)', () => {
    expect(panel).toContain("import { useApp } from '../../state/AppContext'")
    expect(panel).toContain('const { isAiEnabled } = useApp()')
    expect(panel).toContain('{isAiEnabled && scanSettings ? (')
    expect(panel).not.toContain('aiModeOn')
  })

  it('khối chế độ nằm dưới phần chọn Provider', () => {
    expect(panel.indexOf('<h2>Chế độ quét Check News</h2>')).toBeGreaterThan(panel.indexOf('<h2>Web Search</h2>'))
  })

  it('hai ô Daily chỉ hiện khi mode mặc định là Daily', () => {
    expect(panel).toContain("scanSettings.defaultMode === 'daily' ? (")
    expect(panel).toContain('news-scan-interval')
    expect(panel).toContain('news-scan-window')
  })
})

describe('v0.1.4: cửa sổ tin không còn truyền cứng vào pipeline', () => {
  const service = readSource(NEWS_CHECK_SERVICE)

  it('không còn NEWS_WINDOW_DAYS trong src/', () => {
    const files = listSources(join(ROOT, 'src'))
    for (const file of files) {
      expect(readSource(file), relative(ROOT, file)).not.toContain('NEWS_WINDOW_DAYS')
    }
  })

  it('parse và lưu dùng cửa sổ của profile mode', () => {
    expect(service).toContain('isWithinNewsWindow(iso, windowNow, profile.windowDays)')
    expect(service).toContain('saveNewsBatch(verified.items, windowNow.toISOString()')
  })
})

describe('v0.1.4: badge "có tin mới" sống trong bộ nhớ', () => {
  it('newsBadgeStore không dùng localStorage và NewsPage import store', () => {
    const store = readSource(BADGE_STORE)
    expect(store).not.toContain('localStorage')
    expect(store).toContain('useSyncExternalStore')

    const news = readSource(NEWS_PAGE)
    expect(news).toContain('newsBadgeStore')
    expect(news).toContain('useNewsBadge')
  })

  it('Sidebar vẫn hiện chấm đỏ ở tab News', () => {
    const sidebar = readSource(join(ROOT, 'src', 'renderer', 'src', 'layout', 'Sidebar.tsx'))
    expect(sidebar).toContain('useNewsBadge')
    expect(sidebar).toContain('sidebar__dot')
  })

  it('file store tồn tại và Sidebar tồn tại', () => {
    expect(existsSync(BADGE_STORE)).toBe(true)
    expect(existsSync(NEWS_PAGE)).toBe(true)
  })
})
