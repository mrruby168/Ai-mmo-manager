// TEST-ONLY (PROMPT-TEST-UPDATER-V0.1.3). File này sẽ bị gỡ ở Giai đoạn D.
import type { UpdateCheckResult } from 'electron-updater'

type UpdateFeed =
  | { provider: 'github'; owner: string; repo: string; releaseType: 'release' }
  | { provider: 'generic'; url: string }

/** Chỉ chấp nhận server cục bộ, không nhận domain ngoài. */
const LOCAL_FEED_PATTERN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/

export function resolveUpdateFeed(testFeed: string | undefined): UpdateFeed {
  if (testFeed && LOCAL_FEED_PATTERN.test(testFeed)) {
    return { provider: 'generic', url: testFeed }
  }
  return { provider: 'github', owner: 'mrruby168', repo: 'Ai-mmo-manager', releaseType: 'release' }
}

export interface FakeUpdater {
  checkForUpdates: () => Promise<UpdateCheckResult | null>
  downloadUpdate: () => Promise<string[]>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void
  emit: (event: string, ...args: unknown[]) => boolean
}

/**
 * Chỉ dùng ở chế độ dev để thử giao diện: không tải, không cài thật.
 * Trả về false khi không có MMO_FAKE_UPDATE hoặc không phải dev.
 */
export function applyFakeUpdater(
  updater: FakeUpdater,
  version: string | undefined,
  isDev: boolean,
  log: (message: string) => void
): boolean {
  if (!isDev || !version) {
    return false
  }
  log(`Update (TEST): giả lập phiên bản ${version} (không tải, không cài thật)`)
  updater.checkForUpdates = () => Promise.resolve({ updateInfo: { version } } as unknown as UpdateCheckResult)
  updater.downloadUpdate = async () => {
    for (const percent of [10, 40, 70, 100]) {
      updater.emit('download-progress', { percent })
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    return []
  }
  updater.quitAndInstall = () => {
    log('Update (TEST): bỏ qua cài đặt thật')
  }
  return true
}
