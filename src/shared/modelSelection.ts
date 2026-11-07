import type { ModelSelection, ProviderConfig, ProviderModel } from './types'

export interface ResolvedModel {
  selection: ModelSelection
  provider: ProviderConfig
  model: ProviderModel
}

/** Does this selection still point at a configured provider + model? */
export function findResolvedModel(
  providers: readonly ProviderConfig[],
  selection: ModelSelection | null
): ResolvedModel | null {
  if (!selection) {
    return null
  }
  const provider = providers.find((entry) => entry.id === selection.providerId)
  const model = provider?.models.find((entry) => entry.id === selection.modelId)
  if (!provider || !model) {
    return null
  }
  return { selection, provider, model }
}

export interface TaskModelState {
  /** Model the task will really run with. */
  effective: ResolvedModel | null
  /** Stored selection points at a removed/disabled provider or model. */
  stale: boolean
  /** Task picker is empty or stale, so the Chat selection is used. */
  usedDefault: boolean
}

/**
 * Mirror of the main-process fallback: a task uses its own selection when it is
 * still valid, otherwise it falls back to the Chat Box selection.
 */
export function resolveTaskModel(
  providers: readonly ProviderConfig[],
  selection: ModelSelection | null,
  fallback: ModelSelection | null
): TaskModelState {
  const own = findResolvedModel(providers, selection)
  const stale = selection !== null && own === null
  const effective = own ?? findResolvedModel(providers, fallback)
  return {
    effective,
    stale,
    usedDefault: selection === null || stale
  }
}
