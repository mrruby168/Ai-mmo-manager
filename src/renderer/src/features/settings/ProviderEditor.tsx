import { useMemo, useState } from 'react'
import type { ProviderType } from '@shared/constants'
import type { ProviderModel, ProviderTestResult, ProviderView } from '@shared/types'
import { PROVIDER_PRESETS } from '@shared/provider-presets'
import { Badge } from '../../common/Badge'
import { Button } from '../../common/Button'
import { CheckboxField, Field, Select, Textarea, TextInput } from '../../common/Field'
import { ConfirmDialog, Modal } from '../../common/Modal'
import { useToast } from '../../state/ToastContext'

interface ProviderEditorProps {
  type: ProviderType
  provider: ProviderView | null
  onClose: () => void
  onSaved: () => void
}

interface ModelDraft extends ProviderModel {}

function newModel(): ModelDraft {
  return { id: '', label: '', supportsWebSearch: false, supportsTools: false, costTier: 'free' }
}

function newProviderId(type: ProviderType): string {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function parseHeaders(text: string): Record<string, string> | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Headers phải là một object JSON, ví dụ {"X-Api-Version": "1"}')
  }
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      throw new Error(`Giá trị header "${key}" phải là chuỗi`)
    }
    result[key] = value
  }
  return result
}

export function ProviderEditor({ type, provider, onClose, onSaved }: ProviderEditorProps): React.JSX.Element {
  const { pushToast } = useToast()
  const preset = PROVIDER_PRESETS[type]
  const isCustom = type === 'custom'

  const [name, setName] = useState(provider?.name ?? preset.name)
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '')
  const [models, setModels] = useState<ModelDraft[]>(provider ? provider.models.map((model) => ({ ...model })) : [])
  const [apiKey, setApiKey] = useState('')
  const [changingKey, setChangingKey] = useState(!provider?.hasApiKey)
  const [headersText, setHeadersText] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(isCustom)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [testingModelId, setTestingModelId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({})

  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        name: provider?.name ?? preset.name,
        baseUrl: provider?.baseUrl ?? '',
        models: provider?.models ?? []
      }),
    [provider, preset.name]
  )

  const currentSnapshot = JSON.stringify({ name, baseUrl, models })
  const dirty = initialSnapshot !== currentSnapshot || apiKey.trim().length > 0 || headersText.trim().length > 0
  const canTest = provider !== null && !dirty

  function updateModel(index: number, patch: Partial<ModelDraft>): void {
    setModels((current) => current.map((model, position) => (position === index ? { ...model, ...patch } : model)))
  }

  function removeModel(index: number): void {
    setModels((current) => current.filter((_, position) => position !== index))
  }

  async function handleSave(): Promise<void> {
    setError(null)
    const providerName = isCustom ? name.trim() : preset.name
    if (providerName.length === 0) {
      setError('Nhập tên Provider')
      return
    }
    const resolvedBaseUrl = baseUrl.trim().length > 0 ? baseUrl.trim() : null
    if (isCustom && !resolvedBaseUrl) {
      setError('Provider Custom cần Base URL')
      return
    }
    if (models.length === 0) {
      setError('Thêm ít nhất một Model')
      return
    }
    const cleanedModels: ProviderModel[] = []
    const seen = new Set<string>()
    for (const model of models) {
      const id = model.id.trim()
      const label = model.label.trim()
      if (id.length === 0 || label.length === 0) {
        setError('Mỗi Model cần có Model ID và tên hiển thị')
        return
      }
      if (seen.has(id)) {
        setError(`Model ID "${id}" bị trùng`)
        return
      }
      seen.add(id)
      cleanedModels.push({
        id,
        label,
        supportsWebSearch: model.supportsWebSearch,
        supportsTools: model.supportsTools,
        costTier: model.costTier
      })
    }

    let headers: Record<string, string> | undefined
    try {
      headers = parseHeaders(headersText)
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Headers không hợp lệ')
      return
    }

    setSaving(true)
    const result = await window.api.settings.saveProvider({
      provider: {
        id: provider?.id ?? newProviderId(type),
        type,
        name: providerName,
        baseUrl: resolvedBaseUrl,
        models: cleanedModels
      },
      apiKey: apiKey.trim().length > 0 ? apiKey.trim() : undefined,
      headers
    })
    setSaving(false)

    if (!result.ok) {
      setError(result.error.message)
      pushToast(result.error.message, 'error')
      return
    }
    pushToast(provider ? 'Đã cập nhật Provider' : 'Đã thêm Provider', 'success')
    onSaved()
    onClose()
  }

  async function handleDelete(): Promise<void> {
    if (!provider) {
      return
    }
    setSaving(true)
    const result = await window.api.settings.deleteProvider(provider.id)
    setSaving(false)
    setConfirmDelete(false)
    if (!result.ok) {
      setError(result.error.message)
      pushToast(result.error.message, 'error')
      return
    }
    pushToast('Đã xóa Provider', 'success')
    onSaved()
    onClose()
  }

  async function handleTest(modelId: string): Promise<void> {
    if (!provider) {
      return
    }
    setTestingModelId(modelId)
    const result = await window.api.settings.testProvider({ providerId: provider.id, modelId })
    setTestingModelId(null)
    if (result.ok) {
      setTestResults((current) => ({ ...current, [modelId]: result.data }))
      return
    }
    setTestResults((current) => ({
      ...current,
      [modelId]: { ok: false, message: result.error.message, supportsTools: false, supportsWebSearch: false }
    }))
  }

  return (
    <>
      <Modal
        open
        wide
        title={provider ? `Chỉnh sửa ${provider.name}` : `Thêm ${preset.name}`}
        onClose={onClose}
        closeDisabled={saving}
        footer={
          <div className="modal-footer-split">
            <div>
              {provider ? (
                <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                  Xóa Provider
                </Button>
              ) : null}
            </div>
            <div className="row">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                Hủy
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
                Lưu
              </Button>
            </div>
          </div>
        }
      >
        {isCustom ? (
          <Field label="Tên Provider" htmlFor="provider-name">
            <TextInput
              id="provider-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              placeholder="Ví dụ: Gateway nội bộ"
            />
          </Field>
        ) : null}

        <Field
          label="API Key"
          hint={
            provider?.hasApiKey && !changingKey
              ? 'Khóa đã được lưu bằng mã hóa của hệ điều hành.'
              : 'Khóa chỉ lưu trên máy này, không hiện lại sau khi lưu.'
          }
        >
          {provider?.hasApiKey && !changingKey ? (
            <div className="row">
              <span className="key-mask" aria-label="API Key đã lưu">
                ••••••
              </span>
              <Button size="sm" onClick={() => setChangingKey(true)}>
                Thay khóa
              </Button>
            </div>
          ) : (
            <TextInput
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={provider?.hasApiKey ? 'Nhập khóa mới' : 'Dán API Key'}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>

        <div className="section-title">
          <h3>Model</h3>
          <Button size="sm" onClick={() => setModels((current) => [...current, newModel()])} disabled={models.length >= 100}>
            + Add Model
          </Button>
        </div>
        <p className="field__hint">
          Đặt tay cờ Web search / Tool calling theo khả năng thật của Model. Nhãn Free/Paid do bạn chọn. Nút Test dùng
          cấu hình đã lưu, nên hãy Lưu trước khi Test.
        </p>

        {models.length === 0 ? <p className="muted">Chưa có Model nào. Bấm “Add Model”.</p> : null}

        <div className="model-list">
          {models.map((model, index) => {
            const testKey = model.id.trim()
            const testResult = testKey.length > 0 ? testResults[testKey] : undefined
            const isTesting = testingModelId !== null && testingModelId === testKey
            return (
              <div className="model-editor" key={index}>
                <div className="model-editor__grid">
                  <Field label="Model ID">
                    <TextInput
                      value={model.id}
                      onChange={(event) => updateModel(index, { id: event.target.value })}
                      placeholder="gpt-5"
                      spellCheck={false}
                    />
                  </Field>
                  <Field label="Tên hiển thị">
                    <TextInput
                      value={model.label}
                      onChange={(event) => updateModel(index, { label: event.target.value })}
                      placeholder="GPT-5"
                    />
                  </Field>
                  <Field label="Gói">
                    <Select
                      value={model.costTier}
                      onChange={(event) => updateModel(index, { costTier: event.target.value as 'free' | 'paid' })}
                    >
                      <option value="free">Free</option>
                      <option value="paid">Paid</option>
                    </Select>
                  </Field>
                </div>

                <div className="row row--wrap">
                  <CheckboxField
                    label="Web search"
                    checked={model.supportsWebSearch}
                    onChange={(checked) => updateModel(index, { supportsWebSearch: checked })}
                  />
                  <CheckboxField
                    label="Tool calling"
                    checked={model.supportsTools}
                    onChange={(checked) => updateModel(index, { supportsTools: checked })}
                  />
                  <span className="spacer" />
                  <Button
                    size="sm"
                    loading={isTesting}
                    onClick={() => void handleTest(testKey)}
                    disabled={!canTest || testKey.length === 0 || isTesting}
                    title={canTest ? 'Kiểm tra Model này' : 'Lưu thay đổi trước khi Test'}
                  >
                    Test
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeModel(index)}>
                    Xóa
                  </Button>
                </div>

                {testResult ? (
                  <div className={`test-result ${testResult.ok ? 'test-result--ok' : 'test-result--failed'}`} role="status">
                    <div className="row row--wrap">
                      <Badge tone={testResult.ok ? 'verified' : 'error'}>{testResult.ok ? 'OK' : 'Failed'}</Badge>
                      <Badge tone={testResult.supportsTools ? 'verified' : 'neutral'}>
                        Tool calling: {testResult.supportsTools ? 'có' : 'không'}
                      </Badge>
                      <Badge tone={testResult.webSearchProbe === 'used' ? 'info' : 'neutral'}>
                        Web search:{' '}
                        {testResult.webSearchProbe === 'used'
                          ? 'hoạt động'
                          : testResult.webSearchProbe === 'not_detected'
                            ? 'không phát hiện dấu vết tìm kiếm'
                            : testResult.supportsWebSearch
                              ? 'đã khai báo (chưa chạy thử)'
                              : 'chưa bật'}
                      </Badge>
                    </div>
                    <p>{testResult.message}</p>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        <div className="settings-advanced">
          <Button size="sm" variant="ghost" onClick={() => setAdvancedOpen((current) => !current)}>
            {advancedOpen ? '▾' : '▸'} Nâng cao
          </Button>
          {advancedOpen ? (
            <div className="stack">
              <Field
                label="Base URL"
                hint={
                  isCustom
                    ? 'Bắt buộc. Ví dụ: https://api.example.com/v1 (OpenAI-compatible).'
                    : `Tùy chọn. Để trống dùng mặc định: ${preset.baseUrl}`
                }
              >
                <TextInput
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder={preset.baseUrl || 'https://...'}
                  spellCheck={false}
                />
              </Field>
              <Field
                label="Headers bổ sung (JSON)"
                hint='Tùy chọn, ví dụ {"X-Api-Version": "1"}. Để trống để giữ header đã lưu.'
              >
                <Textarea
                  value={headersText}
                  onChange={(event) => setHeadersText(event.target.value)}
                  placeholder='{"X-Api-Version": "1"}'
                  spellCheck={false}
                />
              </Field>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Xóa Provider"
        message={
          <div className="stack">
            <p>
              Xóa <strong>{provider?.name}</strong> cùng toàn bộ Model và API Key đã lưu? Các dự án và doanh thu không bị
              ảnh hưởng.
            </p>
            <p className="muted">Hành động này không thể hoàn tác.</p>
          </div>
        }
        confirmLabel="Xóa"
        danger
        busy={saving}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}
