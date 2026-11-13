/**
 * Hàm thuần cho bước "đọc bài viết → tìm danh sách dự án" của Scan Project.
 * Không import Electron/React để test được bằng node.
 */

export type ScanTextKind = 'json' | 'list' | 'article'

export interface ExtractedProject {
  name: string
  website: string | null
  xHandle: string | null
}

/** Số dự án tối đa quét trong một lần; phần dư bị bỏ và được báo ở log. */
export const SCAN_MAX_PROJECTS = 20
/** Số ký tự bài viết gửi cho AI trích xuất. */
export const SCAN_EXTRACT_MAX_CHARS = 30_000

const LIST_MAX_LINE = 60
const LIST_MAX_LINES = 40

/** Bỏ ký hiệu đầu dòng (`-`, `*`, `•`, `1.`, `2)`). */
export function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*•–]+|\d{1,3}[.)])\s+/, '').trim()
}

/**
 * Phân loại nội dung dán vào:
 * - json: bắt đầu bằng `[` hoặc `{`
 * - list: mỗi dòng là một tên ngắn, không có câu văn
 * - article: mọi thứ còn lại (bài viết, tin nhắn, đoạn văn)
 */
export function classifyScanText(text: string): ScanTextKind {
  const trimmed = text.trim()
  if (/^[[{]/.test(trimmed)) {
    return 'json'
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map(stripListMarker)
    .filter((line) => line.length > 0)
  if (lines.length === 0) {
    return 'list'
  }
  if (lines.length > LIST_MAX_LINES) {
    return 'article'
  }
  const looksLikeName = (line: string): boolean =>
    line.length <= LIST_MAX_LINE && !/[.!?:;]\s*$/.test(line) && line.split(/\s+/).length <= 8
  return lines.every(looksLikeName) ? 'list' : 'article'
}

/** Tên một dòng của danh sách: bỏ ký hiệu đầu dòng và khoảng trắng thừa. */
export function parseNameList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(stripListMarker)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 2 && line.length <= LIST_MAX_LINE)
}

export const SCAN_EXTRACT_SYSTEM_PROMPT = [
  'Bạn là trợ lý trích xuất danh sách dự án crypto/Web3 (Event MMO, Airdrop, testnet, DePIN, game…) từ một bài viết.',
  'Chỉ liệt kê dự án được bài viết giới thiệu như một cơ hội/dự án riêng. KHÔNG liệt kê: sàn giao dịch hay ví chỉ được nhắc qua, người, công ty đầu tư, tên token phổ biến (BTC, ETH), tên bài viết/kênh.',
  'Mỗi dự án chỉ một lần. Không bịa dự án không có trong bài. Nếu bài có link website hoặc tài khoản X của dự án thì ghi lại, không có thì để null.',
  'Trả về DUY NHẤT một JSON hợp lệ, không giải thích, không markdown, đúng dạng:',
  '{"projects":[{"name":"Tên dự án","website":"https://... hoặc null","xHandle":"handle không có @ hoặc null"}]}',
  `Tối đa ${SCAN_MAX_PROJECTS * 2} dự án, theo thứ tự xuất hiện trong bài.`
].join('\n')

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().toLowerCase() !== 'null' ? value.trim() : null
}

/**
 * Đọc đầu ra của AI: JSON thuần, JSON trong ```code fence```, hoặc JSON lẫn lời dẫn.
 * Không parse được JSON thì coi mỗi dòng là một tên (AI trả danh sách thường).
 */
export function parseExtractionOutput(raw: string): ExtractedProject[] {
  const text = raw.trim()
  if (text.length === 0) {
    return []
  }
  const unfenced = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim()
  const start = unfenced.search(/[[{]/)
  if (start >= 0) {
    const closing = unfenced[start] === '[' ? ']' : '}'
    const end = unfenced.lastIndexOf(closing)
    if (end > start) {
      try {
        const parsed = JSON.parse(unfenced.slice(start, end + 1)) as unknown
        const array = Array.isArray(parsed)
          ? parsed
          : parsed && typeof parsed === 'object' && Array.isArray((parsed as { projects?: unknown }).projects)
            ? (parsed as { projects: unknown[] }).projects
            : null
        if (array) {
          return array.flatMap((entry): ExtractedProject[] => {
            if (typeof entry === 'string') {
              const name = asText(entry)
              return name ? [{ name, website: null, xHandle: null }] : []
            }
            if (entry && typeof entry === 'object') {
              const record = entry as Record<string, unknown>
              const name = asText(record.name)
              return name
                ? [{ name, website: asText(record.website), xHandle: asText(record.xHandle) ?? asText(record.x) }]
                : []
            }
            return []
          })
        }
      } catch {
        // rơi xuống nhánh danh sách dòng bên dưới
      }
    }
  }
  return parseNameList(unfenced).map((name) => ({ name, website: null, xHandle: null }))
}

/** Handle X viết thường, không `@`; nhận handle trần hoặc URL x.com/twitter.com. */
export function handleKey(raw: string | null | undefined): string | null {
  if (!raw) {
    return null
  }
  const match = raw.trim().match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/@?([A-Za-z0-9_]{1,15})(?:[/?#].*)?$/i)
  const handle = match ? match[1] : raw.trim().replace(/^@/, '')
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle.toLowerCase() : null
}

/**
 * Giới hạn số dự án cần quét. Trả về phần giữ lại + số bị bỏ để báo ở log,
 * thay vì cắt im lặng.
 */
export function capProjects<T>(items: readonly T[], max: number = SCAN_MAX_PROJECTS): { kept: T[]; dropped: number } {
  return { kept: items.slice(0, max), dropped: Math.max(0, items.length - max) }
}
