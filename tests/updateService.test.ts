import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { UpdateServiceDeps } from '../src/main/services/updateService'
import { createUpdateService } from '../src/main/services/updateService'

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
  closeDatabase: () => void
  hasActiveAiTask: () => boolean
  getUserEditing: () => boolean
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
    downloadUpdate: vi.fn(() => Promise.resolve()),
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
    closeDatabase: vi.fn() as unknown as () => void,
    hasActiveAiTask: vi.fn(() => false) as unknown as () => boolean,
    getUserEditing: vi.fn(() => false) as unknown as () => boolean
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
    closeDatabase: deps.closeDatabase,
    broadcast: (state: any) => deps.broadcastStates.push(state),
    log: { info: deps.logInfo, error: deps.logError },
    setTimer: setTimeout,
    clearTimer: clearTimeout
  }
  const service = createUpdateService({ ...base, ...overrides })
  return { service, updater, deps }
}

describe('updateService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('không dò trước 60 giây và dò đúng 1 lần khi tới 60 giây', () => {
    const { service, updater } = buildService()
    service.scheduleStartupCheck()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()

    vi.advanceTimersByTime(59_999)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('gọi scheduleStartupCheck lần hai không đặt thêm timer', () => {
    const { service, updater } = buildService()
    service.scheduleStartupCheck()
    service.scheduleStartupCheck()
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(60_000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('isPackaged = false thì không bao giờ dò', () => {
    const { service, updater } = buildService({ isPackaged: false })
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(60_000)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(service.getState().phase).toBe('idle')
  })

  it('lần dò tự động lỗi mạng/hết giờ không ném lỗi và không báo error cho người dùng', async () => {
    const { service, updater, deps } = buildService()
    updater.setCheckForUpdates(() => Promise.reject(new Error('Mất mạng')))
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(60_000)
    // Chờ microtask của Promise.race / catch chạy
    vi.advanceTimersByTime(0)
    await new Promise((resolve) => process.nextTick(resolve))
    expect(deps.logError).toHaveBeenCalled()
    expect(service.getState().phase).toBe('idle')
  })

  it('lần dò thủ công gặp lỗi thì phase error có message', async () => {
    const { service, updater } = buildService()
    updater.setCheckForUpdates(() => Promise.reject(new Error('GitHub lỗi')))
    await service.checkForUpdates()
    vi.advanceTimersByTime(0)
    await new Promise((resolve) => process.nextTick(resolve))
    expect(service.getState().phase).toBe('error')
    expect(service.getState().message).toBe('GitHub lỗi')
  })

  it('có bản mới thì phase available với đúng latestVersion', async () => {
    const { service, updater } = buildService()
    updater.setCheckForUpdates(() => Promise.resolve({ updateInfo: { version: '2.0.0', releaseUrl: 'https://github.com/mrruby168/Ai-mmo-manager/releases/tag/v2.0.0' } }))
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(60_000)
    vi.advanceTimersByTime(0)
    await new Promise((resolve) => process.nextTick(resolve))
    expect(service.getState().phase).toBe('available')
    expect(service.getState().latestVersion).toBe('2.0.0')
  })

  it('cùng bản hoặc bản thấp hơn thì idle', async () => {
    const { service, updater } = buildService()
    updater.setCheckForUpdates(() => Promise.resolve({ updateInfo: { version: '1.0.0' } }))
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(60_000)
    vi.advanceTimersByTime(0)
    await new Promise((resolve) => process.nextTick(resolve))
    expect(service.getState().phase).toBe('idle')

    updater.setCheckForUpdates(() => Promise.resolve({ updateInfo: { version: '0.9.0' } }))
    service.scheduleStartupCheck()
    vi.advanceTimersByTime(60_000)
    vi.advanceTimersByTime(0)
    await new Promise((resolve) => process.nextTick(resolve))
    expect(service.getState().phase).toBe('idle')
  })

  it('downloadUpdate bị từ chối khi phase khác available hoặc khi portable', async () => {
    const { service } = buildService()
    expect((await service.downloadUpdate()).downloaded).toBe(false)

    const { service: portableService } = buildService({ isPortable: true })
    portableService.scheduleStartupCheck()
    vi.advanceTimersByTime(60_000)
    vi.advanceTimersByTime(0)
    await new Promise((resolve) => process.nextTick(resolve))
    expect((await portableService.downloadUpdate()).downloaded).toBe(false)
  })

  it('installUpdate bị từ chối khi AI đang chạy hoặc đang sửa dữ liệu; hợp lệ gọi closeDatabase trước quitAndInstall', async () => {
    const { service, updater, deps } = buildService()

    ;(deps.hasActiveAiTask as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const r1 = await service.installUpdate()
    expect('error' in r1).toBe(true)
    expect(deps.closeDatabase).not.toHaveBeenCalled()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()

    ;(deps.hasActiveAiTask as ReturnType<typeof vi.fn>).mockReturnValue(false)
    ;(deps.getUserEditing as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const r2 = await service.installUpdate()
    expect('error' in r2).toBe(true)
    expect(deps.closeDatabase).not.toHaveBeenCalled()

    ;(deps.getUserEditing as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const r3 = await service.installUpdate()
    expect('installed' in r3).toBe(true)
    expect(deps.closeDatabase).toHaveBeenCalledTimes(1)
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('không chạy hai lần dò đồng thời', async () => {
    const { service, updater } = buildService()
    let resolveFirst: (value: any) => void = () => {}
    const first = new Promise<{ updateInfo?: { version: string } }>((res) => {
      resolveFirst = res
    })
    updater.setCheckForUpdates(() => first)

    service.scheduleStartupCheck()
    vi.advanceTimersByTime(60_000)
    expect(service.getState().phase).toBe('checking')

    // Lần dò thứ hai gọi ngay sau -> kiểm tra qua checkForUpdates (manual)
    await service.checkForUpdates()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)

    resolveFirst({ updateInfo: { version: '2.0.0' } })
    vi.advanceTimersByTime(0)
    await new Promise((resolve) => process.nextTick(resolve))
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
})
