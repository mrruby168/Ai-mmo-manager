import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const COMPONENTS = join(ROOT, 'src', 'renderer', 'src', 'styles', 'components.css')
const TASK_MODEL_CARD = join(ROOT, 'src', 'renderer', 'src', 'common', 'TaskModelCard.tsx')
const NEWS_PAGE = join(ROOT, 'src', 'renderer', 'src', 'features', 'news', 'NewsPage.tsx')
const SCAN_PAGE = join(ROOT, 'src', 'renderer', 'src', 'features', 'scan', 'ScanPage.tsx')
const CHAT_PANEL = join(ROOT, 'src', 'renderer', 'src', 'features', 'chat', 'ChatPanel.tsx')

// CI checkouts may use CRLF (windows runner + autocrlf); normalize so multi-line
// source assertions stay line-ending agnostic.
const readSource = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

describe('FIX 3: News/Scan bỏ card chọn Model, Chat giữ nguyên', () => {
  const news = readSource(NEWS_PAGE)
  const scan = readSource(SCAN_PAGE)
  const chat = readSource(CHAT_PANEL)
  const css = readSource(COMPONENTS)

  it('News chuyển cảnh báo thành banner + title và dùng Activity Log', () => {
    expect(news).not.toContain('<TaskModelCard')
    expect(news).not.toContain('<ModelPicker')
    expect(news).not.toContain('resolveTaskModel')
    expect(news).toContain('<AiActivityLog')
    expect(news).toContain('channel="news"')
    expect(news).toContain('Settings → Model Configuration')
    expect(news).toContain('title={isAiEnabled && newsModelWarning')
    expect(news).toContain('banner banner--warning')
  })

  it('Scan dùng Activity Log, thanh tiến độ riêng, vùng dán kéo thả và banner cảnh báo', () => {
    expect(scan).not.toContain('<TaskModelCard')
    expect(scan).not.toContain('<ModelPicker')
    expect(scan).not.toContain('resolveTaskModel')
    expect(scan).toContain('<AiActivityLog')
    expect(scan).toContain('channel="scan"')
    // Scan tự vẽ "Tiến độ quét" nên tắt footer tiến trình của log.
    expect(scan).toContain('showProgress={false}')
    expect(scan).toContain('Tiến độ quét')
    expect(scan).toContain('Settings → Model Configuration')
    expect(scan).toContain('title={scanDisabledReason ?? undefined}')
    expect(scan).toContain('banner banner--warning')
    // Vùng dán: textarea thật + kéo thả + giới hạn 1 MB + đuôi file.
    expect(scan).toContain('onDrop={handleDrop}')
    expect(scan).toContain('onDragEnter={handleDragEnter}')
    expect(scan).toContain("accept={SCAN_FILE_ACCEPT}")
    expect(scan).toContain("'.txt,.md,.json,text/plain,text/markdown,application/json'")
    expect(scan).toContain("function isScanFileName")
    expect(scan).toContain('/\\.(txt|md|json)$/i')
    expect(scan).toContain('Tối đa 1 MB · AI không tự thêm dự án cho đến khi bạn xác nhận')
    expect(scan).toContain('Quét nội dung khác')
  })

  it('TaskModelCard đã bị xóa vì không còn trang nào dùng', () => {
    expect(existsSync(TASK_MODEL_CARD)).toBe(false)
    expect(css).not.toContain('.task-model-card')
    expect(css).not.toContain('.ai-task-picker')
  })

  it('Chat vẫn dùng ModelPicker', () => {
    expect(chat).toContain('<ModelPicker')
    expect(chat).not.toContain('TaskModelCard')
  })
})

describe('U1: Activity Log của News nằm trong lưới và mở rộng được', () => {
  const news = readSource(NEWS_PAGE)

  it('log nằm bên trong .news-board', () => {
    expect(news).toContain('className="news-board"')
    expect(news.indexOf('<AiActivityLog')).toBeGreaterThan(news.indexOf('className="news-board"'))
    expect(news).not.toContain('news-grid')
  })

  it('có nút mở rộng, lớp phủ và class phóng to toàn màn hình', () => {
    expect(news).toContain('Mở rộng nhật ký')
    expect(news).toContain('Thu gọn nhật ký')
    expect(news).toContain('news-log--fullscreen')
    expect(news).toContain('news-log-backdrop')
    expect(news).toContain("event.key === 'Escape'")
  })

  it('bấm Check News thì cuộn tới log', () => {
    expect(news).toContain('scrollIntoView({ block: \'nearest\'')
    expect(news).toContain("prefers-reduced-motion: reduce")
  })
})

describe('U2: Scan đưa log xuống cuối và bảng kết quả cuộn được', () => {
  const scan = readSource(SCAN_PAGE)
  const css = readSource(COMPONENTS)

  it('log đứng sau khối nhập/kết quả', () => {
    expect(scan.indexOf('<AiActivityLog')).toBeGreaterThan(scan.indexOf("view === 'input'"))
    expect(scan.indexOf('<AiActivityLog')).toBeGreaterThan(scan.indexOf('scan-results'))
  })

  it('thanh tiến độ quét nằm ngay trên log', () => {
    expect(scan.lastIndexOf('Tiến độ quét')).toBeGreaterThan(scan.indexOf("view === 'input'"))
    expect(scan.indexOf('<AiActivityLog')).toBeGreaterThan(scan.lastIndexOf('Tiến độ quét'))
  })

  it('có nút mở rộng nhật ký và tự cuộn tới log', () => {
    expect(scan).toContain('ai-log--expanded')
    expect(scan).toContain('scrollIntoView({ block: \'nearest\'')
  })

  it('có chip đếm theo loại nhưng vẫn một bảng duy nhất', () => {
    expect(scan).toContain('Không đủ bằng chứng {scanCounts.insufficient}')
    expect(scan.match(/role="table"/g)?.length).toBe(1)
  })

  it('bảng kết quả cuộn được và header dính trên cùng', () => {
    expect(css).toMatch(/\.scan-table\s*\{[^}]*max-height:\s*calc\(100vh - 20rem\)/)
    expect(css).toMatch(/\.scan-table\s*\{[^}]*overflow-y:\s*auto/)
    expect(css).toMatch(/\.scan-table__head\s*\{[^}]*position:\s*sticky/)
  })
})
