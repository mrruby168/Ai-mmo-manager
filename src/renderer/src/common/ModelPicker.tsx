import type { ModelSelection, ProviderConfig } from '@shared/types'
import { Listbox } from './Listbox'
import type { ListboxOption } from './Listbox'
import { ProviderLogo } from './ProviderLogo'

export interface ModelPickerProps {
  providers: ProviderConfig[]
  value: ModelSelection | null
  onChange: (selection: ModelSelection) => void
  disabled?: boolean
  /** Accessible group label, e.g. "Model của Check News". */
  label: string
  /** Muted note shown under the pickers (e.g. "đang dùng mặc định"). */
  hint?: string | null
  className?: string
}

/**
 * FIX 2: the single Provider/Model picker reused by Chat, News and Scan.
 * It is a thin combination of the existing Listbox + ProviderLogo so the pool
 * of providers configured in Settings is never duplicated.
 */
export function ModelPicker({
  providers,
  value,
  onChange,
  disabled = false,
  label,
  hint,
  className
}: ModelPickerProps): React.JSX.Element {
  const providerId = value?.providerId ?? ''
  const currentProvider = providers.find((provider) => provider.id === providerId) ?? null
  const models = currentProvider?.models ?? []
  const modelId = currentProvider && models.some((model) => model.id === value?.modelId) ? value!.modelId : ''

  const providerOptions: ListboxOption[] = providers.map((provider) => ({
    value: provider.id,
    label: provider.name,
    icon: <ProviderLogo name={provider.name} baseUrl={provider.baseUrl} size={18} />
  }))

  const modelOptions: ListboxOption[] = models.map((model) => ({
    value: model.id,
    label: model.label,
    badge: model.costTier === 'paid' ? 'Paid' : 'Free'
  }))

  function handleProviderChange(nextProviderId: string): void {
    const provider = providers.find((entry) => entry.id === nextProviderId)
    const firstModel = provider?.models[0]
    if (provider && firstModel) {
      onChange({ providerId: provider.id, modelId: firstModel.id })
    }
  }

  function handleModelChange(nextModelId: string): void {
    if (providerId) {
      onChange({ providerId, modelId: nextModelId })
    }
  }

  return (
    <div className={`model-picker${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      <Listbox
        className="model-picker__provider"
        label="Provider"
        ariaLabel={`${label} — Provider`}
        options={providerOptions}
        value={providerId}
        placeholder={providers.length === 0 ? 'Chưa cấu hình' : 'Mặc định'}
        disabled={disabled || providers.length === 0}
        onChange={handleProviderChange}
        title={currentProvider ? currentProvider.name : 'Đang dùng mặc định'}
      />
      <Listbox
        className="model-picker__model"
        label="Model"
        ariaLabel={`${label} — Model`}
        options={modelOptions}
        value={modelId}
        placeholder={!currentProvider ? 'Mặc định' : models.length === 0 ? 'Không có Model' : 'Chọn Model'}
        disabled={disabled || !currentProvider || models.length === 0}
        onChange={handleModelChange}
        title={
          currentProvider && modelId
            ? `${currentProvider.name} · ${currentProvider.models.find((model) => model.id === modelId)?.label ?? ''}`
            : 'Đang dùng mặc định'
        }
      />
      {hint ? <span className="model-picker__hint">{hint}</span> : null}
    </div>
  )
}
