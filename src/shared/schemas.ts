import { z } from 'zod'
import {
  AI_MODES,
  CLAIM_STATUSES,
  COST_TYPES,
  FONT_SIZE_RANGE,
  FONT_WEIGHT_RANGE,
  MILESTONE_KINDS,
  NEWS_KINDS,
  PROJECT_CATEGORIES,
  PROJECT_STATUSES,
  PROVIDER_TYPES,
  REWARD_KINDS,
  RISK_LEVELS,
  SAFE_FONT_FAMILIES,
  VERIFICATION_STATES
} from './constants'

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(isHttpUrl, 'URL phải bắt đầu bằng http:// hoặc https://')

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .nullable()
  .optional()
  .refine((value) => !value || isHttpUrl(value), 'URL phải bắt đầu bằng http:// hoặc https://')

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')

export const socialLinksSchema = z.object({
  x: optionalUrl,
  discord: optionalUrl,
  telegram: optionalUrl,
  other: z.array(httpUrl).max(10).optional()
})

export const projectImportItemSchema = z
  .object({
    category: z.enum(PROJECT_CATEGORIES),
    name: z.string().trim().min(1, 'Tên dự án không được rỗng').max(200),
    website: optionalUrl,
    socials: socialLinksSchema.optional(),
    taskSummary: z.string().max(5000).optional(),
    howToJoin: z.string().max(5000).optional(),
    startDate: dateOnly.nullable().optional(),
    endDate: dateOnly.nullable().optional(),
    costType: z.enum(COST_TYPES).optional(),
    costAmountUsd: z.number().min(0).max(1_000_000).nullable().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    verification: z.enum(VERIFICATION_STATES).optional(),
    sources: z.array(httpUrl).max(20).optional(),
    notes: z.string().max(20_000).optional()
  })
  .superRefine((value, ctx) => {
    if (value.costType === 'paid' && (value.costAmountUsd === null || value.costAmountUsd === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['costAmountUsd'], message: 'Dự án có phí phải nhập số tiền USD' })
    }
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Ngày kết thúc phải sau ngày bắt đầu' })
    }
  })

export const projectImportSchema = z.object({
  schemaVersion: z.literal('1.0'),
  projects: z.array(projectImportItemSchema).min(1).max(500)
})

export const scanItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    category: z.enum(['event_mmo', 'airdrop', 'insufficient']),
    website: optionalUrl,
    summary: z.string().max(2000).default(''),
    taskSummary: z.string().max(5000).default(''),
    howToJoin: z.string().max(5000).default(''),
    startDate: dateOnly.nullable().optional(),
    endDate: dateOnly.nullable().optional(),
    costType: z.enum(COST_TYPES).default('unverified'),
    costAmountUsd: z.number().min(0).max(1_000_000).nullable().optional(),
    riskLevel: z.enum(RISK_LEVELS).default('unknown'),
    riskReason: z.string().max(1000).nullable().optional(),
    potential: z.string().max(1000).nullable().optional(),
    verification: z.enum(VERIFICATION_STATES).default('unverified'),
    sources: z.array(httpUrl).max(20).default([]),
    duplicateOf: z.string().max(200).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.costType === 'paid' && (value.costAmountUsd === null || value.costAmountUsd === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['costAmountUsd'], message: 'Dự án có phí phải có số tiền USD' })
    }
  })

export const scanResultSchema = z.object({
  items: z.array(scanItemSchema).max(200)
})

export const newsItemSchema = z.object({
  projectId: z.string().min(1).max(64),
  kind: z.enum(NEWS_KINDS),
  summary: z.string().trim().min(1).max(280),
  verification: z.enum(VERIFICATION_STATES),
  sourceUrl: httpUrl,
  sourceName: z.string().max(200).optional(),
  publishedAt: z.string().min(1).max(64),
  todoDeadline: dateOnly.nullable().optional(),
  milestoneKind: z.enum(MILESTONE_KINDS).nullable().optional(),
  milestoneDate: dateOnly.nullable().optional()
})

export const newsResultSchema = z.object({
  items: z.array(newsItemSchema).max(500)
})

/**
 * 9c: schema nhận từ model. Bài X được phép thiếu `publishedAt` vì app suy
 * ngày từ status ID; sau khi suy vẫn phải qua `newsItemSchema` nghiêm ngặt.
 */
export const newsSubmissionItemSchema = newsItemSchema.extend({
  publishedAt: z.string().max(64).optional(),
  /** Ghi chú ngắn của model cho tin này (không lưu vào DB). */
  notes: z.string().max(200).optional()
})

export const newsSubmissionResultSchema = z.object({
  items: z.array(newsSubmissionItemSchema).max(500),
  /** 9d: model giải thích ngắn đã tìm gì, đặc biệt khi items rỗng. */
  notes: z.string().max(200).optional()
})

/**
 * FIX 1: hand-entered news in No AI Mode. `sourceUrl` is optional here because
 * the user may only know the announcement. One `date` field covers all three
 * panels: todo deadline, milestone date or published date.
 */
export const newsManualInputSchema = z
  .object({
    projectId: z.string().trim().min(1, 'Chọn dự án').max(64),
    kind: z.enum(NEWS_KINDS),
    summary: z.string().trim().min(1, 'Tóm tắt không được rỗng').max(280),
    verification: z.enum(VERIFICATION_STATES),
    sourceUrl: optionalUrl,
    sourceName: z.string().trim().max(200).nullable().optional(),
    date: dateOnly,
    milestoneKind: z.enum(MILESTONE_KINDS).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'todo' && value.milestoneKind) {
      ctx.addIssue({
        code: 'custom',
        path: ['milestoneKind'],
        message: 'Việc cần làm không có loại mốc'
      })
    }
  })

export const modelConfigSchema = z.object({
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
  supportsWebSearch: z.boolean().default(false),
  supportsTools: z.boolean().default(false),
  costTier: z.enum(['free', 'paid']).default('free')
})

export const providerConfigSchema = z.object({
  id: z.string().trim().min(1).max(100),
  type: z.enum(PROVIDER_TYPES),
  name: z.string().trim().min(1).max(200),
  baseUrl: optionalUrl,
  models: z.array(modelConfigSchema).min(1).max(100)
})

const headersSchema = z.record(z.string().trim().min(1).max(100), z.string().max(4000))

export const importedProviderSchema = providerConfigSchema.extend({
  id: z.string().trim().min(1).max(100).optional(),
  apiKey: z.string().min(1).max(4000).optional(),
  headers: headersSchema.optional()
})

export const aiConfigImportSchema = z.object({
  schemaVersion: z.literal('1.0'),
  apiKey: z.string().min(1).max(4000).optional(),
  headers: headersSchema.optional(),
  providers: z.array(importedProviderSchema).min(1).max(10)
})

export const providerSaveSchema = z.object({
  provider: providerConfigSchema,
  apiKey: z.string().min(1).max(4000).optional(),
  headers: headersSchema.optional()
})

export const providerSaveJsonSchema = z.object({
  json: z.string().min(2).max(200_000)
})

export const providerTestSchema = z.object({
  providerId: z.string().trim().min(1).max(100),
  modelId: z.string().trim().min(1).max(200)
})

export const appearanceSchema = z.object({
  fontFamily: z.enum(SAFE_FONT_FAMILIES),
  fontSize: z.number().int().min(FONT_SIZE_RANGE.min).max(FONT_SIZE_RANGE.max),
  fontWeight: z.number().int().min(FONT_WEIGHT_RANGE.min).max(FONT_WEIGHT_RANGE.max)
})

export const aiModeSchema = z.enum(AI_MODES)

export const revenueInputSchema = z
  .object({
    projectId: z.string().max(64).nullable(),
    projectNameSnapshot: z.string().trim().min(1).max(200),
    rewardKind: z.enum(REWARD_KINDS),
    rewardSymbol: z.string().trim().min(1).max(20),
    estimatedAmount: z.number().min(0).nullable().optional(),
    estimatedUsd: z.number().min(0).nullable().optional(),
    receivedAmount: z.number().min(0).nullable().optional(),
    receivedUsd: z.number().min(0).nullable().optional(),
    receivedAt: dateOnly.nullable().optional(),
    claimStatus: z.enum(CLAIM_STATUSES).optional(),
    participationCostUsd: z.number().min(0).optional(),
    txFeeUsd: z.number().min(0).optional(),
    txHash: z.string().max(200).nullable().optional(),
    evidenceNote: z.string().max(2000).nullable().optional(),
    evidenceFile: z.string().max(500).nullable().optional(),
    note: z.string().max(5000).optional()
  })
  .superRefine((value, ctx) => {
    if (
      value.claimStatus === 'claimed' &&
      value.rewardKind !== 'points' &&
      (value.receivedAmount === null || value.receivedAmount === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['receivedAmount'],
        message: 'Khoản đã nhận phải có số lượng thực nhận'
      })
    }
  })

export type ProjectImport = z.infer<typeof projectImportSchema>
export type ProjectImportItem = z.infer<typeof projectImportItemSchema>
export type ScanResultInput = z.infer<typeof scanResultSchema>
export type ScanItemInput = z.infer<typeof scanItemSchema>
export type NewsResultInput = z.infer<typeof newsResultSchema>
export type NewsItemInput = z.infer<typeof newsItemSchema>
export type NewsManualInput = z.infer<typeof newsManualInputSchema>
export type AiConfigImport = z.infer<typeof aiConfigImportSchema>
export type RevenueInput = z.infer<typeof revenueInputSchema>
