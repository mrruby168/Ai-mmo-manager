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

describe('U1: Activity Log của News nằm cuối trang và mở rộng được', () => {
  const news = readSource(NEWS_PAGE)

  it('log đứng sau news-grid', () => {
    expect(news.indexOf('<AiActivityLog')).toBeGreaterThan(news.indexOf('className="news-grid"'))
  })

  it('có nút mở rộng và class mở rộng', () => {
    expect(news).toContain('Mở rộng nhật ký')
    expect(news).toContain('Thu gọn nhật ký')
    expect(news).toContain('ai-log--expanded')
  })

  it('bấm Check News thì cuộn tới log', () => {
    expect(news).toContain('scrollIntoView({ block: \'nearest\'')
    expect(news).toContain("prefers-reduced-motion: reduce")
  })
})
