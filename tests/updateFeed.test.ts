// TEST-ONLY (PROMPT-TEST-UPDATER-V0.1.3). File này sẽ bị gỡ ở Giai đoạn D.
import { describe, expect, it, vi } from 'vitest'
import { applyFakeUpdater, resolveUpdateFeed } from '../src/main/services/updateFeed'

describe('updateFeed (test hook)', () => {
  it('không đặt MMO_TEST_UPDATE_URL thì dùng feed GitHub', () => {
    const feed = resolveUpdateFeed(undefined)
    expect(feed).toEqual({
      provider: 'github',
      owner: 'mrruby168',
      repo: 'Ai-mmo-manager',
      releaseType: 'release'
    })
  })

  it('chấp nhận server cục bộ 127.0.0.1 và localhost', () => {
    expect(resolveUpdateFeed('http://127.0.0.1:8080')).toEqual({ provider: 'generic', url: 'http://127.0.0.1:8080' })
    expect(resolveUpdateFeed('http://localhost:3000/')).toEqual({ provider: 'generic', url: 'http://localhost:3000/' })
  })

  it('từ chối URL ngoài, https và dải LAN', () => {
    for (const url of ['https://example.com', 'http://192.168.1.10:8080', 'http://127.0.0.1.evil.com']) {
      expect(resolveUpdateFeed(url).provider).toBe('github')
    }
  })

  it('không giả lập khi thiếu biến hoặc không phải dev', () => {
    const updater = makeFakeUpdater()
    expect(applyFakeUpdater(updater, undefined, true, vi.fn())).toBe(false)
    expect(applyFakeUpdater(updater, '0.9.9', false, vi.fn())).toBe(false)
    expect(updater.checkForUpdates).toBe(updater.originalCheck)
  })

  it('giả lập phát available rồi tiến trình 10/40/70/100 và không cài thật', async () => {
    const updater = makeFakeUpdater()
    const log = vi.fn()
    expect(applyFakeUpdater(updater, '0.9.9', true, log)).toBe(true)

    const result = (await updater.checkForUpdates()) as unknown as { updateInfo: { version: string } }
    expect(result.updateInfo.version).toBe('0.9.9')

    await updater.downloadUpdate()
    const percents = updater.emit.mock.calls
      .filter(([event]) => event === 'download-progress')
      .map(([, payload]) => (payload as { percent: number }).percent)
    expect(percents).toEqual([10, 40, 70, 100])

    updater.quitAndInstall(true, true)
    expect(log).toHaveBeenCalledWith('Update (TEST): bỏ qua cài đặt thật')
  })
})

function makeFakeUpdater() {
  const originalCheck = vi.fn(() => Promise.resolve(null))
  return {
    originalCheck,
    checkForUpdates: originalCheck,
    downloadUpdate: vi.fn(() => Promise.resolve([])),
    quitAndInstall: vi.fn(),
    emit: vi.fn((_event: string, ..._args: unknown[]) => true)
  }
}
