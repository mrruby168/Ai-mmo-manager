import { z } from 'zod'
import { PROJECT_CATEGORIES, WEB_SEARCH_PROVIDERS } from '@shared/constants'
import {
  aiModeSchema,
  appearanceSchema,
  isHttpUrl,
  newsManualInputSchema,
  providerSaveJsonSchema,
  providerSaveSchema,
  providerTestSchema
} from '@shared/schemas'

/**
 * Payload schemas shared by the IPC handlers and the contract tests.
 * Keeping them free of Electron imports lets `tests/ipcPayloads.test.ts`
 * parse exactly what `src/preload/index.ts` sends.
 */

/* ---------- chat ---------- */

export const chatSendPayload = z.union([
  z.object({
    text: z.string().trim().min(1, 'Tin nhắn không được rỗng').max(60_000),
    providerId: z.string().trim().min(1).max(100),
    modelId: z.string().trim().min(1).max(200)
  }),
  z.object({ choiceId: z.string().trim().min(1).max(64) })
])

export const actionIdPayload = z.object({ actionId: z.string().trim().min(1).max(64) })

/* ---------- projects ---------- */

export const projectsIdPayload = z.object({ id: z.string().min(1).max(64) })

export const projectsListPayload = z.object({ category: z.enum(PROJECT_CATEGORIES).optional() }).optional()

export const projectsCreatePayload = z.object({ input: z.unknown() })

export const projectsUpdatePayload = z.object({
  id: z.string().min(1).max(64),
  input: z.unknown(),
  expectedRowVersion: z.number().int().positive().optional()
})

export const projectsSetLogoPayload = z
  .object({
    id: z.string().min(1).max(64),
    sourcePath: z.string().min(1).max(2048).optional(),
    autoFetch: z.boolean().optional()
  })
  .refine((value) => !(value.sourcePath && value.autoFetch), {
    message: 'Chọn ảnh từ máy hoặc lấy tự động, không dùng cả hai'
  })

export const projectsImportPayload = z
  .object({
    json: z.string().optional(),
    filePath: z.string().min(1).max(2048).optional(),
    pickFile: z.boolean().optional()
  })
  .refine((value) => [value.json, value.filePath, value.pickFile].filter(Boolean).length === 1, {
    message: 'Chọn đúng một cách nhập: dán JSON, chọn file hoặc mở hộp thoại chọn file'
  })

export const projectsExportPayload = z.object({
  format: z.enum(['json', 'txt']),
  chooseLocation: z.boolean().optional()
})

/* ---------- revenue ---------- */

export const revenueListPayload = z
  .object({ projectId: z.string().trim().min(1).max(64).optional() })
  .optional()

export const revenueGetPayload = z.object({ id: z.number().int().positive() })

export const revenueSavePayload = z.object({
  input: z.unknown(),
  id: z.number().int().positive().optional()
})

export const revenueDeletePayload = z.object({ id: z.number().int().positive() })

export const revenueAttachEvidencePayload = z.object({ revenueId: z.number().int().positive() })

/* ---------- news ---------- */

export const newsTogglePayload = z.object({
  id: z.number().int().positive(),
  isDone: z.boolean()
})

export const newsImportConfirmPayload = z.object({
  token: z.string().trim().min(1).max(64)
})

/* ---------- news manual CRUD (No AI Mode) ---------- */

export const newsCreatePayload = z.object({ input: newsManualInputSchema })

export const newsUpdatePayload = z.object({
  id: z.number().int().positive(),
  input: newsManualInputSchema
})

export const newsDeletePayload = z.object({ id: z.number().int().positive() })

/* ---------- scan ---------- */

export const scanStartPayload = z.object({
  text: z.string().min(1, 'Nội dung không được rỗng').max(1_000_000),
  fileName: z.string().trim().min(1).max(255).optional()
})

export const scanSubmitPayload = z.object({
  names: z.array(z.string().trim().min(1).max(200)).min(1, 'Chưa chọn dự án nào').max(100)
})

/* ---------- settings / providers ---------- */

export const appearancePayload = z.object({ appearance: appearanceSchema })

export const aiModePayload = z.object({ aiMode: aiModeSchema })

export const dataPathPayload = z.union([
  z.object({ choose: z.literal(true) }),
  z.object({
    path: z.string().trim().min(1).max(1000),
    copyExisting: z.boolean().default(true)
  })
])

export const lastSelectionPayload = z.object({
  providerId: z.string().trim().min(1).max(100),
  modelId: z.string().trim().min(1).max(200)
})

export const taskSelectionPayload = z.object({
  task: z.enum(['news', 'scan']),
  selection: z
    .object({
      providerId: z.string().trim().min(1).max(100),
      modelId: z.string().trim().min(1).max(200)
    })
    .nullable()
})

export const providerSavePayload = z.union([providerSaveSchema, providerSaveJsonSchema])

export const providerDeletePayload = z.object({ id: z.string().trim().min(1).max(100) })

export const providerTestPayload = providerTestSchema

export const providerParseJsonPayload = providerSaveJsonSchema

/* ---------- web search (D2) ---------- */

const webSearchProviderSchema = z.enum(WEB_SEARCH_PROVIDERS)

export const webSearchSavePayload = z.object({
  provider: webSearchProviderSchema,
  baseUrl: z.string().trim().max(2048).nullable().optional(),
  apiKey: z.string().trim().max(4096).optional()
})

export const webSearchTestPayload = z.object({
  provider: webSearchProviderSchema.optional(),
  baseUrl: z.string().trim().max(2048).nullable().optional(),
  apiKey: z.string().trim().max(4096).optional()
})

/* ---------- app ---------- */

export const appOpenExternalPayload = z.object({
  url: z.string().max(2048).refine(isHttpUrl, 'Chỉ mở được link http:// hoặc https://')
})
