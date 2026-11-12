import { beforeEach, describe, expect, it, vi } from 'vitest'

const { broadcastToRenderers } = vi.hoisted(() => ({ broadcastToRenderers: vi.fn() }))

vi.mock('electron', () => ({ app: { getPath: () => process.cwd() } }))
vi.mock('../src/main/ipc/guard', () => ({ broadcastToRenderers }))

import {
  AI_LOG_MAX_ENTRIES,
  appendAiLog,
  beginAiLog,
  clearAiLogForTest,
  finishAiLog,
  getAiLog,
  setAiLogProgress
} from '../src/main/ai/aiActivityLog'

beforeEach(() => {
  clearAiLogForTest()
  broadcastToRenderers.mockClear()
})

describe('bộ đệm Activity Log', () => {
  it('bắt đầu tác vụ mới: xóa log cũ và phát sự kiện reset', () => {
    appendAiLog('news', 'step', 'dòng cũ')
    beginAiLog('news')

    expect(getAiLog('news').entries).toEqual([])
    expect(getAiLog('news').progress).toEqual({ done: 0, total: 0, running: true })
    expect(broadcastToRenderers).toHaveBeenLastCalledWith('ai:log', {
      channel: 'news',
      reset: true,
      entry: null,
      progress: { done: 0, total: 0, running: true }
    })
  })

  it('ghi thêm dòng và phát sự kiện kèm entry', () => {
    beginAiLog('news')
    appendAiLog('news', 'success', 'Lô 1: nhận 2 tin mới')

    const snapshot = getAiLog('news')
    expect(snapshot.entries).toHaveLength(1)
    expect(snapshot.entries[0]).toMatchObject({
      channel: 'news',
      level: 'success',
      text: 'Lô 1: nhận 2 tin mới'
    })
    expect(broadcastToRenderers).toHaveBeenLastCalledWith(
      'ai:log',
      expect.objectContaining({
        channel: 'news',
        reset: false,
        entry: expect.objectContaining({ level: 'success', text: 'Lô 1: nhận 2 tin mới' })
      })
    )
  })

  it('bộ đệm vòng chỉ giữ 200 dòng mới nhất', () => {
    beginAiLog('scan')
    for (let index = 0; index < AI_LOG_MAX_ENTRIES + 5; index += 1) {
      appendAiLog('scan', 'step', `dòng ${index}`)
    }

    const entries = getAiLog('scan').entries
    expect(entries).toHaveLength(AI_LOG_MAX_ENTRIES)
    expect(entries[0].text).toBe('dòng 5')
    expect(entries[entries.length - 1].text).toBe(`dòng ${AI_LOG_MAX_ENTRIES + 4}`)
  })

  it('cập nhật tiến trình và giữ trạng thái đang chạy', () => {
    beginAiLog('news')
    setAiLogProgress('news', 9, 12)

    expect(getAiLog('news').progress).toEqual({ done: 9, total: 12, running: true })
    expect(broadcastToRenderers).toHaveBeenLastCalledWith(
      'ai:log',
      expect.objectContaining({ reset: false, entry: null, progress: { done: 9, total: 12, running: true } })
    )
  })

  it('kết thúc tác vụ thì tắt trạng thái đang chạy nhưng giữ log', () => {
    beginAiLog('scan')
    appendAiLog('scan', 'success', 'Hoàn tất 4 dự án')
    finishAiLog('scan')

    expect(getAiLog('scan').progress.running).toBe(false)
    expect(getAiLog('scan').entries).toHaveLength(1)
  })

  it('không rò API key hoặc token vào log', () => {
    beginAiLog('chat')
    appendAiLog('chat', 'error', 'Gọi https://api.example.com/v1?key=sk-verysecret123456 thất bại')
    appendAiLog('chat', 'error', 'Authorization: Bearer abcdefgh12345678')

    const text = getAiLog('chat')
      .entries.map((entry) => entry.text)
      .join('\n')
    expect(text).not.toContain('sk-verysecret123456')
    expect(text).not.toContain('abcdefgh12345678')
    expect(text).toContain('key=***')
    expect(text).toContain('Bearer ***')
  })

  it('mỗi kênh có bộ đệm riêng', () => {
    beginAiLog('news')
    beginAiLog('scan')
    appendAiLog('news', 'step', 'tin')
    appendAiLog('scan', 'step', 'quét')

    expect(getAiLog('news').entries.map((entry) => entry.text)).toEqual(['tin'])
    expect(getAiLog('scan').entries.map((entry) => entry.text)).toEqual(['quét'])
  })
})
