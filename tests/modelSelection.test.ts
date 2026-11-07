import { describe, expect, it } from 'vitest'
import { findResolvedModel, resolveTaskModel } from '../src/shared/modelSelection'
import type { ProviderConfig } from '../src/shared/types'

const providers: ProviderConfig[] = [
  {
    id: 'provider-chat',
    type: 'openai',
    name: 'Chat Provider',
    baseUrl: 'https://chat.example.com',
    models: [
      { id: 'chat-model', label: 'Chat Model', supportsWebSearch: true, supportsTools: true, costTier: 'free' }
    ]
  },
  {
    id: 'provider-news',
    type: 'google',
    name: 'News Provider',
    baseUrl: 'https://news.example.com',
    models: [
      { id: 'news-model', label: 'News Model', supportsWebSearch: true, supportsTools: true, costTier: 'paid' }
    ]
  },
  {
    id: 'provider-scan',
    type: 'anthropic',
    name: 'Scan Provider',
    baseUrl: 'https://scan.example.com',
    models: [
      { id: 'scan-model', label: 'Scan Model', supportsWebSearch: false, supportsTools: true, costTier: 'free' }
    ]
  }
]

const chat = { providerId: 'provider-chat', modelId: 'chat-model' }
const news = { providerId: 'provider-news', modelId: 'news-model' }
const scan = { providerId: 'provider-scan', modelId: 'scan-model' }

describe('findResolvedModel', () => {
  it('trả provider + model khi lựa chọn còn hợp lệ', () => {
    const resolved = findResolvedModel(providers, news)
    expect(resolved?.provider.id).toBe('provider-news')
    expect(resolved?.model.id).toBe('news-model')
  })

  it('trả null khi model đã bị xóa hoặc selection rỗng', () => {
    expect(findResolvedModel(providers, { providerId: 'provider-news', modelId: 'gone' })).toBeNull()
    expect(findResolvedModel(providers, { providerId: 'gone', modelId: 'news-model' })).toBeNull()
    expect(findResolvedModel(providers, null)).toBeNull()
  })
})

describe('resolveTaskModel — mỗi tab một model (FIX 2)', () => {
  it('News dùng đúng model của News, không dùng model Chat', () => {
    const state = resolveTaskModel(providers, news, chat)
    expect(state.effective?.model.id).toBe('news-model')
    expect(state.stale).toBe(false)
    expect(state.usedDefault).toBe(false)
  })

  it('Scan dùng đúng model của Scan, độc lập với News', () => {
    const state = resolveTaskModel(providers, scan, chat)
    expect(state.effective?.model.id).toBe('scan-model')
    expect(state.stale).toBe(false)
    expect(state.usedDefault).toBe(false)
  })

  it('chưa chọn thì dùng model Chat làm mặc định', () => {
    const state = resolveTaskModel(providers, null, chat)
    expect(state.effective?.model.id).toBe('chat-model')
    expect(state.usedDefault).toBe(true)
    expect(state.stale).toBe(false)
  })

  it('selection cũ đã bị xóa thì fallback về Chat và báo stale', () => {
    const state = resolveTaskModel(providers, { providerId: 'provider-news', modelId: 'removed' }, chat)
    expect(state.effective?.model.id).toBe('chat-model')
    expect(state.stale).toBe(true)
    expect(state.usedDefault).toBe(true)
  })

  it('cả hai đều không hợp lệ thì không có model hiệu lực', () => {
    const state = resolveTaskModel(providers, { providerId: 'gone', modelId: 'gone' }, null)
    expect(state.effective).toBeNull()
    expect(state.stale).toBe(true)
    expect(state.usedDefault).toBe(true)
  })
})
