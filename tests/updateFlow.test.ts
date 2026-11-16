import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src')
const RENDERER = join(SRC, 'renderer', 'src')
const LAYOUT = join(RENDERER, 'layout')
const SETTINGS = join(RENDERER, 'features', 'settings')

const readSource = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

describe('W1: đã gỡ banner/panel cập nhật cũ', () => {
  it('không còn UpdateBanner.tsx và UpdatePanel.tsx', () => {
    expect(existsSync(join(LAYOUT, 'UpdateBanner.tsx'))).toBe(false)
    expect(existsSync(join(SETTINGS, 'UpdatePanel.tsx'))).toBe(false)
  })

  it('không còn ai nhắc tới UpdateBanner/UpdatePanel', () => {
    const offenders = walk(RENDERER).filter((file) => {
      const source = readSource(file)
      return source.includes('UpdateBanner') || source.includes('UpdatePanel')
    })
    expect(offenders).toEqual([])
  })

  it('AppShell gắn UpdateDialog và không còn banner cũ', () => {
    const shell = readSource(join(LAYOUT, 'AppShell.tsx'))
    expect(shell).toContain('<UpdateDialog />')
    expect(shell).not.toContain('UpdateBanner')
  })

  it('Settings chỉ còn 5 tab và không còn chữ "Cập nhật ứng dụng"', () => {
    const page = readSource(join(SETTINGS, 'SettingsPage.tsx'))
    expect(page.match(/id: '/g)?.length).toBe(5)
    expect(page).not.toContain('Cập nhật ứng dụng')
    expect(page).not.toContain('UpdatePanel')
  })
})

describe('W2: một nguồn state duy nhất, không dùng localStorage', () => {
  const context = readSource(join(RENDERER, 'state', 'UpdateContext.tsx'))

  it('UpdateContext là nơi duy nhất đăng ký onUpdateState', () => {
    const files = walk(RENDERER)
    const withListener = files.filter((file) => readSource(file).includes('onUpdateState'))
    expect(withListener).toEqual([join(RENDERER, 'state', 'UpdateContext.tsx')])
    expect(context).toContain('onUpdateState')
  })

  it('Sidebar và UpdateDialog không tự gọi IPC cập nhật', () => {
    const sidebar = readSource(join(LAYOUT, 'Sidebar.tsx'))
    const dialog = readSource(join(LAYOUT, 'UpdateDialog.tsx'))
    for (const source of [sidebar, dialog]) {
      expect(source).not.toContain('window.api.update')
      expect(source).not.toContain('onUpdateState')
    }
  })

  it('không dùng localStorage để đánh dấu đã bỏ qua', () => {
    const updateFiles = [
      join(RENDERER, 'state', 'UpdateContext.tsx'),
      join(LAYOUT, 'UpdateDialog.tsx'),
      join(LAYOUT, 'Sidebar.tsx'),
      join(LAYOUT, 'AppShell.tsx')
    ]
    for (const file of updateFiles) {
      expect(readSource(file)).not.toContain('localStorage')
    }
  })
})

describe('W3: hộp thoại cập nhật đúng thứ tự hook và tự mở một lần mỗi phiên bản', () => {
  const dialog = readSource(join(LAYOUT, 'UpdateDialog.tsx'))
  const context = readSource(join(RENDERER, 'state', 'UpdateContext.tsx'))

  it('không có hook nào sau early return', () => {
    const firstHook = dialog.indexOf('useUpdate()')
    const earlyReturn = dialog.indexOf('if (!state)')
    expect(firstHook).toBeGreaterThan(-1)
    expect(earlyReturn).toBeGreaterThan(firstHook)
    const afterReturn = dialog.slice(earlyReturn)
    expect(afterReturn).not.toContain('useState(')
    expect(afterReturn).not.toContain('useEffect(')
    expect(afterReturn).not.toContain('useCallback(')
    expect(afterReturn).not.toContain('useMemo(')
  })

  it('tự mở hộp thoại đúng một lần cho mỗi phiên bản mới', () => {
    expect(context).toContain('autoOpenedVersion')
    expect(context).toContain('setDialogOpen(true)')
    expect(context).toContain('autoOpenedVersion.current === latestVersion')
  })

  it('có đủ copy tiếng Việt và hai nút', () => {
    expect(dialog).toContain('Có phiên bản mới!')
    expect(dialog).toContain('Cập nhật ngay')
    expect(dialog).toContain('Để sau')
    expect(dialog).toContain('Khởi động lại để cài')
    expect(dialog).toContain('Thử lại')
  })
})

describe('W4: sidebar luôn hiện phiên bản hiện tại', () => {
  const sidebar = readSource(join(LAYOUT, 'Sidebar.tsx'))

  it('luôn render v{currentVersion} ở cuối sidebar', () => {
    expect(sidebar).toContain('v${updateState.currentVersion}')
    expect(sidebar).toContain('sidebar__version')
  })

  it('có nút vàng Update + nhãn New và trạng thái đang tải', () => {
    expect(sidebar).toContain('sidebar__update')
    expect(sidebar).toContain('Đang tải…')
    expect(sidebar).toContain('New')
    expect(sidebar).toContain('openDialog')
  })
})

describe('W5: IPC và hằng số cập nhật', () => {
  it('không còn update:check / updateCheck ở shared, preload và main', () => {
    const files = [
      join(SRC, 'shared', 'ipc-channels.ts'),
      join(SRC, 'shared', 'types.ts'),
      join(SRC, 'preload', 'index.ts'),
      join(SRC, 'main', 'ipc', 'updateIpc.ts')
    ]
    for (const file of files) {
      const source = readSource(file)
      expect(source).not.toContain('updateCheck')
      expect(source).not.toContain('update:check')
    }
  })

  it('UPDATE_CHECK_DELAY_MS = 10_000', () => {
    const constants = readSource(join(SRC, 'shared', 'constants.ts'))
    expect(constants).toMatch(/UPDATE_CHECK_DELAY_MS\s*=\s*10_000/)
  })
})

describe('W6: main process chỉ dò sau khi cửa sổ sẵn sàng và có log chẩn đoán', () => {
  const main = readSource(join(SRC, 'main', 'index.ts'))

  it('chỉ đặt một lần dò, sau ready-to-show', () => {
    expect(main.match(/\.scheduleStartupCheck\(\)/g)?.length).toBe(1)
    expect(main.indexOf('ready-to-show')).toBeLessThan(main.indexOf('.scheduleStartupCheck()'))
  })

  it('gắn log render-process-gone, console-message và did-fail-load', () => {
    expect(main).toContain('render-process-gone')
    expect(main).toContain("on('console-message'")
    expect(main).toContain('did-fail-load')
  })

  it('không truyền closeDatabase vào updateService', () => {
    const start = main.indexOf('createUpdateService({')
    const end = main.indexOf('})', start)
    const deps = main.slice(start, end)
    expect(deps).not.toContain('closeDatabase')
  })
})

describe('W7: ErrorBoundary bọc App', () => {
  const entry = readSource(join(RENDERER, 'main.tsx'))
  const boundary = readSource(join(RENDERER, 'common', 'ErrorBoundary.tsx'))

  it('main.tsx bọc <App /> bằng ErrorBoundary', () => {
    expect(entry).toContain('<ErrorBoundary>')
    expect(entry).toContain('<App />')
  })

  it('fallback tiếng Việt có nút Tải lại', () => {
    expect(boundary).toContain('Tải lại')
    expect(boundary).toContain('window.location.reload()')
    expect(boundary).toContain('console.error')
  })
})
