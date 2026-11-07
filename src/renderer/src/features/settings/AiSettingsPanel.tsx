import { useRef, useState } from 'react'
import type { ProviderType } from '@shared/constants'
import { PROVIDER_PRESETS } from '@shared/provider-presets'
import type { ProviderConfig, ProviderView } from '@shared/types'
import { Badge } from '../../common/Badge'
import { Button } from '../../common/Button'
import { Modal } from '../../common/Modal'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'
import { JsonHelpDialog } from './JsonHelpDialog'
import { ProviderEditor } from './ProviderEditor'

interface AiSettingsPanelProps {
  providers: ProviderView[]
  onChanged: () => void
}

interface EditingTarget {
  type: ProviderType
  provider: ProviderView | null
}

interface JsonPreview {
  providers: ProviderConfig[]
  errors: string[]
}

const BUILT_IN_TYPES: ProviderType[] = ['openai', 'anthropic', 'opencode', 'google']

export function AiSettingsPanel({ providers, onChanged }: AiSettingsPanelProps): React.JSX.Element {
  const { isAiBusy } = useLock()
  const { pushToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState<EditingTarget | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [preview, setPreview] = useState<JsonPreview | null>(null)
  const [importing, setImporting] = useState(false)

  function providersOfType(type: ProviderType): ProviderView[] {
    return providers.filter((provider) => provider.type === type)
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    if (file.size > 200_000) {
      pushToast('File JSON lớn hơn 200 KB', 'error')
      return
    }
    const text = await file.text()
    const result = await window.api.settings.parseProviderJson(text)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    setJsonText(text)
    setPreview(result.data)
  }

  async function handleImport(): Promise<void> {
    if (!preview || preview.errors.length > 0) {
      return
    }
    setImporting(true)
    const result = await window.api.settings.saveProvider({ json: jsonText })
    setImporting(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    setPreview(null)
    pushToast(`Đã nhập ${preview.providers.length} Provider từ JSON`, 'success')
    onChanged()
  }

  async function handleExport(): Promise<void> {
    const result = await window.api.settings.exportConfig()
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    if (result.data.canceled) {
      return
    }
    pushToast(`Đã xuất ${result.data.count} Provider (không kèm API Key): ${result.data.filePath}`, 'success')
  }

  function renderProviderRow(type: ProviderType, provider: ProviderView | null): React.JSX.Element {
    const preset = PROVIDER_PRESETS[type]
    return (
      <div className="settings-provider" key={provider?.id ?? type}>
        <div className="settings-provider__info">
          <div className="settings-provider__name">
            {provider?.name ?? preset.name}
            {provider ? (
              <Badge tone={provider.hasApiKey ? 'verified' : 'warning'}>
                {provider.hasApiKey ? 'Đã cấu hình' : 'Thiếu API Key'}
              </Badge>
            ) : (
              <Badge tone="neutral">Chưa cấu hình</Badge>
            )}
          </div>
          <span className="settings-provider__meta">
            {provider
              ? `${provider.models.length} Model · ${provider.models
                  .slice(0, 3)
                  .map((model) => model.label)
                  .join(', ')}${provider.models.length > 3 ? '…' : ''}`
              : preset.description}
          </span>
        </div>
        <div className="row">
          <Button
            size="sm"
            variant={provider ? 'secondary' : 'primary'}
            disabled={isAiBusy}
            onClick={() => setEditing({ type, provider })}
          >
            {provider ? 'Chỉnh sửa' : 'Thêm'}
          </Button>
        </div>
      </div>
    )
  }

  const customProviders = providersOfType('custom')

  return (
    <div className="stack">
      <div className="settings-toolbar">
        <Button variant="primary" disabled={isAiBusy} onClick={() => fileInputRef.current?.click()}>
          Upload JSON
        </Button>
        <Button iconOnly aria-label="Help JSON" title="Hướng dẫn JSON" onClick={() => setHelpOpen(true)}>
          ?
        </Button>
        <Button variant="secondary" disabled={isAiBusy || providers.length === 0} onClick={() => void handleExport()}>
          Export cấu hình
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(event) => void handleFileChange(event)}
        />
        <span className="muted">Cấu hình được lưu trên máy. API Key mã hóa bằng hệ điều hành.</span>
      </div>

      <section className="card stack">
        <div className="section-title">
          <h2>Provider</h2>
          <span className="muted">{providers.length} đã cấu hình</span>
        </div>
        {providers.length === 0 ? (
          <div className="banner banner--info">
            Chưa có Provider nào. Thêm thủ công hoặc Upload JSON. Model cần bật đúng cờ Tool calling / Web search để dùng
            cho Scan, News và Chat.
          </div>
        ) : null}
        <div className="settings-list">
          {BUILT_IN_TYPES.map((type) => {
            const existing = providersOfType(type)
            if (existing.length === 0) {
              return renderProviderRow(type, null)
            }
            return (
              <div key={type} className="stack">
                {existing.map((provider) => renderProviderRow(type, provider))}
              </div>
            )
          })}
        </div>

        <div className="section-title">
          <h2>Custom</h2>
          <Button size="sm" disabled={isAiBusy} onClick={() => setEditing({ type: 'custom', provider: null })}>
            + Thêm Custom
          </Button>
        </div>
        {customProviders.length === 0 ? (
          <p className="muted">Chưa có Provider Custom. Dùng khi endpoint tương thích OpenAI nhưng không nằm trong 4 loại trên.</p>
        ) : (
          <div className="settings-list">
            {customProviders.map((provider) => renderProviderRow('custom', provider))}
          </div>
        )}
      </section>

      {editing ? (
        <ProviderEditor
          key={editing.provider?.id ?? `new-${editing.type}`}
          type={editing.type}
          provider={editing.provider}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      ) : null}

      <JsonHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Modal
        open={preview !== null}
        wide
        title="Xem trước cấu hình JSON"
        closeDisabled={importing}
        onClose={() => setPreview(null)}
        footer={
          preview && preview.errors.length > 0 ? (
            <>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Đóng
              </Button>
              <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                Chọn file khác
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={importing}>
                Hủy
              </Button>
              <Button variant="primary" loading={importing} onClick={() => void handleImport()}>
                Áp dụng
              </Button>
            </>
          )
        }
      >
        {preview && preview.errors.length > 0 ? (
          <>
            <div className="banner banner--error" role="alert">
              File JSON chưa hợp lệ, chưa có gì được lưu:
            </div>
            <ul className="help-list">
              {preview.errors.map((error) => (
                <li key={error} className="mono">
                  {error}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {preview && preview.errors.length === 0 ? (
          <>
            <p>
              File hợp lệ. App sẽ thiết lập <strong>{preview.providers.length} Provider</strong> và{' '}
              <strong>{preview.providers.reduce((sum, provider) => sum + provider.models.length, 0)} Model</strong>.
            </p>
            <div className="settings-list">
              {preview.providers.map((provider) => (
                <div className="settings-provider" key={provider.id}>
                  <div className="settings-provider__info">
                    <div className="settings-provider__name">
                      {provider.name}
                      <Badge tone="info">{PROVIDER_PRESETS[provider.type].name}</Badge>
                    </div>
                    <span className="settings-provider__meta">
                      {provider.models.map((model) => model.label).join(', ')}
                    </span>
                    <span className="settings-provider__meta mono">{provider.baseUrl ?? 'Base URL mặc định'}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="muted">
              API Key trong file (nếu có) sẽ được mã hóa bằng hệ điều hành và không hiển thị lại. Bản xem trước không hiện
              khóa.
            </p>
          </>
        ) : null}
      </Modal>
    </div>
  )
}
