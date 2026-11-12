import type { AiChannel, AiLogLevel } from './types'

/**
 * FIX 3: hàm thuần cho Activity Log của News/Scan/Chat.
 * Không import Electron/React để test được bằng node.
 */

/** Ký hiệu đứng trước mỗi dòng log. */
export const AI_LOG_LEVEL_SYMBOL: Record<AiLogLevel, string> = {
  online: '●',
  step: '›',
  success: '✓',
  warn: '!',
  error: '×'
}

/** Nhóm màu của dòng log; renderer ánh xạ sang class CSS. */
export type AiLogTone = 'info' | 'muted' | 'success' | 'warning' | 'error'

export const AI_LOG_LEVEL_TONE: Record<AiLogLevel, AiLogTone> = {
  online: 'info',
  step: 'muted',
  success: 'success',
  warn: 'warning',
  error: 'error'
}

/** Độ dài tối đa của một dòng log sau khi chuẩn hóa. */
export const AI_LOG_MAX_TEXT_LENGTH = 200

/**
 * Xóa mọi chuỗi có thể là bí mật trước khi ghi log:
 * API key dạng `sk-…`/`AIza…`, header Bearer và tham số bí mật trong URL.
 */
export function redactSecrets(text: string): string {
  let result = text
  result = result.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
  result = result.replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***')
  result = result.replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, 'Bearer ***')
  result = result.replace(
    /([?&](?:key|api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|secret|auth)=)[^&\s"'<>]+/gi,
    '$1***'
  )
  return result
}

/**
 * Mỗi dòng log luôn là một dòng: gộp khoảng trắng/xuống dòng, xóa bí mật,
 * cắt còn tối đa `maxLength` ký tự. Chuỗi rỗng sau khi chuẩn hóa thì bỏ.
 */
export function normalizeLogText(text: string, maxLength: number = AI_LOG_MAX_TEXT_LENGTH): string {
  const collapsed = redactSecrets(text).replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0) {
    return ''
  }
  if (collapsed.length <= maxLength) {
    return collapsed
  }
  return `${collapsed.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

/** Chỉ giữ origin + path của URL để log không lộ query string có token. */
export function safeUrlForLog(raw: string): string {
  try {
    const url = new URL(raw)
    return `${url.origin}${url.pathname}`
  } catch {
    return raw.split('?')[0] ?? raw
  }
}

/** Phần trăm tiến trình, kẹp trong 0–100; tổng bằng 0 thì trả 0. */
export function progressPercent(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)))
}

/**
 * Nhãn tiến trình: News đếm theo dự án ("9/12 dự án"),
 * Scan/Chat hiển thị phần trăm ("60%").
 */
export function formatLogProgress(channel: AiChannel, done: number, total: number): string {
  const safeDone = Number.isFinite(done) ? Math.max(0, Math.floor(done)) : 0
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  if (channel === 'news') {
    return `${safeDone}/${safeTotal} dự án`
  }
  return `${progressPercent(safeDone, safeTotal)}%`
}
