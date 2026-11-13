import { describe, expect, it, vi } from 'vitest'
import type { AiSettings, ProviderConfig } from '../src/shared/types'

const { getSettings } = vi.hoisted(() => ({ getSettings: vi.fn() }))

vi.mock('electron', () => ({ app: { getPath: () => process.cwd() } }))
vi.mock('../src/main/services/settingsStore', () => ({ getSettings }))

import { buildChatChain, buildTaskChain } from '../src/main/ai/providerService'
import { formatNewsCacheTtl } from '../src/shared/costControl'

const providers: ProviderConfig[] = [
  {
    id: 'p1',
    type: 'openai',
    name: 'Provider 1',
    baseUrl: 'https://one.example.com',
    models: [
      { id: 'm1', label: 'Một', supportsWebSearch: true, supportsTools: true, costTier: 'free' },
      { id: 'm2', label: 'Hai', supportsWebSearch: true, supportsTools: false, costTier: 'free' },
      { id: 'm3', label: 'Ba', supportsWebSearch: false, supportsTools: true, costTier: 'free' },
      { id: 'm4', label: 'Bốn', supportsWebSearch: true, supportsTools: true, costTier: 'paid' }
    ]
  },
  {
    id: 'p2',
    type: 'anthropic',
    name: 'Provider 2',
    baseUrl: null,
    models: [{ id: 'm5', label: 'Năm', supportsWebSearch: true, supportsTools: true, costTier: 'paid' }]
  }
]

const m1 = { providerId: 'p1', modelId: 'm1' }
const m2 = { providerId: 'p1', modelId: 'm2' }
const m3 = { providerId: 'p1', modelId: 'm3' }
const m4 = { providerId: 'p1', modelId: 'm4' }
const m5 = { providerId: 'p2', modelId: 'm5' }

function useSettings(ai: Partial<AiSettings>): void {
  getSettings.mockReturnValue({
    ai: {
      providers,
      lastSelection: null,
      newsSelection: null,
      scanSelection: null,
      taskModels: { news: [], scan: [], chat: [] },
      newsCacheTtlMs: 60_000,
      ...ai
    }
  })
}

describe('buildTaskChain', () => {
  it('giữ đúng thứ tự A1 → A2 và lấy providerType/nativeSearch của A1', () => {
    useSettings({ taskModels: { news: [m4, m5], scan: [], chat: [] } })

    const chain = buildTaskChain('news', { requireTools: true, webSearch: 'native-or-app' }, true)

    expect(chain.candidates.map((entry) => entry.modelId)).toEqual(['m4', 'm5'])
    expect(chain.candidates.map((entry) => entry.label)).toEqual(['Provider 1 · Bốn', 'Provider 2 · Năm'])
    expect(chain.providerType).toBe('openai')
    expect(chain.nativeSearch).toBe(true)
    expect(chain.skipped).toEqual([])
  })

  it('bỏ model không hỗ trợ tool calling và ghi rõ lý do', () => {
    useSettings({ taskModels: { news: [m1, m2, m4], scan: [], chat: [] } })

    const chain = buildTaskChain('news', { requireTools: true, webSearch: 'native-or-app' }, true)

    expect(chain.candidates.map((entry) => entry.modelId)).toEqual(['m1', 'm4'])
    expect(chain.skipped).toEqual([{ label: 'Provider 1 · Hai', reason: 'tools' }])
  })

  it('Scan bắt buộc Web Search gốc nên bỏ model không có Web Search', () => {
    useSettings({ taskModels: { news: [], scan: [m3, m1], chat: [] } })

    const chain = buildTaskChain('scan', { requireTools: true, webSearch: 'native' })

    expect(chain.candidates.map((entry) => entry.modelId)).toEqual(['m1'])
    expect(chain.skipped).toEqual([{ label: 'Provider 1 · Ba', reason: 'web_search' }])
  })

  it('News chấp nhận model thiếu Web Search gốc khi app đã cấu hình Web Search', () => {
    useSettings({ taskModels: { news: [m3], scan: [], chat: [] } })

    expect(buildTaskChain('news', { requireTools: true, webSearch: 'native-or-app' }, false).candidates).toEqual([])
    expect(buildTaskChain('news', { requireTools: true, webSearch: 'native-or-app' }, true).candidates).toHaveLength(1)
  })

  it('bỏ mục trùng và giữ tối đa 3 model', () => {
    useSettings({ taskModels: { news: [m1, m1, m4, m5, m2], scan: [], chat: [] } })

    const chain = buildTaskChain('news', { requireTools: true, webSearch: 'native-or-app' }, true)

    expect(chain.candidates.map((entry) => entry.modelId)).toEqual(['m1', 'm4', 'm5'])
  })

  it('bỏ qua model đã bị xóa khỏi AI Settings', () => {
    useSettings({ taskModels: { news: [{ providerId: 'p1', modelId: 'removed' }, m1], scan: [], chat: [] } })

    expect(buildTaskChain('news', { requireTools: true }, true).candidates.map((entry) => entry.modelId)).toEqual([
      'm1'
    ])
  })

  it('file settings.json cũ chưa có taskModels thì suy A1 từ trường cũ', () => {
    useSettings({ taskModels: undefined, newsSelection: m4, lastSelection: m1 })

    expect(buildTaskChain('news', { requireTools: true }, true).candidates.map((entry) => entry.modelId)).toEqual([
      'm4'
    ])
    expect(buildTaskChain('scan', { requireTools: true, webSearch: 'native' }).candidates.map((entry) => entry.modelId)).toEqual([
      'm1'
    ])
  })
})

describe('buildChatChain', () => {
  it('model đang chọn ở Chat Box là A1, A2 lấy từ chuỗi Chat', () => {
    useSettings({ taskModels: { news: [], scan: [], chat: [m4] } })

    const chain = buildChatChain({ providerId: 'p1', modelId: 'm1' })

    expect(chain.candidates.map((entry) => entry.modelId)).toEqual(['m1', 'm4'])
  })

  it('không lặp lại model đang chọn', () => {
    useSettings({ taskModels: { news: [], scan: [], chat: [m1, m5] } })

    const chain = buildChatChain({ providerId: 'p1', modelId: 'm1' })

    expect(chain.candidates.map((entry) => entry.modelId)).toEqual(['m1', 'm5'])
  })
})

describe('formatNewsCacheTtl', () => {
  it('hiển thị phút cho 1 phút và giờ cho 3/8 giờ', () => {
    expect(formatNewsCacheTtl(60_000)).toBe('1 phút')
    expect(formatNewsCacheTtl(10_800_000)).toBe('3 giờ')
    expect(formatNewsCacheTtl(28_800_000)).toBe('8 giờ')
  })
})
