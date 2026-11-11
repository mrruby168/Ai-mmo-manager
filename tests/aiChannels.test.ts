import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/main/ipc/guard', () => ({ broadcastToRenderers: vi.fn() }))
vi.mock('../src/main/services/logger', () => ({ logInfo: vi.fn(), logError: vi.fn() }))

import {
  acquireAiLock,
  beginUserEditing,
  canStartAiTask,
  endUserEditing,
  getLockState,
  getRunningAiTasks,
  LockError,
  onLockChanged,
  releaseAiLock,
  resetLockForTests
} from '../src/main/services/lockManager'
import { cancelAiChannel, cancelAiTask, runAiTask } from '../src/main/ai/aiTaskRunner'
import { aiCancelPayload } from '../src/main/ipc/payloadSchemas'
import { deriveRunningTasks, isChannelBusy } from '../src/shared/lockView'

beforeEach(() => {
  resetLockForTests()
})

describe('AI channels: lock manager', () => {
  it('runs different channels in parallel and rejects a second task on the same channel', () => {
    acquireAiLock('news-1', 'Check News', 'news')
    acquireAiLock('scan-1', 'Scan Project', 'scan')
    expect(getRunningAiTasks().map((task) => task.channel)).toEqual(['news', 'scan'])
    expect(getLockState().owner).toBe('ai')

    try {
      acquireAiLock('news-2', 'Check News', 'news')
      expect.unreachable('cùng kênh phải ném AI_BUSY')
    } catch (error) {
      expect(error).toBeInstanceOf(LockError)
      expect((error as LockError).code).toBe('AI_BUSY')
    }

    // Không truyền kênh = hành vi cũ: xung đột với mọi tác vụ đang chạy.
    expect(() => acquireAiLock('legacy-1', 'Tác vụ cũ')).toThrow(LockError)
    releaseAiLock('news-1')
    releaseAiLock('scan-1')
  })

  it('a task without a channel blocks every channel until released', () => {
    acquireAiLock('legacy-1', 'Tác vụ cũ')

    for (const channel of ['news', 'scan', 'chat'] as const) {
      expect(() => acquireAiLock(`${channel}-1`, channel, channel)).toThrow(LockError)
      expect(canStartAiTask(channel)).toEqual({ ok: false, reason: 'AI đang thực thi tác vụ khác' })
    }

    releaseAiLock('legacy-1')
    expect(getLockState().owner).toBe('none')
  })

  it('keeps owner "ai" until the last task ends and reports the oldest task', () => {
    acquireAiLock('news-1', 'Check News', 'news')
    acquireAiLock('scan-1', 'Scan Project', 'scan')

    expect(getLockState()).toMatchObject({ owner: 'ai', taskId: 'news-1', label: 'Check News' })

    releaseAiLock('news-1')
    expect(getLockState()).toMatchObject({ owner: 'ai', taskId: 'scan-1', label: 'Scan Project' })

    releaseAiLock('scan-1')
    expect(getLockState()).toEqual({
      owner: 'none',
      taskId: null,
      label: null,
      startedAt: null,
      userEditing: false
    })
  })

  it('does not emit when releasing an unknown task id', () => {
    const listener = vi.fn()
    const unsubscribe = onLockChanged(listener)
    acquireAiLock('news-1', 'Check News', 'news')
    expect(listener).toHaveBeenCalledTimes(1)

    releaseAiLock('khong-ton-tai')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getLockState().owner).toBe('ai')

    releaseAiLock('news-1')
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('checks availability per channel and still blocks everything while the user edits', () => {
    acquireAiLock('news-1', 'Check News', 'news')
    expect(canStartAiTask('chat')).toEqual({ ok: true })
    expect(canStartAiTask('news')).toEqual({ ok: false, reason: 'AI đang thực thi tác vụ khác' })
    releaseAiLock('news-1')

    beginUserEditing()
    for (const channel of ['news', 'scan', 'chat'] as const) {
      expect(canStartAiTask(channel)).toEqual({ ok: false, reason: 'Hoàn tất chỉnh sửa trước khi chạy AI' })
    }
    expect(() => acquireAiLock('chat-1', 'Chat Box', 'chat')).toThrow(/chỉnh sửa/)
    endUserEditing()
  })
})

describe('AI channels: cancel per channel', () => {
  it('aborts only the requested channel, while cancelAiTask still aborts everything', async () => {
    let newsAborted = false
    let scanAborted = false

    const news = runAiTask(
      'Check News',
      'news',
      (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            newsAborted = true
            resolve()
          })
        })
    )
    const scan = runAiTask(
      'Scan Project',
      'scan',
      (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            scanAborted = true
            resolve()
          })
        })
    )

    expect(getRunningAiTasks().map((task) => task.channel)).toEqual(['news', 'scan'])
    expect(cancelAiChannel('chat')).toBe(false)

    expect(cancelAiChannel('scan')).toBe(true)
    await scan
    expect(scanAborted).toBe(true)
    expect(newsAborted).toBe(false)
    expect(getLockState().owner).toBe('ai')

    expect(cancelAiTask()).toBe(true)
    await news
    expect(newsAborted).toBe(true)
    expect(getLockState().owner).toBe('none')
  })

  it('rejects a second task on the same channel through runAiTask', async () => {
    const first = runAiTask(
      'Check News',
      'news',
      (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve())
        })
    )

    await expect(
      runAiTask('Check News', 'news', () => new Promise<void>(() => {}))
    ).rejects.toBeInstanceOf(LockError)

    cancelAiTask()
    await first
  })
})

describe('AI channels: cancel payload schema', () => {
  it('accepts empty payloads and the three channels, rejects unknown channels', () => {
    expect(aiCancelPayload.parse(undefined)).toBeUndefined()
    expect(aiCancelPayload.parse({})).toEqual({})
    for (const channel of ['news', 'scan', 'chat'] as const) {
      expect(aiCancelPayload.parse({ channel })).toEqual({ channel })
    }
    expect(() => aiCancelPayload.parse({ channel: 'other' })).toThrow()
    expect(() => aiCancelPayload.parse('news')).toThrow()
  })
})

describe('AI channels: lock view helpers', () => {
  const legacyLock = {
    owner: 'ai' as const,
    taskId: 'news-1',
    label: 'Check News',
    startedAt: '2026-11-11T00:00:00.000Z',
    userEditing: false
  }

  it('prefers the tasks array and falls back to the legacy single task', () => {
    const tasks = [{ taskId: 'scan-1', channel: 'scan' as const, label: 'Scan Project', startedAt: 'x' }]
    expect(deriveRunningTasks({ ...legacyLock, tasks })).toBe(tasks)
    expect(deriveRunningTasks(legacyLock)).toEqual([
      { taskId: 'news-1', channel: null, label: 'Check News', startedAt: '2026-11-11T00:00:00.000Z' }
    ])
    expect(
      deriveRunningTasks({ owner: 'none', taskId: null, label: null, startedAt: null, userEditing: false })
    ).toEqual([])
  })

  it('marks a channel busy for its own tasks and for channel-less tasks', () => {
    const tasks = [
      { taskId: 'news-1', channel: 'news' as const, label: 'Check News', startedAt: 'x' },
      { taskId: 'chat-1', channel: 'chat' as const, label: 'Chat Box', startedAt: 'y' }
    ]
    expect(isChannelBusy(tasks, 'news')).toBe(true)
    expect(isChannelBusy(tasks, 'scan')).toBe(false)

    const legacyTasks = [{ taskId: 'legacy', channel: null, label: 'Tác vụ cũ', startedAt: 'z' }]
    expect(isChannelBusy(legacyTasks, 'scan')).toBe(true)
    expect(isChannelBusy([], 'scan')).toBe(false)
  })
})
