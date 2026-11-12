import { describe, expect, it } from 'vitest'
import {
  extractSocialPreviewCandidates,
  extractWebsiteLogoCandidates,
  extractXLogoCandidates,
  isDiscordInviteUrl,
  isLargeEnough,
  isTelegramProfileUrl,
  isXProfileImageUrl,
  parseImageSize
} from '../src/shared/logoPick'

const WEBSITE_URL = 'https://example.com/'

function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width, false)
  view.setUint32(20, height, false)
  return bytes
}

describe('extractWebsiteLogoCandidates', () => {
  it('orders apple-touch-icon before og:image and favicon', () => {
    const html = `
      <link rel="icon" sizes="16x16" href="/favicon.ico">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
      <meta property="og:image" content="https://cdn.example.com/cover.png">
    `
    expect(extractWebsiteLogoCandidates(html, WEBSITE_URL)).toEqual([
      'https://example.com/apple-touch-icon.png',
      'https://cdn.example.com/cover.png',
      'https://example.com/favicon.ico'
    ])
  })

  it('uses twitter:image when og:image is missing and ignores non-http candidates', () => {
    const html = `
      <meta name="twitter:image" content="/preview.png">
      <link rel="icon" href="data:image/png;base64,AAAA">
    `
    expect(extractWebsiteLogoCandidates(html, WEBSITE_URL)).toEqual(['https://example.com/preview.png'])
  })

  it('returns an empty list when the page has no image at all', () => {
    expect(extractWebsiteLogoCandidates('<html><body>hi</body></html>', WEBSITE_URL)).toEqual([])
  })
})

describe('extractXLogoCandidates', () => {
  it('rejects the shared X icon and accepts a real profile image', () => {
    const html = `
      <link rel="shortcut icon" href="https://abs.twimg.com/favicons/twitter.3.ico">
      <meta property="og:image" content="https://pbs.twimg.com/profile_images/1234567890/abcdef_400x400.jpg">
      <meta name="twitter:image" content="https://abs.twimg.com/icon.png">
    `
    expect(extractXLogoCandidates(html, 'https://x.com/example')).toEqual([
      'https://pbs.twimg.com/profile_images/1234567890/abcdef_400x400.jpg'
    ])
  })

  it('returns nothing when the X page only carries the generic icon', () => {
    const html = `
      <link rel="shortcut icon" href="https://abs.twimg.com/favicons/twitter.3.ico">
      <link rel="apple-touch-icon" href="https://abs.twimg.com/apple-touch-icon.png">
    `
    expect(extractXLogoCandidates(html, 'https://x.com/example')).toEqual([])
  })

  it('rejects profile-image lookalikes on other hosts', () => {
    expect(isXProfileImageUrl('https://cdn.example.com/profile_images/a.jpg')).toBe(false)
    expect(isXProfileImageUrl('https://pbs.twimg.com/media/a.jpg')).toBe(false)
    expect(isXProfileImageUrl('https://pbs.twimg.com/profile_images/a.jpg')).toBe(true)
  })
})

describe('extractSocialPreviewCandidates', () => {
  it('only takes preview images, never icons', () => {
    const html = `
      <link rel="icon" href="/icon.png">
      <meta property="og:image" content="https://cdn.discordapp.com/icons/1/a.png">
    `
    expect(extractSocialPreviewCandidates(html, 'https://discord.gg/abc')).toEqual([
      'https://cdn.discordapp.com/icons/1/a.png'
    ])
  })
})

describe('social url guards', () => {
  it('accepts only clear Discord invite links', () => {
    expect(isDiscordInviteUrl('https://discord.gg/abcd')).toBe(true)
    expect(isDiscordInviteUrl('https://discord.com/invite/abcd')).toBe(true)
    expect(isDiscordInviteUrl('https://discord.com/channels/1/2')).toBe(false)
    expect(isDiscordInviteUrl('https://example.com/invite/abcd')).toBe(false)
  })

  it('accepts only Telegram profile links', () => {
    expect(isTelegramProfileUrl('https://t.me/example')).toBe(true)
    expect(isTelegramProfileUrl('https://telegram.me/example')).toBe(true)
    expect(isTelegramProfileUrl('https://t.me/example/123')).toBe(false)
    expect(isTelegramProfileUrl('https://example.com/t.me/example')).toBe(false)
  })
})

describe('parseImageSize', () => {
  it('reads PNG width and height from IHDR', () => {
    expect(parseImageSize(pngBytes(180, 180))).toEqual({ width: 180, height: 180 })
  })

  it('reads JPEG size from the SOF0 segment', () => {
    const bytes = new Uint8Array(20)
    bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08], 0)
    const view = new DataView(bytes.buffer)
    view.setUint16(13, 360, false)
    view.setUint16(15, 480, false)
    expect(parseImageSize(bytes)).toEqual({ width: 480, height: 360 })
  })

  it('returns null for unknown or truncated data', () => {
    expect(parseImageSize(new Uint8Array([0x47, 0x49, 0x46]))).toBeNull()
    expect(parseImageSize(new Uint8Array([0x89, 0x50]))).toBeNull()
    expect(parseImageSize(new Uint8Array(0))).toBeNull()
  })

  it('treats small favicons as not large enough', () => {
    expect(isLargeEnough(parseImageSize(pngBytes(16, 16)))).toBe(false)
    expect(isLargeEnough(parseImageSize(pngBytes(180, 180)))).toBe(true)
    expect(isLargeEnough(null)).toBe(false)
  })
})
