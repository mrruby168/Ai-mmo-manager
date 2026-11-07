import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiSettings, ProviderConfig } from '../src/shared/types'

const { getSettings } = vi.hoisted(() => ({ getSettings: vi.fn() }))

vi.mock('electron', () => ({ app: { getPath: () => process.cwd() } }))
vi.mock('../src/main/services/settingsStore', () => ({
  getSettings,
  saveAiSettings: vi.fn()
}))

import { getTaskModelMeta } from '../src/main/ai/providerService'

const providers: ProviderConfig[] = [
  {
    id: 'p-chat',
    type: 'openai',
    name: 'Chat Provider',
    baseUrl: 'https://chat.example.com',
    models: [
      { id: 'm-chat', label: 'Chat Model', supportsWebSearch: true, supportsTools: true, costTier: 'free' }
    ]
  },
  {
    id: 'p-news',
    type: 'google',
    name: 'News Provider',
    baseUrl: 'https://news.example.com',
    models: [
      { id: 'm-news', label: 'News Model', supportsWebSearch: true, supportsTools: true, costTier: 'paid' }
    ]
  },
  {
    id: 'p-scan',
    type: 'anthropic',
    name: 'Scan Provider',
    baseUrl: 'https://scan.example.com',
    models: [
      { id: 'm-scan', label: 'Scan Model', supportsWebSearch: true, supportsTools: true, costTier: 'free' }
    ]
  }
]

function useSettings(overrides: Partial<AiSettings> = {}): void {
  getSettings.mockReturnValue({
    ai: {
      providers,
      lastSelection: { providerId: 'p-chat', modelId: 'm-chat' },
      newsSelection: null,
      scanSelection: null,
      ...overrides
    }
  })
}

beforeEach(() => {
  useSettings()
})

describe('getTaskModelMeta — model riêng cho News/Scan (FIX 2)', () => {
  it('News và Scan dùng selection riêng, khác Chat và khác nhau', () => {
    useSettings({
      newsSelection: { providerId: 'p-news', modelId: 'm-news' },
      scanSelection: { providerId: 'p-scan', modelId: 'm-scan' }
    })

    expect(getTaskModelMeta('news')?.modelId).toBe('m-news')
    expect(getTaskModelMeta('scan')?.modelId).toBe('m-scan')
    expect(getTaskModelMeta('news')?.modelId).not.toBe(getTaskModelMeta('scan')?.modelId)
  })

  it('chưa chọn thì fallback về selection của Chat', () => {
    expect(getTaskModelMeta('news')?.modelId).toBe('m-chat')
    expect(getTaskModelMeta('scan')?.modelId).toBe('m-chat')
  })

  it('selection cũ bị xóa thì fallback về Chat', () => {
    useSettings({ newsSelection: { providerId: 'p-news', modelId: 'removed' } })

    expect(getTaskModelMeta('news')?.modelId).toBe('m-chat')
  })

  it('không có cả selection riêng lẫn Chat thì trả null', () => {
    useSettings({ lastSelection: null, scanSelection: null })

    expect(getTaskModelMeta('scan')).toBeNull()
  })
})
