import type { UpdateState } from '@shared/types'
import {
  computeDataInsideInstall,
  UPDATE_CHECK_DELAY_MS,
  UPDATE_CHECK_TIMEOUT_MS,
  UPDATE_RELEASE_URL_BASE
} from '@shared/constants'

type Updater = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  checkForUpdates(): Promise<{ updateInfo?: { version: string; releaseUrl?: string } } | null>
  downloadUpdate(): Promise<string[]>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
  on(event: string, listener: (...args: unknown[]) => void): void
}

type Timer = ReturnType<typeof setTimeout>

export interface UpdateServiceDeps {
  updater: Updater
  isPackaged: boolean
  isPortable: boolean
  currentVersion: string
  hasActiveAiTask: () => boolean
  getUserEditing: () => boolean
  getDataDir: () => string | null
  getInstallDir: () => string | null
  broadcast: (state: UpdateState) => void
  log: { info: (message: string) => void; error: (message: string) => void }
  setTimer: (callback: () => void, ms: number) => Timer
  clearTimer: (id: Timer) => void
}

export interface UpdateService {
  scheduleStartupCheck(): void
  downloadUpdate(): Promise<{ downloaded: boolean }>
  installUpdate(): Promise<{ installed: boolean } | { error: string }>
  openRelease(): string | undefined
  getState(): UpdateState
  dispose(): void
}

function parseVersion(version: string): number[] {
  return version
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number(part) || 0)
}

function isHigherVersion(a: string, b: string): boolean {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  const len = Math.max(va.length, vb.length)
  for (let i = 0; i < len; i += 1) {
    const x = va[i] ?? 0
    const y = vb[i] ?? 0
    if (x > y) {
      return true
    }
    if (x < y) {
      return false
    }
  }
  return false
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  setTimer: (callback: () => void, ms: number) => Timer,
  clearTimer: (id: Timer) => void
): Promise<T> {
  let timer: Timer | null = null
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimer(() => reject(new Error('Kiểm tra cập nhật hết giờ')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimer(timer)
    }
  })
}

export function createUpdateService(deps: UpdateServiceDeps): UpdateService {
  const {
    updater,
    isPackaged,
    isPortable,
    currentVersion,
    hasActiveAiTask,
    getUserEditing,
    getDataDir,
    getInstallDir,
    broadcast,
    log,
    setTimer,
    clearTimer
  } = deps

  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.allowPrerelease = false
  updaterAllowDowngrade(updater)

  updater.on('download-progress', (...args) => {
    const info = args[0] as { percent?: number } | undefined
    const percent = typeof info?.percent === 'number' ? info.percent : undefined
    if (percent !== undefined) {
      setState({ phase: 'downloading', percent })
    }
  })

  // electron-updater phát 'error' trên EventEmitter; không có listener sẽ ném lỗi
  // và có thể làm sập tiến trình main. Chỉ ghi log, không ném tiếp.
  updater.on('error', (...args) => {
    const error = args[0]
    const message = error instanceof Error ? error.message : String(error)
    log.error(`Update: ${message}`)
  })

  let state: UpdateState = {
    phase: 'idle',
    currentVersion,
    portable: isPortable,
    dataInsideInstallDir: computeDataInsideInstallDir()
  }

  let timer: Timer | null = null
  let checking = false

  function computeDataInsideInstallDir(): boolean | null {
    try {
      return computeDataInsideInstall(getDataDir(), getInstallDir())
    } catch {
      return null
    }
  }

  function setState(next: Partial<UpdateState>): void {
    state = { ...state, ...next, dataInsideInstallDir: computeDataInsideInstallDir() }
    broadcast(state)
  }

  function updaterAllowDowngrade(u: Updater): void {
    ;(u as unknown as { allowDowngrade: boolean }).allowDowngrade = false
  }

  function performCheck(): void {
    if (checking) {
      return
    }
    checking = true
    setState({ phase: 'checking' })

    void withTimeout(updater.checkForUpdates(), UPDATE_CHECK_TIMEOUT_MS, setTimer, clearTimer)
      .then((result) => {
        checking = false
        const info = result?.updateInfo
        if (info && info.version && isHigherVersion(info.version, currentVersion)) {
          log.info(`Update: bản hiện tại ${currentVersion}, bản mới ${info.version}`)
          setState({
            phase: 'available',
            latestVersion: info.version,
            // GitHub provider có thể không trả releaseUrl; dựng URL từ tag phiên bản.
            releaseUrl: info.releaseUrl ?? `${UPDATE_RELEASE_URL_BASE}/tag/v${info.version}`
          })
        } else {
          log.info('Update: đã là bản mới nhất')
          setState({ phase: 'idle' })
        }
      })
      .catch((error) => {
        checking = false
        const message = error instanceof Error ? error.message : String(error)
        log.error(`Update: ${message}`)
        // Lần dò tự động: chỉ log, không hiện lỗi cho người dùng, về idle.
        setState({ phase: 'idle' })
      })
  }

  return {
    scheduleStartupCheck(): void {
      if (!isPackaged) {
        log.info('Update: bỏ qua kiểm tra cập nhật (dev)')
        return
      }
      if (timer) {
        // Đã đặt timer, không đặt lần hai.
        return
      }
      log.info(`Update: sẽ kiểm tra sau ${UPDATE_CHECK_DELAY_MS / 1000} giây`)
      timer = setTimer(() => {
        performCheck()
      }, UPDATE_CHECK_DELAY_MS)
      try {
        ;(timer as unknown as { unref?: () => void }).unref?.()
      } catch {
        // unref không khả qui, bỏ qua.
      }
    },

    async downloadUpdate(): Promise<{ downloaded: boolean }> {
      if (isPortable || !state.latestVersion) {
        return { downloaded: false }
      }
      if (state.phase === 'downloading' || state.phase === 'downloaded') {
        return { downloaded: false }
      }
      setState({ phase: 'downloading', percent: 0 })

      try {
        await updater.downloadUpdate()
        setState({ phase: 'downloaded' })
        return { downloaded: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error(`Update: ${message}`)
        setState({ phase: 'error', message })
        return { downloaded: false }
      }
    },

    async installUpdate(): Promise<{ installed: boolean } | { error: string }> {
      if (hasActiveAiTask()) {
        return {
          error: 'Không thể khởi động lại khi Check News, Scan hoặc Chat đang chạy. Hãy chờ hoặc hủy tác vụ trước.'
        } as { installed: boolean } | { error: string }
      }
      if (getUserEditing()) {
        return { error: 'Không thể khởi động lại khi bạn đang chỉnh sửa dữ liệu. Hãy hoàn tất trước.' } as { installed: boolean } | { error: string }
      }
      // will-quit trong main/index.ts đóng database; không đóng thủ công ở đây.
      updater.quitAndInstall(true, true)
      return { installed: true } as { installed: boolean } | { error: string }
    },

    openRelease(): string | undefined {
      return state.releaseUrl
    },

    getState(): UpdateState {
      return { ...state }
    },

    dispose(): void {
      if (timer) {
        clearTimer(timer)
        timer = null
      }
      checking = false
    }
  }
}
