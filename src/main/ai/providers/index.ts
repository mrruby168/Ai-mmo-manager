import { PROVIDER_PRESETS } from '@shared/provider-presets'
import type { ProviderType } from '@shared/constants'
import type { ModelClient, ProviderConnection } from '../types'
import { createOpenAiCompatibleClient } from './openaiCompatible'
import { createAnthropicClient } from './anthropic'
import { createGoogleClient } from './google'

export { PROVIDER_PRESETS, providerTypeLabel } from '@shared/provider-presets'

export function createModelClient(connection: ProviderConnection): ModelClient {
  switch (connection.providerType) {
    case 'anthropic':
      return createAnthropicClient(connection)
    case 'google':
      return createGoogleClient(connection)
    case 'openai':
      return createOpenAiCompatibleClient(connection, { useMaxCompletionTokens: true })
    case 'opencode':
    case 'custom':
    default:
      return createOpenAiCompatibleClient(connection)
  }
}

export function presetBaseUrl(type: ProviderType): string {
  return PROVIDER_PRESETS[type].baseUrl
}
