/**
 * FIX 5 / 9c: nhận diện bài đăng X (Twitter) và suy ngày đăng từ status ID.
 * Công thức Snowflake: (id >> 22) + 1288834974657 (Twitter epoch).
 * Hàm thuần, không import Electron/Node, dùng được ở renderer và test.
 */

export const X_EPOCH_MS = 1288834974657

/**
 * D23: bật sau khi cổng kiểm chứng chạy đúng
 * `266031293945503744` -> `2012-11-07T04:16:17.756Z`.
 */
export const X_DATE_FROM_ID_ENABLED = true

const X_EPOCH_BIGINT = 1288834974657n
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/
/** Snowflake của Twitter nằm trong 63 bit; ID dài hơn là dữ liệu rác. */
const MAX_SNOWFLAKE = (1n << 63n) - 1n
const MIN_DATE_MS = Date.UTC(2006, 0, 1)
const FUTURE_TOLERANCE_MS = 7 * 86_400_000

export interface XStatusLink {
  handle: string
  statusId: string
}

function isXHost(host: string): boolean {
  const clean = host.toLowerCase().replace(/^www\./, '')
  return clean === 'x.com' || clean === 'twitter.com' || clean === 'mobile.twitter.com' || clean === 'm.twitter.com'
}

/** Handle không kèm `@`; nhận URL trang cá nhân, URL bài đăng, `@handle` hoặc handle trần. */
export function normalizeXHandle(raw: string | null | undefined): string | null {
  if (!raw) {
    return null
  }
  const value = raw.trim()
  if (value.length === 0) {
    return null
  }
  if (value.startsWith('@')) {
    const handle = value.slice(1)
    return HANDLE_PATTERN.test(handle) ? handle : null
  }
  if (HANDLE_PATTERN.test(value)) {
    return value
  }
  const status = parseXStatusUrl(value)
  if (status) {
    return status.handle
  }
  try {
    const url = new URL(value)
    if (!isXHost(url.hostname)) {
      return null
    }
    const handle = url.pathname.split('/').filter(Boolean)[0] ?? ''
    return HANDLE_PATTERN.test(handle) ? handle : null
  } catch {
    return null
  }
}

/** URL bài đăng X/Twitter -> handle + status ID; null với profile, domain khác hoặc URL hỏng. */
export function parseXStatusUrl(raw: string | null | undefined): XStatusLink | null {
  if (!raw) {
    return null
  }
  try {
    const url = new URL(raw.trim())
    if (!isXHost(url.hostname)) {
      return null
    }
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})(?:\/|$)/)
    if (!match) {
      return null
    }
    return { handle: match[1], statusId: match[2] }
  } catch {
    return null
  }
}

function safeIso(ms: number): string | null {
  if (!Number.isFinite(ms)) {
    return null
  }
  return new Date(ms).toISOString()
}

/**
 * Ngày đăng (ISO) suy từ status ID. Trả null khi tắt cổng, ID không phải số,
 * ID vượt 63 bit hoặc rơi ra ngoài khoảng 2006..hiện tại + 7 ngày.
 */
export function xDateFromStatusId(rawId: string | null | undefined): string | null {
  if (!X_DATE_FROM_ID_ENABLED || !rawId || !/^\d{1,20}$/.test(rawId)) {
    return null
  }
  try {
    const snowflake = BigInt(rawId)
    if (snowflake <= 0n || snowflake > MAX_SNOWFLAKE) {
      return null
    }
    const ms = Number((snowflake >> 22n) + X_EPOCH_BIGINT)
    if (ms < MIN_DATE_MS || ms > Date.now() + FUTURE_TOLERANCE_MS) {
      return null
    }
    return safeIso(ms)
  } catch {
    return null
  }
}
