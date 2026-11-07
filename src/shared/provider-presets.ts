import type { ProviderType } from './constants'

export interface ProviderPreset {
  type: ProviderType
  name: string
  baseUrl: string
  docsUrl: string
  description: string
}

export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  openai: {
    type: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://developers.openai.com/api/docs/',
    description: 'Chat Completions chính thức của OpenAI.'
  },
  anthropic: {
    type: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    docsUrl: 'https://platform.claude.com/docs/en/api/messages',
    description: 'Messages API, hỗ trợ tool calling và web search gốc.'
  },
  opencode: {
    type: 'opencode',
    name: 'OpenCode',
    baseUrl: 'https://opencode.ai/inference/openai/v1',
    docsUrl: 'https://opencode.ai/v2/docs/console/harnesses#base-urls',
    description: 'Gateway OpenAI-compatible của OpenCode Console.'
  },
  google: {
    type: 'google',
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    description: 'Gemini API, hỗ trợ function calling và Google Search grounding.'
  },
  custom: {
    type: 'custom',
    name: 'Custom',
    baseUrl: '',
    docsUrl: '',
    description: 'Endpoint OpenAI-compatible khác do bạn cấu hình.'
  }
}

export function providerTypeLabel(type: ProviderType): string {
  return PROVIDER_PRESETS[type].name
}

/** Trim; rỗng -> null; bỏ mọi '/' ở cuối. */
export function normaliseBaseUrl(raw: string | null | undefined): string | null {
  if (raw == null || raw.trim().length === 0) {
    return null
  }
  return raw.trim().replace(/\/+$/, '')
}

/** Quyết định URL thực tế: ưu tiên input của User; nếu để trống → dùng preset của type; custom => null. */
export function resolveBaseUrl(type: ProviderType, baseUrl: string | null | undefined): string | null {
  const own = normaliseBaseUrl(baseUrl)
  if (own) {
    return own
  }
  // Dùng preset của type (cho opencode/openai/anthropic/google); custom vẫn => null
  return normaliseBaseUrl(PROVIDER_PRESETS[type].baseUrl)
}

/** Bỏ '/' thừa ở hai đầu, ghép đúng một '/'. suffix có thể '' (rỗng). */
export function joinEndpoint(baseUrl: string | null, suffix: string): string {
  const root = normaliseBaseUrl(baseUrl)
  if (root == null) {
    // fallback: nếu baseUrl rỗng thì dùng "" (gọi giả, người gọi sẽ resolve trước)
    return suffix
  }
  // root không còn '/'
  const cleanRoot = root.replace(/^\/|\/$/g, '')
  const cleanSuffix = suffix.replace(/^\/|\/$/g, '')
  if (cleanSuffix === '') {
    return cleanRoot
  }
  return `${cleanRoot}/${cleanSuffix}`
}
