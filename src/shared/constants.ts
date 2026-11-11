export const PROJECT_CATEGORIES = ['event_mmo', 'airdrop'] as const
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number]

export const PROJECT_STATUSES = ['not_joined', 'in_progress', 'completed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const COST_TYPES = ['free', 'paid', 'unverified'] as const
export type CostType = (typeof COST_TYPES)[number]

export const VERIFICATION_STATES = ['verified', 'unverified'] as const
export type VerificationState = (typeof VERIFICATION_STATES)[number]

export const PROJECT_ORIGINS = ['manual', 'scan', 'chat', 'import'] as const
export type ProjectOrigin = (typeof PROJECT_ORIGINS)[number]

export const REWARD_KINDS = ['cash', 'token', 'points'] as const
export type RewardKind = (typeof REWARD_KINDS)[number]

export const CLAIM_STATUSES = ['pending', 'claimable', 'claimed'] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

export const NEWS_KINDS = ['important', 'todo'] as const
export type NewsKind = (typeof NEWS_KINDS)[number]

export const MILESTONE_KINDS = ['end', 'snapshot', 'claim', 'whitelist', 'tge', 'listing', 'other'] as const
export type MilestoneKind = (typeof MILESTONE_KINDS)[number]

/** D2: app cung cấp Web Search cho Check News khi Model không có tìm kiếm gốc. */
export const WEB_SEARCH_PROVIDERS = ['none', 'tavily', 'brave', 'searxng'] as const
export type WebSearchProvider = (typeof WEB_SEARCH_PROVIDERS)[number]

export const RISK_LEVELS = ['low', 'medium', 'high', 'unknown'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const PROVIDER_TYPES = ['openai', 'anthropic', 'opencode', 'google', 'custom'] as const
export type ProviderType = (typeof PROVIDER_TYPES)[number]

export const AI_MODES = ['ai', 'noai'] as const
export type AiMode = (typeof AI_MODES)[number]

export const LOCK_POLICY = {
  allowedWhileAiBusy: ['open_external_link', 'open_project_detail']
} as const

export const LIMITS = {
  scanInputMaxBytes: 1_000_000,
  importMaxBytes: 10 * 1024 * 1024,
  logoMaxBytes: 2_000_000,
  webFetchMaxBytes: 2_000_000,
  webFetchTimeoutMs: 15_000,
  webFetchMaxRedirects: 5,
  newsSummaryMaxLength: 280,
  aiToolResultMaxChars: 20_000,
  aiMaxSteps: 30,
  pendingActionTtlMs: 30 * 60 * 1000,
  logMaxBytes: 2 * 1024 * 1024
} as const

export const DEADLINE_WINDOWS = {
  urgentDays: 3,
  soonDays: 14
} as const

export const FONT_SIZE_RANGE = { min: 12, defaultValue: 16, max: 20 } as const
export const FONT_WEIGHT_RANGE = { min: 300, defaultValue: 400, max: 700 } as const

export const UPDATE_CHECK_DELAY_MS = 60_000
export const UPDATE_CHECK_TIMEOUT_MS = 20_000
/** Chỉ cho phép mở link Release thuộc repo này. */
export const UPDATE_RELEASE_URL_BASE = 'https://github.com/mrruby168/Ai-mmo-manager/releases'

export const DEFAULT_FONT_FAMILY = 'Segoe UI, system-ui, -apple-system, sans-serif'

/**
 * Kiểm tra đường dẫn `child` có nằm bên trong thư mục `parent` hay không.
 * Chuẩn hóa dấu gạch chéo Windows, không phân biệt hoa thường, chống thoát `..`.
 */
export function isPathInside(child: string, parent: string): boolean {
  const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase()
  const resolveSegments = (p: string): string[] => {
    const resolved: string[] = []
    for (const part of p.split('/')) {
      if (!part || part === '.') {
        continue
      }
      if (part === '..') {
        resolved.pop()
      } else {
        resolved.push(part)
      }
    }
    return resolved
  }
  const c = resolveSegments(normalize(child)).join('/')
  const p = resolveSegments(normalize(parent)).join('/')
  return c === p || c.startsWith(p + '/')
}

/**
 * Kiểm tra thư mục dữ liệu có nằm trong thư mục cài đặt hay không.
 * Trả null nếu thiếu thông tin (không xác định được).
 */
export function computeDataInsideInstall(dataDir: string | null | undefined, installDir: string | null | undefined): boolean | null {
  if (!dataDir || !dataDir.trim() || !installDir || !installDir.trim()) {
    return null
  }
  return isPathInside(dataDir, installDir)
}

export const SAFE_FONT_FAMILIES = [
  'Segoe UI, system-ui, -apple-system, sans-serif',
  'Arial, Helvetica, sans-serif',
  'Calibri, Candara, sans-serif',
  'Tahoma, Geneva, sans-serif',
  'Verdana, Geneva, sans-serif',
  'Consolas, "Cascadia Mono", monospace'
] as const
