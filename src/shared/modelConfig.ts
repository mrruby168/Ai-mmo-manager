import type { ModelChain, ModelSelection, ModelTask, ProviderConfig, WebSearchView } from './types'

/**
 * Hàm thuần cho tab Settings → Model Configuration (FIX 2).
 * Không import React/Electron để test được bằng node.
 */

export interface ModelChoice {
  /** `providerId::modelId`, dùng làm value của Listbox. */
  key: string
  providerId: string
  providerName: string
  providerBaseUrl: string | null
  modelId: string
  modelLabel: string
  /** "Provider · Model" để hiển thị trong Listbox. */
  label: string
  supportsTools: boolean
  supportsWebSearch: boolean
  costTier: 'free' | 'paid'
}

export function selectionKey(selection: ModelSelection | null | undefined): string {
  return selection ? `${selection.providerId}::${selection.modelId}` : ''
}

export function selectionFromKey(key: string): ModelSelection | null {
  const separator = key.indexOf('::')
  if (separator <= 0) {
    return null
  }
  const providerId = key.slice(0, separator)
  const modelId = key.slice(separator + 2)
  return providerId && modelId ? { providerId, modelId } : null
}

/** Toàn bộ model của mọi Provider đã cấu hình ở AI Settings. */
export function listModelChoices(providers: readonly ProviderConfig[]): ModelChoice[] {
  const choices: ModelChoice[] = []
  for (const provider of providers) {
    for (const model of provider.models) {
      choices.push({
        key: `${provider.id}::${model.id}`,
        providerId: provider.id,
        providerName: provider.name,
        providerBaseUrl: provider.baseUrl,
        modelId: model.id,
        modelLabel: model.label,
        label: `${provider.name} · ${model.label}`,
        supportsTools: model.supportsTools,
        supportsWebSearch: model.supportsWebSearch,
        costTier: model.costTier
      })
    }
  }
  return choices
}

/** Vị trí A1/A2/A3 của chuỗi, null khi ô để trống. */
export function chainSlot(chain: ModelChain, index: number): ModelSelection | null {
  return chain[index] ?? null
}

/**
 * Đặt model vào ô thứ `index` rồi nén chuỗi: bỏ ô trống, bỏ trùng, tối đa 3.
 * Chuỗi luôn là mảng liền mạch để main dùng đúng thứ tự A1 → A3.
 */
export function setChainSlot(chain: ModelChain, index: number, selection: ModelSelection | null): ModelChain {
  const slots: Array<ModelSelection | null> = [...chain]
  while (slots.length <= index) {
    slots.push(null)
  }
  slots[index] = selection

  const result: ModelChain = []
  for (const slot of slots) {
    if (!slot || result.some((entry) => selectionKey(entry) === selectionKey(slot))) {
      continue
    }
    result.push({ providerId: slot.providerId, modelId: slot.modelId })
    if (result.length === 3) {
      break
    }
  }
  return result
}

/** App đã cấu hình Web Search chưa (News/Scan dùng được model thiếu Web Search gốc khi có). */
export function appSearchConfigured(
  view: { provider: WebSearchView['provider']; baseUrl: string | null; hasApiKey?: boolean } | null | undefined
): boolean {
  if (!view || view.provider === 'none') {
    return false
  }
  if (view.provider === 'searxng') {
    return typeof view.baseUrl === 'string' && view.baseUrl.trim().length > 0
  }
  // AppSettings chỉ có provider/baseUrl; WebSearchView có thêm hasApiKey.
  return view.hasApiKey === undefined ? true : view.hasApiKey
}

export interface ChainWarning {
  /** 0 = A1, 1 = A2, 2 = A3. */
  index: number
  message: string
}

/**
 * Cảnh báo cho từng vị trí sẽ bị main bỏ qua khi chạy:
 * mọi tác vụ cần tool calling; Scan và News cần Web Search gốc hoặc Web Search của app.
 */
export function chainWarnings(
  task: ModelTask,
  chain: ModelChain,
  choices: readonly ModelChoice[],
  appSearchAvailable: boolean
): ChainWarning[] {
  const warnings: ChainWarning[] = []
  chain.forEach((selection, index) => {
    const choice = choices.find((entry) => entry.key === selectionKey(selection))
    if (!choice) {
      // Model đã bị xóa khỏi AI Settings: chuỗi đã được chuẩn hóa bỏ mục này.
      return
    }
    const prefix = `A${index + 1} "${choice.label}"`
    if (!choice.supportsTools) {
      warnings.push({ index, message: `${prefix} không hỗ trợ tool calling nên sẽ bị bỏ qua.` })
      return
    }
    if (!appSearchAvailable && !choice.supportsWebSearch && (task === 'scan' || task === 'news')) {
      warnings.push({
        index,
        message: `${prefix} không có Web Search gốc và app chưa cấu hình Web Search (Tavily / Brave / SearXNG) nên sẽ bị bỏ qua.`
      })
    }
  })
  return warnings
}

/**
 * Chuỗi main thực sự dùng cho tác vụ: chuỗi đã lưu, hoặc Chat làm mặc định
 * khi chuỗi trống (khớp `chainFor` trong providerService).
 */
export function effectiveChain(
  task: ModelTask,
  chain: ModelChain,
  lastSelection: ModelSelection | null
): ModelChain {
  if (chain.length > 0) {
    return chain
  }
  if (task === 'chat' || !lastSelection) {
    return []
  }
  return [lastSelection]
}

/**
 * Vị trí đầu tiên main sẽ thực sự chạy, null nếu cả chuỗi không dùng được.
 * Dùng để khóa nút Check News/Scan và hiện banner ngắn.
 */
export function firstRunnable(
  task: ModelTask,
  chain: ModelChain,
  choices: readonly ModelChoice[],
  appSearchAvailable: boolean
): ModelChoice | null {
  for (const selection of chain) {
    const choice = choices.find((entry) => entry.key === selectionKey(selection))
    if (!choice || !choice.supportsTools) {
      continue
    }
    if (!appSearchAvailable && !choice.supportsWebSearch && (task === 'scan' || task === 'news')) {
      continue
    }
    return choice
  }
  return null
}
