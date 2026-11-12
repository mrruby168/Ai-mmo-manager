/**
 * Hàm thuần chọn ứng viên logo + đọc kích thước ảnh từ header.
 * Tách khỏi logoService để test được không cần mạng và không cần Electron.
 */

export interface ImageSize {
  width: number
  height: number
}

/** Ảnh có cạnh nhỏ hơn ngưỡng này bị coi là favicon mờ, chỉ dùng khi không còn gì khác. */
export const MIN_LOGO_SIDE = 48

const MAX_CANDIDATES = 8

function matchAttribute(tag: string, attribute: string): string | null {
  const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i')
  const match = tag.match(pattern)
  return match ? match[1] : null
}

function resolveCandidateUrl(raw: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(raw, baseUrl)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null
    }
    return resolved.toString()
  } catch {
    return null
  }
}

function metaImageCandidates(html: string, pageUrl: string): string[] {
  const found: string[] = []
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? []
  // og:image trước, twitter:image sau (giữ thứ tự xuất hiện trong từng nhóm).
  for (const wanted of ['og:image', 'twitter:image']) {
    for (const tag of metaTags) {
      const property = (matchAttribute(tag, 'property') ?? matchAttribute(tag, 'name') ?? '').toLowerCase()
      if (property !== wanted) {
        continue
      }
      const content = matchAttribute(tag, 'content')
      const resolved = content ? resolveCandidateUrl(content, pageUrl) : null
      if (resolved) {
        found.push(resolved)
      }
    }
  }
  return found
}

interface IconCandidate {
  rel: string
  url: string
}

function iconCandidates(html: string, pageUrl: string): IconCandidate[] {
  const found: IconCandidate[] = []
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? []
  for (const tag of linkTags) {
    const rel = (matchAttribute(tag, 'rel') ?? '').toLowerCase()
    if (!rel.includes('icon')) {
      continue
    }
    const href = matchAttribute(tag, 'href')
    const resolved = href ? resolveCandidateUrl(href, pageUrl) : null
    if (resolved) {
      found.push({ rel, url: resolved })
    }
  }
  return found
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list)).slice(0, MAX_CANDIDATES)
}

/**
 * Website: apple-touch-icon (thường 180px) → og:image/twitter:image → favicon/icon.
 * Icon nhỏ vẫn nằm cuối danh sách để còn ảnh dùng khi trang không có ảnh lớn.
 */
export function extractWebsiteLogoCandidates(html: string, pageUrl: string): string[] {
  const icons = iconCandidates(html, pageUrl)
  const appleTouch = icons.filter((icon) => icon.rel.includes('apple-touch-icon')).map((icon) => icon.url)
  const plainIcons = icons.filter((icon) => !icon.rel.includes('apple-touch-icon')).map((icon) => icon.url)
  return dedupe([...appleTouch, ...metaImageCandidates(html, pageUrl), ...plainIcons])
}

/** Trang Discord/Telegram chỉ lấy ảnh xem trước (og:image/twitter:image), không lấy icon. */
export function extractSocialPreviewCandidates(html: string, pageUrl: string): string[] {
  return dedupe(metaImageCandidates(html, pageUrl))
}

/** Ảnh đại diện thật của tài khoản X: chỉ pbs.twimg.com + đường dẫn profile_images. */
export function isXProfileImageUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.toLowerCase() === 'pbs.twimg.com' &&
      parsed.pathname.includes('/profile_images/')
    )
  } catch {
    return false
  }
}

/**
 * Trang X: chỉ nhận ảnh xem trước trỏ tới pbs.twimg.com/.../profile_images.
 * Không bao giờ nhận <link rel="icon"> — đó chính là icon X chung.
 */
export function extractXLogoCandidates(html: string, pageUrl: string): string[] {
  return dedupe(metaImageCandidates(html, pageUrl).filter(isXProfileImageUrl))
}

export function isDiscordInviteUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }
    const host = parsed.hostname.toLowerCase()
    if (host === 'discord.gg') {
      return parsed.pathname.split('/').filter(Boolean).length >= 1
    }
    if (host === 'discord.com' || host === 'discordapp.com' || host === 'discordapp.gg') {
      return parsed.pathname.startsWith('/invite/') && parsed.pathname.length > '/invite/'.length
    }
    return false
  } catch {
    return false
  }
}

export function isTelegramProfileUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }
    const host = parsed.hostname.toLowerCase()
    if (host !== 't.me' && host !== 'telegram.me' && host !== 'www.t.me') {
      return false
    }
    const segments = parsed.pathname.split('/').filter(Boolean)
    return segments.length === 1 || (segments.length === 2 && segments[0] === 's')
  } catch {
    return false
  }
}

function readU16(bytes: Uint8Array, offset: number, littleEndian = false): number {
  if (offset + 2 > bytes.byteLength) {
    return 0
  }
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1]
}

function readU32(bytes: Uint8Array, offset: number, littleEndian = false): number {
  if (offset + 4 > bytes.byteLength) {
    return 0
  }
  return littleEndian
    ? (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
    : ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

function pngSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.byteLength < 24 || bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null
  }
  return { width: readU32(bytes, 16), height: readU32(bytes, 20) }
}

const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function jpegSize(bytes: Uint8Array): ImageSize | null {
  let offset = 2
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const segmentLength = readU16(bytes, offset + 2)
    if (segmentLength < 2) {
      return null
    }
    if (JPEG_SOF_MARKERS.has(marker)) {
      return { width: readU16(bytes, offset + 7), height: readU16(bytes, offset + 5) }
    }
    offset += 2 + segmentLength
  }
  return null
}

function webpSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.byteLength < 30) {
    return null
  }
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
  if (chunk === 'VP8X') {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
    return { width, height }
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
  }
  if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: readU16(bytes, 26, true) & 0x3fff, height: readU16(bytes, 28, true) & 0x3fff }
  }
  return null
}

/** Đọc kích thước từ header PNG/JPEG/WebP; không nhận dạng được thì trả null. */
export function parseImageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.byteLength < 2) {
    return null
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return pngSize(bytes)
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return jpegSize(bytes)
  }
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF') {
    return webpSize(bytes)
  }
  return null
}

/** Ảnh đủ lớn để làm logo (cả hai cạnh ≥ ngưỡng). */
export function isLargeEnough(size: ImageSize | null, minSide = MIN_LOGO_SIDE): boolean {
  return !!size && size.width >= minSide && size.height >= minSide
}
