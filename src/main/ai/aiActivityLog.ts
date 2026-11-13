import { EVENTS } from '@shared/ipc-channels'
import type { AiChannel, AiLogEntry, AiLogLevel, AiLogProgress, AiLogSnapshot } from '@shared/types'
import { normalizeLogText } from '@shared/aiLog'
import { broadcastToRenderers } from '../ipc/guard'

/**
 * FIX 3: bộ đệm vòng Activity Log theo từng kênh (news/scan/chat).
 * Chỉ sống trong bộ nhớ: khởi động lại app là mất, đúng như thiết kế.
 */
export const AI_LOG_MAX_ENTRIES = 200

const buffers = new Map<AiChannel, AiLogEntry[]>()
const progresses = new Map<AiChannel, AiLogProgress>()
let sequence = 0

function bufferFor(channel: AiChannel): AiLogEntry[] {
  let buffer = buffers.get(channel)
  if (!buffer) {
    buffer = []
    buffers.set(channel, buffer)
  }
  return buffer
}

function progressFor(channel: AiChannel): AiLogProgress {
  return progresses.get(channel) ?? { done: 0, total: 0, running: false }
}

function emit(channel: AiChannel, reset: boolean, entry: AiLogEntry | null): void {
  broadcastToRenderers(EVENTS.aiLog, {
    channel,
    reset,
    entry,
    progress: progressFor(channel)
  })
}

/** Bắt đầu tác vụ mới: xóa log cũ của kênh và bật trạng thái đang chạy. */
export function beginAiLog(channel: AiChannel): void {
  buffers.set(channel, [])
  progresses.set(channel, { done: 0, total: 0, running: true })
  emit(channel, true, null)
}

/** Ghi thêm một dòng; dòng rỗng sau khi chuẩn hóa (hoặc toàn bí mật) thì bỏ. */
export function appendAiLog(channel: AiChannel, level: AiLogLevel, text: string): void {
  const normalized = normalizeLogText(text)
  if (normalized.length === 0) {
    return
  }
  sequence += 1
  const entry: AiLogEntry = {
    id: `log-${sequence}`,
    channel,
    at: new Date().toISOString(),
    level,
    text: normalized
  }
  const buffer = bufferFor(channel)
  buffer.push(entry)
  if (buffer.length > AI_LOG_MAX_ENTRIES) {
    buffer.splice(0, buffer.length - AI_LOG_MAX_ENTRIES)
  }
  emit(channel, false, entry)
}

/** Cập nhật thanh tiến trình của kênh. */
export function setAiLogProgress(channel: AiChannel, done: number, total: number): void {
  const safeDone = Number.isFinite(done) ? Math.max(0, Math.floor(done)) : 0
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  progresses.set(channel, {
    done: safeDone,
    total: safeTotal,
    running: progressFor(channel).running
  })
  emit(channel, false, null)
}

/** Tác vụ kết thúc (thành công, lỗi hoặc bị hủy): tắt trạng thái đang chạy. */
export function finishAiLog(channel: AiChannel): void {
  const current = progressFor(channel)
  progresses.set(channel, { ...current, running: false })
  emit(channel, false, null)
}

/** Log hiện tại của kênh, dùng cho IPC `ai:getLog` khi mở/chuyển tab. */
export function getAiLog(channel: AiChannel): AiLogSnapshot {
  return {
    entries: [...bufferFor(channel)],
    progress: progressFor(channel)
  }
}

/** Chỉ dùng trong test: xóa toàn bộ trạng thái trong bộ nhớ. */
export function clearAiLogForTest(): void {
  buffers.clear()
  progresses.clear()
  sequence = 0
}
