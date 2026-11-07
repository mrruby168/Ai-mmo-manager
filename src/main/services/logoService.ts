import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { LIMITS } from '@shared/constants'
import { getCurrentLayout } from './dataPathService'
import { safeFetch, safeFetchImage } from './safeFetch'

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp'

export interface ImageType {
  mime: ImageMime
  extension: 'png' | 'jpg' | 'webp'
}

export class LogoError extends Error {
  readonly code: 'UNSUPPORTED_IMAGE' | 'TOO_LARGE' | 'NOT_FOUND'

  constructor(code: LogoError['code'], message: string) {
    super(message)
    this.name = 'LogoError'
    this.code = code
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50]

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.byteLength < signature.length) {
    return false
  }
  return signature.every((value, index) => bytes[index] === value)
}

export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return { mime: 'image/png', extension: 'png' }
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return { mime: 'image/jpeg', extension: 'jpg' }
  }
  if (
    bytes.byteLength > 12 &&
    startsWith(bytes, WEBP_RIFF) &&
    [0, 1, 2, 3].every((offset) => bytes[8 + offset] === WEBP_TAG[offset])
  ) {
    return { mime: 'image/webp', extension: 'webp' }
  }
  return null
}

function logosDirectory(): string {
  const directory = getCurrentLayout().logosDir
  mkdirSync(directory, { recursive: true })
  return directory
}

export function resolveLogoAbsolutePath(relativePath: string): string {
  return join(getCurrentLayout().root, relativePath)
}

function removeExistingLogos(projectId: string): void {
  const directory = logosDirectory()
  for (const extension of ['png', 'jpg', 'jpeg', 'webp']) {
    const candidate = join(directory, `${projectId}.${extension}`)
    if (existsSync(candidate)) {
      rmSync(candidate, { force: true })
    }
  }
}

function saveLogoBytes(projectId: string, bytes: Uint8Array): string {
  const type = detectImageType(bytes)
  if (!type) {
    throw new LogoError('UNSUPPORTED_IMAGE', 'Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP')
  }
  removeExistingLogos(projectId)
  const fileName = `${projectId}.${type.extension}`
  writeFileSync(join(logosDirectory(), fileName), bytes)
  return `logos/${fileName}`
}

export async function captureLogoFromFile(projectId: string, sourcePath: string): Promise<string> {
  if (!existsSync(sourcePath)) {
    throw new LogoError('NOT_FOUND', 'Không tìm thấy file ảnh đã chọn')
  }
  if (statSync(sourcePath).size > LIMITS.logoMaxBytes) {
    throw new LogoError('TOO_LARGE', 'Ảnh lớn hơn 2 MB')
  }
  const bytes = readFileSync(sourcePath)
  return saveLogoBytes(projectId, bytes)
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

function matchAttribute(tag: string, attribute: string): string | null {
  const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i')
  const match = tag.match(pattern)
  return match ? match[1] : null
}

export function extractLogoCandidates(html: string, pageUrl: string): string[] {
  const candidates: string[] = []
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? []

  for (const tag of linkTags) {
    const rel = (matchAttribute(tag, 'rel') ?? '').toLowerCase()
    if (!rel.includes('icon')) {
      continue
    }
    const href = matchAttribute(tag, 'href')
    if (href) {
      candidates.push(href)
    }
  }

  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of metaTags) {
    const property = (matchAttribute(tag, 'property') ?? matchAttribute(tag, 'name') ?? '').toLowerCase()
    if (property !== 'og:image' && property !== 'twitter:image') {
      continue
    }
    const content = matchAttribute(tag, 'content')
    if (content) {
      candidates.push(content)
    }
  }

  const resolved = candidates
    .map((candidate) => resolveCandidateUrl(candidate, pageUrl))
    .filter((value): value is string => value !== null)
  return Array.from(new Set(resolved)).slice(0, 6)
}

async function downloadFirstAvailable(candidates: string[]): Promise<Uint8Array | null> {
  for (const candidate of candidates) {
    try {
      const result = await safeFetchImage(candidate)
      if (detectImageType(result.bytes)) {
        return result.bytes
      }
    } catch {
      // Logo là tuỳ chọn: thử ứng viên kế tiếp, không làm hỏng thao tác chính.
    }
  }
  return null
}

function xHandleFromUrl(xUrl: string | undefined): string | null {
  if (!xUrl) {
    return null
  }
  try {
    const parsed = new URL(xUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    const handle = parsed.pathname.split('/').filter(Boolean)[0]
    if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
      return null
    }
    return handle
  } catch {
    return null
  }
}

async function fetchWebsiteLogo(website: string): Promise<Uint8Array | null> {
  try {
    const page = await safeFetch(website)
    const candidates = extractLogoCandidates(page.text, page.url)
    return await downloadFirstAvailable(candidates)
  } catch {
    return null
  }
}

async function fetchXLogo(xUrl: string | undefined): Promise<Uint8Array | null> {
  const handle = xHandleFromUrl(xUrl)
  if (!handle) {
    return null
  }
  try {
    const page = await safeFetch(`https://x.com/${handle}`)
    const candidates = extractLogoCandidates(page.text, page.url)
    return await downloadFirstAvailable(candidates)
  } catch {
    return null
  }
}

export async function fetchLogoForProject(input: {
  projectId: string
  website: string | null
  socialsX: string | null
}): Promise<string | null> {
  const bytes =
    (input.website ? await fetchWebsiteLogo(input.website) : null) ??
    (await fetchXLogo(input.socialsX ?? undefined))

  if (!bytes) {
    return null
  }
  return saveLogoBytes(input.projectId, bytes)
}

export function deleteLogoFile(relativePath: string | null): void {
  if (!relativePath) {
    return
  }
  try {
    rmSync(resolveLogoAbsolutePath(relativePath), { force: true })
  } catch {
    // Dọn logo thất bại không được chặn việc xóa dự án.
  }
}

export function logoMimeForPath(relativePath: string): ImageMime | null {
  switch (extname(relativePath).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    default:
      return null
  }
}
