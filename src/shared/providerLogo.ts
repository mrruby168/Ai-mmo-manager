export type ProviderLogoKind = 'openai' | 'anthropic' | 'google' | 'opencode' | 'openrouter'

/**
 * Nhận diện logo Provider từ tên hiển thị trước, rồi tới host của baseUrl.
 * Chỉ dùng để chọn SVG inline, không tải gì từ mạng.
 */
export function resolveProviderLogo(name: string, baseUrl: string | null | undefined): ProviderLogoKind | null {
  const host = hostOf(baseUrl)
  const nameText = name.toLowerCase()
  const urlText = (baseUrl ?? '').toLowerCase()

  if (host.includes('openrouter.ai') || nameText.includes('openrouter')) {
    return 'openrouter'
  }
  // OpenCode dùng path kiểu /openai/v1 nên phải xét trước OpenAI.
  if (nameText.includes('opencode') || host.includes('opencode.ai')) {
    return 'opencode'
  }
  if (nameText.includes('openai') || nameText.includes('chatgpt')) {
    return 'openai'
  }
  if (nameText.includes('anthropic') || nameText.includes('claude')) {
    return 'anthropic'
  }
  if (nameText.includes('google') || nameText.includes('gemini')) {
    return 'google'
  }

  if (urlText.includes('openrouter')) {
    return 'openrouter'
  }
  if (urlText.includes('anthropic') || urlText.includes('claude')) {
    return 'anthropic'
  }
  if (urlText.includes('generativelanguage.googleapis.com') || urlText.includes('googleapis.com')) {
    return 'google'
  }
  if (urlText.includes('opencode')) {
    return 'opencode'
  }
  if (urlText.includes('openai.com')) {
    return 'openai'
  }
  return null
}

function hostOf(baseUrl: string | null | undefined): string {
  if (!baseUrl) {
    return ''
  }
  try {
    return new URL(baseUrl).hostname.toLowerCase()
  } catch {
    return ''
  }
}
