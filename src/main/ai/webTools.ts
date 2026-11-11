import { isHttpUrl } from '@shared/schemas'
import { extractRelevantText } from '@shared/pageExcerpt'
import { SafeFetchError, safeFetch } from '../services/safeFetch'

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, entity: string) => {
    const key = entity.toLowerCase()
    if (key.startsWith('#x') || key.startsWith('#X')) {
      const code = Number.parseInt(key.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return ENTITY_MAP[key] ?? match
  })
}

export function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  const withoutBlocks = withoutNoise
    .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|br|tr|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')

  const text = withoutBlocks.replace(/<[^>]+>/g, ' ')
  const decoded = decodeEntities(text)
  const lines = decoded
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)

  return lines.join('\n').trim()
}

export function wrapUntrustedWebContent(sourceUrl: string, content: string): string {
  return `<untrusted_web_content source="${sourceUrl.replace(/["<>]/g, '')}">\n${content}\n</untrusted_web_content>`
}

export interface WebFetchOptions {
  /** Keep only airdrop/deadline/milestone lines, up to `maxChars` (Scan and Check News). */
  focus?: { maxChars: number }
}

export async function webFetch(
  args: Record<string, unknown>,
  signal: AbortSignal,
  options: WebFetchOptions = {}
): Promise<string> {
  const rawUrl = typeof args.url === 'string' ? args.url.trim() : ''
  if (!isHttpUrl(rawUrl)) {
    return JSON.stringify({ error: 'URL không hợp lệ, chỉ nhận http:// hoặc https://' })
  }

  let fetched: Awaited<ReturnType<typeof safeFetch>>
  try {
    fetched = await safeFetch(rawUrl)
  } catch (error) {
    if (error instanceof SafeFetchError) {
      return JSON.stringify({ error: error.message, code: error.code })
    }
    return JSON.stringify({ error: 'Không tải được trang web' })
  }

  if (signal.aborted) {
    return JSON.stringify({ error: 'Đã hủy tác vụ AI' })
  }

  const isHtml = fetched.contentType === 'text/html'
  const body = isHtml ? htmlToText(fetched.text) : fetched.text.trim()
  const limited = options.focus
    ? extractRelevantText(body.slice(0, 200_000), { maxChars: options.focus.maxChars })
    : body.slice(0, 40_000)

  return wrapUntrustedWebContent(fetched.url, limited)
}
