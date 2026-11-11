/**
 * Keeps only the lines of a fetched page that can matter for airdrop / event
 * tracking (keywords, dates), plus the page head and one line of context.
 * Short pages are returned untouched.
 */

export const FOCUS_KEYWORDS: readonly string[] = [
  'airdrop',
  'claim',
  'snapshot',
  'deadline',
  'tge',
  'token generation',
  'whitelist',
  'allowlist',
  'listing',
  'launch',
  'season',
  'campaign',
  'quest',
  'reward',
  'eligible',
  'eligibility',
  'registration',
  'ends',
  'ending',
  'end date',
  'closes',
  'milestone',
  'testnet',
  'mainnet',
  'utc',
  'hạn',
  'kết thúc',
  'phần thưởng',
  'nhiệm vụ',
  'thời hạn'
]

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'
const DATE_PATTERN = new RegExp(
  [
    '\\b20\\d{2}[-/.]\\d{1,2}[-/.]\\d{1,2}\\b',
    '\\b\\d{1,2}[-/.]\\d{1,2}[-/.]20\\d{2}\\b',
    `\\b${MONTH}\\s+\\d{1,2}\\b`,
    `\\b\\d{1,2}\\s+${MONTH}\\b`
  ].join('|'),
  'i'
)

const MAX_LINE_CHARS = 600

export interface ExcerptOptions {
  maxChars: number
  keywords?: readonly string[]
  /** First lines of the page are always kept (title, intro). */
  headLines?: number
  /** Lines kept before and after every matching line. */
  context?: number
}

function clipLine(line: string): string {
  return line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line
}

export function extractRelevantText(text: string, options: ExcerptOptions): string {
  const maxChars = Math.max(200, options.maxChars)
  if (text.length <= maxChars) {
    return text
  }

  const keywords = (options.keywords ?? FOCUS_KEYWORDS).map((keyword) => keyword.toLowerCase())
  const headLines = Math.max(0, options.headLines ?? 8)
  const context = Math.max(0, options.context ?? 1)
  const lines = text.split('\n')

  const keep = new Set<number>()
  for (let index = 0; index < Math.min(headLines, lines.length); index += 1) {
    keep.add(index)
  }

  let matched = 0
  lines.forEach((line, index) => {
    const lower = line.toLowerCase()
    if (keywords.some((keyword) => lower.includes(keyword)) || DATE_PATTERN.test(line)) {
      matched += 1
      for (let offset = -context; offset <= context; offset += 1) {
        const target = index + offset
        if (target >= 0 && target < lines.length) {
          keep.add(target)
        }
      }
    }
  })

  // Nothing relevant found: the page may be a plain announcement, so fall back
  // to the beginning instead of returning an empty string.
  if (matched === 0) {
    return `${text.slice(0, maxChars)}\n[Đã cắt bớt: trang dài ${text.length} ký tự, không thấy từ khóa liên quan]`
  }

  const ordered = [...keep].sort((left, right) => left - right)
  const note = `\n[Đã lọc còn các dòng liên quan airdrop/deadline/milestone; trang gốc dài ${text.length} ký tự]`
  const budget = maxChars - note.length
  const parts: string[] = []
  let used = 0
  let previous = -2
  for (const index of ordered) {
    const line = clipLine(lines[index])
    const gap = index - previous > 1 && parts.length > 0 ? '…\n' : ''
    const cost = gap.length + line.length + 1
    if (used + cost > budget) {
      break
    }
    parts.push(`${gap}${line}`)
    used += cost
    previous = index
  }
  return `${parts.join('\n')}${note}`
}
