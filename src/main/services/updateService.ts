import type { UpdateState } from '@shared/types'
import { UPDATE_CHECK_DELAY_MS, UPDATE_CHECK_TIMEOUT_MS } from '@shared/constants'

type Updater = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  checkForUpdates(): Promise<{ updateInfo?: { version: string; releaseUrl?: string } } | null>
  downloadUpdate(): Promise<string[]>
  quitAndInstall(): void
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
  closeDatabase: () => void
  broadcast: (state: UpdateState) => void
  log: { info: (message: string) => void; error: (message: string) => void }
  setTimer: (callback: () => void, ms: number) => Timer
  clearTimer: (id: Timer) => void
}

export interface UpdateService {
  scheduleStartupCheck(): void
  checkForUpdates(): Promise<UpdateState>
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
    closeDatabase,
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

  let state: UpdateState = {
    phase: 'idle',
    currentVersion,
    portable: isPortable
  }

  let timer: Timer | null = null
  let checking = false

  function setState(next: Partial<UpdateState>): void {
    state = { ...state, ...next }
    broadcast(state)
  }

  function updaterAllowDowngrade(u: Updater): void {
    ;(u as unknown as { allowDowngrade: boolean }).allowDowngrade = false
  }

  function performCheck(auto: boolean): UpdateState {
    if (checking) {
      return state
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
            releaseUrl: info.releaseUrl
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
        if (auto) {
          // Lần dò tự động: chỉ log, không hiện lỗi cho người dùng, về idle.
          setState({ phase: 'idle' })
        } else {
          // Lần dò thủ công: báo lỗi cho người dùng.
          setState({ phase: 'error', message })
        }
      })

    return state
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
      log.info('Update: sẽ kiểm tra sau 60 giây')
      timer = setTimer(() => {
        performCheck(true)
      }, UPDATE_CHECK_DELAY_MS)
      try {
        ;(timer as unknown as { unref?: () => void }).unref?.()
      } catch {
        // unref không khả qui, bỏ qua.
      }
    },

    async checkForUpdates(): Promise<UpdateState> {
      // Lần dò thủ công: báo lỗi cho người dùng khi thất bại (auto = false).
      performCheck(false)
      return this.getState()
    },

    async downloadUpdate(): Promise<{ downloaded: boolean }> {
      if (state.phase !== 'available' || isPortable) {
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
      closeDatabase()
      updater.quitAndInstall()
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
