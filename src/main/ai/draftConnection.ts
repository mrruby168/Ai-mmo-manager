import type { ProviderType } from '@shared/constants'
import { resolveBaseUrl } from '@shared/provider-presets'
import type { ProviderConnection } from './types'

/** Cấu hình đang nhập trong ProviderEditor (chưa lưu) dùng cho nút Test. */
export interface ProviderTestDraft {
  type: ProviderType
  baseUrl?: string | null
  apiKey?: string
  headers?: Record<string, string>
  supportsWebSearch?: boolean
}

/** Phần đã lưu của Provider (chỉ có khi đang sửa Provider sẵn có). */
export interface SavedProviderPart {
  baseUrl?: string | null
  apiKey?: string
  headers?: Record<string, string>
}

export type DraftConnectionResult = { ok: true; connection: ProviderConnection } | { ok: false; message: string }

/**
 * Dựng kết nối để Test từ cấu hình ĐANG NHẬP, không cần Lưu trước.
 * Khóa/headers để trống thì lấy bản đã lưu của Provider (nếu có). Không ghi gì xuống đĩa.
 */
export function buildDraftConnection(
  modelId: string,
  draft: ProviderTestDraft,
  saved: SavedProviderPart | null
): DraftConnectionResult {
  const apiKey = draft.apiKey?.trim() || saved?.apiKey || ''
  const headers = draft.headers ?? saved?.headers
  if (!apiKey && !headers) {
    return { ok: false, message: 'Chưa có API Key: nhập khóa rồi bấm Test (không cần Lưu trước)' }
  }
  // draft.baseUrl === null nghĩa là người dùng chủ động để trống (dùng mặc định), không rơi về bản đã lưu.
  const rawBaseUrl = draft.baseUrl !== undefined ? draft.baseUrl : (saved?.baseUrl ?? null)
  const baseUrl = resolveBaseUrl(draft.type, rawBaseUrl)
  if (!baseUrl) {
    return { ok: false, message: 'Chưa có Base URL: mở "Nâng cao" và nhập Base URL' }
  }
  return {
    ok: true,
    connection: {
      providerType: draft.type,
      baseUrl,
      apiKey,
      headers,
      modelId,
      supportsWebSearch: draft.supportsWebSearch ?? false
    }
  }
}
