import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() }
}))

import { normalizeSettings } from '../src/main/services/settingsStore'
import type { NewsScanSettings } from '../src/shared/types'
import { DEFAULT_NEWS_SCAN_SETTINGS } from '../src/shared/types'
import { newsCheckPayload, newsScanSavePayload } from '../src/main/ipc/payloadSchemas'

describe('newsScan settings normalisation (v0.1.4)', () => {
  it('settings.json cũ không có newsScan chạy y như trước: Full / 12 giờ / 3 ngày', () => {
    expect(normalizeSettings({ schemaVersion: 1 }).newsScan).toEqual(DEFAULT_NEWS_SCAN_SETTINGS)
    expect(normalizeSettings({ schemaVersion: 1 }).newsScan.defaultMode).toBe('full')
  })

  it('giữ cấu hình Daily hợp lệ', () => {
    const newsScan: NewsScanSettings = {
      defaultMode: 'daily',
      dailyMinIntervalHours: 24,
      dailyWindowDays: 2
    }
    expect(normalizeSettings({ schemaVersion: 1, newsScan }).newsScan).toEqual(newsScan)
  })

  it('giá trị lạ rơi về mặc định từng trường', () => {
    const newsScan = {
      defaultMode: 'weekly',
      dailyMinIntervalHours: 7,
      dailyWindowDays: 5
    } as unknown as NewsScanSettings
    expect(normalizeSettings({ schemaVersion: 1, newsScan }).newsScan).toEqual(DEFAULT_NEWS_SCAN_SETTINGS)
  })

  it('không làm mất các cấu hình cũ khác', () => {
    const settings = normalizeSettings({ schemaVersion: 1, aiMode: 'noai' })
    expect(settings.aiMode).toBe('noai')
    expect(settings.webSearch.provider).toBe('none')
  })
})

describe('payload IPC v0.1.4', () => {
  it('newsCheckPayload: thiếu payload hợp lệ, nhận mode và force', () => {
    expect(newsCheckPayload.parse({})).toEqual({})
    expect(newsCheckPayload.parse({ mode: 'daily' })).toEqual({ mode: 'daily' })
    expect(newsCheckPayload.parse({ mode: 'full', force: true })).toEqual({ mode: 'full', force: true })
  })

  it('newsCheckPayload: từ chối mode lạ', () => {
    expect(() => newsCheckPayload.parse({ mode: 'weekly' })).toThrow()
  })

  it('newsScanSavePayload: chỉ nhận giá trị cho phép trong enum', () => {
    expect(
      newsScanSavePayload.parse({
        newsScan: { defaultMode: 'daily', dailyMinIntervalHours: 12, dailyWindowDays: 3 }
      })
    ).toEqual({ newsScan: { defaultMode: 'daily', dailyMinIntervalHours: 12, dailyWindowDays: 3 } })

    expect(() =>
      newsScanSavePayload.parse({
        newsScan: { defaultMode: 'weekly', dailyMinIntervalHours: 12, dailyWindowDays: 3 }
      })
    ).toThrow()
    expect(() =>
      newsScanSavePayload.parse({
        newsScan: { defaultMode: 'daily', dailyMinIntervalHours: 6, dailyWindowDays: 3 }
      })
    ).toThrow()
    expect(() =>
      newsScanSavePayload.parse({
        newsScan: { defaultMode: 'daily', dailyMinIntervalHours: 12, dailyWindowDays: 7 }
      })
    ).toThrow()
  })
})
