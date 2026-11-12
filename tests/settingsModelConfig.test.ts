import { describe, expect, it, vi } from 'vitest'
import { modelConfigPayload } from '../src/main/ipc/payloadSchemas'
import { normalizeSettings } from '../src/main/services/settingsStore'
import { DEFAULT_NEWS_CACHE_TTL_MS } from '../src/shared/types'
import type { AiSettings, ProviderConfig } from '../src/shared/types'

vi.mock('electron', () => ({ app: { getPath: () => process.cwd() } }))

const providers: ProviderConfig[] = [
  {
    id: 'p1',
    type: 'openai',
    name: 'Provider 1',
    baseUrl: 'https://one.example.com',
    models: [
      { id: 'm1', label: 'M1', supportsWebSearch: true, supportsTools: true, costTier: 'free' },
      { id: 'm2', label: 'M2', supportsWebSearch: false, supportsTools: true, costTier: 'free' },
      { id: 'm3', label: 'M3', supportsWebSearch: true, supportsTools: false, costTier: 'paid' },
      { id: 'm4', label: 'M4', supportsWebSearch: true, supportsTools: true, costTier: 'paid' }
    ]
  }
]

const chat = { providerId: 'p1', modelId: 'm1' }
const news = { providerId: 'p1', modelId: 'm2' }

/** Cố tình bỏ `taskModels`/`newsCacheTtlMs` để mô phỏng settings.json cũ. */
function ai(overrides: Partial<AiSettings> = {}): AiSettings {
  return { providers, lastSelection: chat, newsSelection: null, scanSelection: null, ...overrides } as AiSettings
}

describe('normalizeSettings — FIX 2 data', () => {
  it('đọc settings.json cũ (không có taskModels) và suy A1 từ các trường cũ', () => {
    const settings = normalizeSettings({ ai: ai({ newsSelection: news }) })

    expect(settings.ai.taskModels).toEqual({ news: [news], scan: [], chat: [chat] })
    expect(settings.ai.newsSelection).toEqual(news)
    expect(settings.ai.lastSelection).toEqual(chat)
    expect(settings.ai.newsCacheTtlMs).toBe(DEFAULT_NEWS_CACHE_TTL_MS)
  })

  it('loại model đã bị xóa khỏi AI Settings khỏi chuỗi', () => {
    const settings = normalizeSettings({
      ai: ai({
        newsSelection: news,
        taskModels: { news: [news, { providerId: 'p1', modelId: 'removed' }], scan: [], chat: [chat] }
      })
    })

    expect(settings.ai.taskModels.news).toEqual([news])
  })

  it('bỏ mục trùng và giữ tối đa 3 model', () => {
    const settings = normalizeSettings({
      ai: ai({
        taskModels: {
          news: [
            { providerId: 'p1', modelId: 'm1' },
            { providerId: 'p1', modelId: 'm1' },
            { providerId: 'p1', modelId: 'm2' },
            { providerId: 'p1', modelId: 'm3' },
            { providerId: 'p1', modelId: 'm4' }
          ],
          scan: [],
          chat: [chat]
        }
      })
    })

    expect(settings.ai.taskModels.news).toEqual([
      { providerId: 'p1', modelId: 'm1' },
      { providerId: 'p1', modelId: 'm2' },
      { providerId: 'p1', modelId: 'm3' }
    ])
  })

  it('giữ bất biến: trường cũ luôn bằng A1 của tác vụ', () => {
    const settings = normalizeSettings({
      ai: ai({
        newsSelection: chat,
        taskModels: { news: [news, chat], scan: [], chat: [chat] }
      })
    })

    expect(settings.ai.newsSelection).toEqual(news)
    expect(settings.ai.lastSelection).toEqual(chat)
  })

  it('chỉ nhận TTL cache News trong tập cho phép, còn lại dùng mặc định 3 giờ', () => {
    expect(normalizeSettings({ ai: ai({ newsCacheTtlMs: 60_000 }) }).ai.newsCacheTtlMs).toBe(60_000)
    expect(normalizeSettings({ ai: ai({ newsCacheTtlMs: 28_800_000 }) }).ai.newsCacheTtlMs).toBe(28_800_000)
    expect(normalizeSettings({ ai: ai({ newsCacheTtlMs: 3_600_000 }) }).ai.newsCacheTtlMs).toBe(DEFAULT_NEWS_CACHE_TTL_MS)
  })
})

describe('modelConfigPayload', () => {
  it('nhận payload hợp lệ', () => {
    const parsed = modelConfigPayload.safeParse({
      task: 'news',
      chain: [news, chat],
      newsCacheTtlMs: 60_000
    })
    expect(parsed.success).toBe(true)
  })

  it('từ chối chuỗi quá 3 model hoặc trùng model', () => {
    expect(
      modelConfigPayload.safeParse({
        task: 'scan',
        chain: [chat, news, { providerId: 'p1', modelId: 'm3' }, { providerId: 'p1', modelId: 'm4' }]
      }).success
    ).toBe(false)
    expect(modelConfigPayload.safeParse({ task: 'scan', chain: [chat, chat] }).success).toBe(false)
  })

  it('từ chối TTL ngoài tập cho phép và task lạ', () => {
    expect(modelConfigPayload.safeParse({ task: 'news', chain: [], newsCacheTtlMs: 3_600_000 }).success).toBe(false)
    expect(modelConfigPayload.safeParse({ task: 'chat', chain: [], newsCacheTtlMs: 60_000 }).success).toBe(true)
    expect(modelConfigPayload.safeParse({ task: 'other', chain: [] }).success).toBe(false)
  })
})
