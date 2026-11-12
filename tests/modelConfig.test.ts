import { describe, expect, it } from 'vitest'
import {
  appSearchConfigured,
  chainSlot,
  chainWarnings,
  listModelChoices,
  selectionFromKey,
  selectionKey,
  setChainSlot
} from '../src/shared/modelConfig'
import type { ProviderConfig, WebSearchView } from '../src/shared/types'

const providers: ProviderConfig[] = [
  {
    id: 'p1',
    type: 'openai',
    name: 'Provider 1',
    baseUrl: 'https://one.example.com',
    models: [
      { id: 'm1', label: 'Một', supportsWebSearch: true, supportsTools: true, costTier: 'free' },
      { id: 'm2', label: 'Hai', supportsWebSearch: false, supportsTools: false, costTier: 'paid' }
    ]
  },
  {
    id: 'p2',
    type: 'custom',
    name: 'Provider 2',
    baseUrl: null,
    models: [{ id: 'm3', label: 'Ba', supportsWebSearch: false, supportsTools: true, costTier: 'paid' }]
  }
]

const choices = listModelChoices(providers)

const m1 = { providerId: 'p1', modelId: 'm1' }
const m2 = { providerId: 'p1', modelId: 'm2' }
const m3 = { providerId: 'p2', modelId: 'm3' }

function view(overrides: Partial<WebSearchView>): WebSearchView {
  return { provider: 'none', baseUrl: null, hasApiKey: false, ...overrides }
}

describe('listModelChoices', () => {
  it('liệt kê mọi model của mọi Provider với nhãn "Provider · Model"', () => {
    expect(choices.map((choice) => choice.key)).toEqual(['p1::m1', 'p1::m2', 'p2::m3'])
    expect(choices.map((choice) => choice.label)).toEqual(['Provider 1 · Một', 'Provider 1 · Hai', 'Provider 2 · Ba'])
    expect(choices[2]).toMatchObject({ supportsTools: true, supportsWebSearch: false, costTier: 'paid' })
  })
})

describe('selection key', () => {
  it('chuyển qua lại giữa ModelSelection và value của Listbox', () => {
    expect(selectionKey(m1)).toBe('p1::m1')
    expect(selectionKey(null)).toBe('')
    expect(selectionFromKey('p1::m1')).toEqual(m1)
    expect(selectionFromKey('')).toBeNull()
    expect(selectionFromKey('p1')).toBeNull()
  })
})

describe('setChainSlot', () => {
  it('điền A1 rồi A2 theo đúng thứ tự', () => {
    const first = setChainSlot([], 0, m1)
    expect(first).toEqual([m1])
    expect(setChainSlot(first, 1, m3)).toEqual([m1, m3])
  })

  it('chọn A2 khi A1 còn trống thì A2 thành A1 (chuỗi nén liền mạch)', () => {
    expect(setChainSlot([], 1, m3)).toEqual([m3])
    expect(chainSlot(setChainSlot([], 1, m3), 0)).toEqual(m3)
  })

  it('bỏ "Không dùng" thì model phía sau dồn lên', () => {
    expect(setChainSlot([m1, m2, m3], 1, null)).toEqual([m1, m3])
  })

  it('thay model ở giữa giữ nguyên thứ tự', () => {
    expect(setChainSlot([m1, m2, m3], 1, m3)).toEqual([m1, m3])
  })

  it('không cho trùng model và tối đa 3 vị trí', () => {
    // Gán A1 trùng A2: mục trùng bị bỏ, chuỗi còn đúng một model.
    expect(setChainSlot([m1, m3], 0, m3)).toEqual([m3])
    // Gán A3 trùng A1: không tạo mục thứ ba trùng.
    expect(setChainSlot([m1, m2, m3], 2, m1)).toEqual([m1, m2])
  })

  it('chainSlot trả null cho ô trống', () => {
    expect(chainSlot([m1], 0)).toEqual(m1)
    expect(chainSlot([m1], 2)).toBeNull()
  })
})

describe('appSearchConfigured', () => {
  it('chỉ tính là đã cấu hình khi có key hoặc URL SearXNG', () => {
    expect(appSearchConfigured(null)).toBe(false)
    expect(appSearchConfigured(view({ provider: 'none' }))).toBe(false)
    expect(appSearchConfigured(view({ provider: 'tavily', hasApiKey: false }))).toBe(false)
    expect(appSearchConfigured(view({ provider: 'tavily', hasApiKey: true }))).toBe(true)
    expect(appSearchConfigured(view({ provider: 'searxng', baseUrl: 'https://searx.example.org' }))).toBe(true)
    expect(appSearchConfigured(view({ provider: 'searxng', baseUrl: '  ' }))).toBe(false)
  })
})

describe('chainWarnings', () => {
  it('cảnh báo model không hỗ trợ tool calling ở mọi tác vụ', () => {
    const warnings = chainWarnings('chat', [m1, m2], choices, false)
    expect(warnings).toEqual([{ index: 1, message: 'A2 "Provider 1 · Hai" không hỗ trợ tool calling nên sẽ bị bỏ qua.' }])
  })

  it('Scan cần Web Search gốc', () => {
    expect(chainWarnings('scan', [m3], choices, true)).toEqual([
      { index: 0, message: 'A1 "Provider 2 · Ba" không có Web Search gốc nên không dùng được cho Scan Project.' }
    ])
  })

  it('News chỉ cảnh báo thiếu Web Search khi app chưa cấu hình Web Search', () => {
    expect(chainWarnings('news', [m3], choices, false)).toHaveLength(1)
    expect(chainWarnings('news', [m3], choices, true)).toEqual([])
  })

  it('không cảnh báo model đã bị xóa khỏi danh sách', () => {
    expect(chainWarnings('news', [{ providerId: 'gone', modelId: 'x' }], choices, false)).toEqual([])
  })
})
