import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { UpdateServiceDeps } from '../src/main/services/updateService'
import { createUpdateService } from '../src/main/services/updateService'
import { computeDataInsideInstall, UPDATE_CHECK_DELAY_MS } from '@shared/constants'
import { isPathInside } from '@shared/constants'

const ROOT = resolve(__dirname, '..')
const SERVICE_SOURCE = join(ROOT, 'src', 'main', 'services', 'updateService.ts')
const readSource = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

interface UpdaterMock {
  emitter: EventEmitter
  autoDownload?: boolean
  autoInstallOnAppQuit?: boolean
  allowPrerelease?: boolean
  allowDowngrade?: boolean
  checkForUpdates: () => Promise<{ updateInfo?: { version: string; releaseUrl?: string } }>
  downloadUpdate: ReturnType<typeof vi.fn>
  quitAndInstall: ReturnType<typeof vi.fn>
  on: (event: string, listener: (...args: unknown[]) => void) => void
  setCheckForUpdates: (impl: () => Promise<{ updateInfo?: { version: string; releaseUrl?: string } }>) => void
  triggerUpdateAvailable: (version: string, releaseUrl?: string) => void
  triggerDownloadProgress: (percent: number) => void
  triggerUpdateDownloaded: () => void
}

interface DepsMock {
  broadcastStates: any[]
  logInfo: (message: string) => void
  logError: (message: string) => void
  hasActiveAiTask: () => boolean
  getUserEditing: () => boolean
  getDataDir: () => string | null
  getInstallDir: () => string | null
}

function makeUpdater(): UpdaterMock {
  const emitter = new EventEmitter()
  const checkForUpdates = vi.fn(() => Promise.resolve({}))
  const on = (event: string, listener: (...args: unknown[]) => void) => {
    emitter.on(event, listener)
  }
  return {
    emitter,
    checkForUpdates,
    downloadUpdate: vi.fn(() => Promise.resolve([])),
    quitAndInstall: vi.fn(),
    on,
    setCheckForUpdates: (next: () => Promise<{ updateInfo?: { version: string; releaseUrl?: string } }>) => {
      checkForUpdates.mockImplementation(next)
    },
    triggerUpdateAvailable: (version: string, releaseUrl?: string) => {
      emitter.emit('update-available', { version, releaseUrl })
    },
    triggerDownloadProgress: (percent: number) => {
      emitter.emit('download-progress', { percent })
    },
    triggerUpdateDownloaded: () => {
      emitter.emit('update-downloaded', {})
    }
  }
}

function makeDeps(): DepsMock {
  const broadcastStates: any[] = []
  return {
    broadcastStates,
    logInfo: vi.fn() as unknown as (message: string) => void,
    logError: vi.fn() as unknown as (message: string) => void,
    hasActiveAiTask: vi.fn(() => false) as unknown as () => boolean,
    getUserEditing: vi.fn(() => false) as unknown as () => boolean,
    getDataDir: vi.fn(() => null) as unknown as () => string | null,
    getInstallDir: vi.fn(() => null) as unknown as () => string | null
  }
}

function buildService(overrides: Partial<UpdateServiceDeps> = {}) {
  const updater = makeUpdater()
  const deps = makeDeps()
  const base: UpdateServiceDeps = {
    updater: updater as any,
    isPackaged: true,
    isPortable: false,
    currentVersion: '1.0.0',
    hasActiveAiTask: deps.hasActiveAiTask,
    getUserEditing: deps.getUserEditing,
    getDataDir: deps.getDataDir,
    getInstallDir: deps.getInstallDir,
    broadcast: (state: any) => deps.broadcastStates.push(state),
    log: { info: deps.logInfo, error: deps.logError },
    setTimer: setTimeout,
    clearTimer: clearTimeout
  }
  const service = createUpdateService({ ...base, ...overrides })
  return { service, updater, deps }
}

/** Chạy hết microtask/promise đang chờ mà không cần timer thật. */
async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => process.nextTick(resolve))
}

describe('updateService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dùng đúng hằng số 10 giây', () => {
    expect(UPDATE_CHECK_DELAY_MS).toBe(10_000)
  })

  it('không dò trước 10 giây và dò đúng 1 lần khi tới 10 giây', () => {
    const { service, updater } = buildService()
    service.scheduleStartupCheck()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()

    vi.advanceTimersByTime(9_999)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('gọi scheduleStartupCheck lần hai không đặt thêm timer', () => {
    const { service, updater } = buildService()
    service.scheduleStartupCheck()
    service.scheduleStartupCheck()
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('isPackaged = false thì không bao giờ dò', () => {
    const { service, updater } = buildService({ isPackaged: false })
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(service.getState().phase).toBe('idle')
  })

  it('lần dò tự động lỗi mạng/hết giờ không ném lỗi và không báo error cho người dùng', async () => {
    const { service, updater, deps } = buildService()
    updater.setCheckForUpdates(() => Promise.reject(new Error('Mất mạng')))
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    vi.advanceTimersByTime(0)
    await flush()
    expect(deps.logError).toHaveBeenCalled()
    expect(service.getState().phase).toBe('idle')
    expect(service.getState().message).toBeUndefined()
  })

  it('không còn lần dò thủ công nào (update:check đã bị gỡ)', () => {
    const source = readSource(SERVICE_SOURCE)
    expect(source).not.toContain('checkForUpdates(): Promise<UpdateState>')
    expect(source).not.toMatch(/performCheck\(false\)/)
  })

  it('có bản mới thì phase available với đúng latestVersion', async () => {
    const { service, updater } = buildService()
    updater.setCheckForUpdates(() =>
      Promise.resolve({
        updateInfo: { version: '2.0.0', releaseUrl: 'https://github.com/mrruby168/Ai-mmo-manager/releases/tag/v2.0.0' }
      })
    )
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    vi.advanceTimersByTime(0)
    await flush()
    expect(service.getState().phase).toBe('available')
    expect(service.getState().latestVersion).toBe('2.0.0')
  })

  it('thiếu releaseUrl thì tự dựng URL theo tag phiên bản', async () => {
    const { service, updater } = buildService()
    updater.setCheckForUpdates(() => Promise.resolve({ updateInfo: { version: '2.0.0' } }))
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    vi.advanceTimersByTime(0)
    await flush()
    expect(service.getState().releaseUrl).toContain('/tag/v2.0.0')
  })

  it('cùng bản hoặc bản thấp hơn thì idle', async () => {
    const { service, updater } = buildService()
    updater.setCheckForUpdates(() => Promise.resolve({ updateInfo: { version: '1.0.0' } }))
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    vi.advanceTimersByTime(0)
    await flush()
    expect(service.getState().phase).toBe('idle')

    updater.setCheckForUpdates(() => Promise.resolve({ updateInfo: { version: '0.9.0' } }))
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    vi.advanceTimersByTime(0)
    await flush()
    expect(service.getState().phase).toBe('idle')
  })

  it('downloadUpdate bị từ chối khi chưa có bản mới hoặc khi portable', async () => {
    const { service } = buildService()
    expect((await service.downloadUpdate()).downloaded).toBe(false)

    const { service: portableService } = buildService({ isPortable: true })
    portableService.scheduleStartupCheck()
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    vi.advanceTimersByTime(0)
    await flush()
    expect((await portableService.downloadUpdate()).downloaded).toBe(false)
  })

  it('downloadUpdate lỗi thì phase error kèm message, không ném ra ngoài', async () => {
    const { service, updater } = buildService()
    updater.setCheckForUpdates(() => Promise.resolve({ updateInfo: { version: '2.0.0' } }))
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    vi.advanceTimersByTime(0)
    await flush()

    updater.downloadUpdate.mockImplementation(() => Promise.reject(new Error('Mất kết nối')))
    const result = await service.downloadUpdate()
    expect(result.downloaded).toBe(false)
    expect(service.getState().phase).toBe('error')
    expect(service.getState().message).toBe('Mất kết nối')
  })

  it('downloadUpdate thành công thì phase downloaded', async () => {
    const { service, updater } = buildService()
    updater.setCheckForUpdates(() => Promise.resolve({ updateInfo: { version: '2.0.0' } }))
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    vi.advanceTimersByTime(0)
    await flush()

    const result = await service.downloadUpdate()
    expect(result.downloaded).toBe(true)
    expect(service.getState().phase).toBe('downloaded')
  })

  it('installUpdate bị chặn khi AI đang chạy, trả lý do rõ ràng và không thoát app', async () => {
    const { service, updater, deps } = buildService()
    ;(deps.hasActiveAiTask as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const result = await service.installUpdate()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.length).toBeGreaterThan(0)
      expect(result.error).toContain('Check News')
    }
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('installUpdate bị chặn khi người dùng đang chỉnh sửa dữ liệu', async () => {
    const { service, updater, deps } = buildService()
    ;(deps.getUserEditing as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const result = await service.installUpdate()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('chỉnh sửa')
    }
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('installUpdate hợp lệ gọi quitAndInstall(true, true) và không tự đóng database', async () => {
    const { service, updater } = buildService()
    const result = await service.installUpdate()
    expect('installed' in result).toBe(true)
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true)

    const source = readSource(SERVICE_SOURCE)
    expect(source).not.toContain('closeDatabase')
  })

  it('đăng ký listener cho sự kiện error của electron-updater để không ném lỗi', () => {
    const { updater, deps } = buildService()
    expect(updater.emitter.listenerCount('error')).toBeGreaterThan(0)
    expect(() => updater.emitter.emit('error', new Error('boom'))).not.toThrow()
    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining('boom'))
  })

  it('không chạy hai lần dò đồng thời', async () => {
    const { service, updater } = buildService()
    let resolveFirst: (value: any) => void = () => {}
    const first = new Promise<{ updateInfo?: { version: string } }>((res) => {
      resolveFirst = res
    })
    updater.setCheckForUpdates(() => first)

    service.scheduleStartupCheck()
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    expect(service.getState().phase).toBe('checking')

    // Lần dò thứ hai không được gọi checkForUpdates thêm lần nữa.
    service.scheduleStartupCheck()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)

    resolveFirst({ updateInfo: { version: '2.0.0' } })
    vi.advanceTimersByTime(0)
    await flush()
    expect(service.getState().phase).toBe('available')
  })

  it('cờ updater đúng', () => {
    const { service, updater } = buildService()
    service.scheduleStartupCheck()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
    expect(updater.allowDowngrade).toBe(false)
    expect(service.getState().portable).toBe(false)
  })

  it('isPathInside: trong/ngoài, hoa thường, gạch chéo, .., tiền tố giống nhau', () => {
    expect(isPathInside('C:\\App\\data', 'C:\\App')).toBe(true)
    expect(isPathInside('C:/App/data', 'C:/App')).toBe(true)
    expect(isPathInside('C:\\App', 'C:\\App')).toBe(true)
    expect(isPathInside('C:\\APP\\DATA', 'C:\\App')).toBe(true)
    expect(isPathInside('C:\\App2\\data', 'C:\\App')).toBe(false)
    expect(isPathInside('C:\\App\\..\\Outside', 'C:\\App')).toBe(false)
    expect(isPathInside('D:\\data', 'C:\\App')).toBe(false)
    expect(isPathInside('C:\\App', 'C:\\App\\data')).toBe(false)
  })

  describe('computeDataInsideInstall', () => {
    it('trả null khi dataDir null/undefined/rỗng', () => {
      expect(computeDataInsideInstall(null, 'C:\\App')).toBe(null)
      expect(computeDataInsideInstall(undefined, 'C:\\App')).toBe(null)
      expect(computeDataInsideInstall('', 'C:\\App')).toBe(null)
      expect(computeDataInsideInstall('   ', 'C:\\App')).toBe(null)
    })

    it('trả null khi installDir null/undefined/rỗng', () => {
      expect(computeDataInsideInstall('D:\\Data', null)).toBe(null)
      expect(computeDataInsideInstall('D:\\Data', undefined)).toBe(null)
      expect(computeDataInsideInstall('D:\\Data', '')).toBe(null)
    })

    it('trả true khi dataDir nằm trong installDir', () => {
      expect(computeDataInsideInstall('C:\\App\\data', 'C:\\App')).toBe(true)
    })

    it('trả false khi dataDir nằm ngoài installDir', () => {
      expect(computeDataInsideInstall('D:\\Data', 'C:\\App')).toBe(false)
      expect(computeDataInsideInstall('C:\\App2\\data', 'C:\\App')).toBe(false)
    })
  })

  describe('updateService dataInsideInstallDir', () => {
    it('phát state dataInsideInstallDir = true/false/null theo getDataDir/getInstallDir', async () => {
      // true
      const s1 = buildService({
        getDataDir: () => 'C:\\App\\data' as string | null,
        getInstallDir: () => 'C:\\App' as string | null
      })
      s1.service.scheduleStartupCheck()
      vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
      await flush()
      expect(s1.service.getState().dataInsideInstallDir).toBe(true)

      // false
      const s2 = buildService({
        getDataDir: () => 'D:\\Data' as string | null,
        getInstallDir: () => 'C:\\App' as string | null
      })
      s2.service.scheduleStartupCheck()
      vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
      await flush()
      expect(s2.service.getState().dataInsideInstallDir).toBe(false)

      // null
      const s3 = buildService({
        getDataDir: () => null,
        getInstallDir: () => 'C:\\App'
      })
      s3.service.scheduleStartupCheck()
      vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
      await flush()
      expect(s3.service.getState().dataInsideInstallDir).toBe(null)
    })

    it('khi getDataDir ném lỗi thì dataInsideInstallDir = null, không làm sập service', async () => {
      const { service, deps } = buildService()
      ;(deps.getDataDir as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Lỗi lấy data dir')
      })
      service.scheduleStartupCheck()
      vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
      await flush()
      expect(service.getState().dataInsideInstallDir).toBe(null)
    })
  })
})
