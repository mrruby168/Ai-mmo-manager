import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, ProviderView } from '@shared/types'
import { Button } from '../../common/Button'
import { ErrorBlock, LoadingBlock } from '../../common/EmptyState'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { AiSettingsPanel } from './AiSettingsPanel'
import { AiModePanel } from './AiModePanel'
import { AppearancePanel } from './AppearancePanel'
import { DataPathPanel } from './DataPathPanel'
import { WebSearchPanel } from './WebSearchPanel'

type SettingsSection = 'ai' | 'websearch' | 'data' | 'appearance'

const SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'ai', label: 'AI Settings' },
  { id: 'websearch', label: 'Web Search' },
  { id: 'data', label: 'Data Path' },
  { id: 'appearance', label: 'Appearance' }
]

export function SettingsPage(): React.JSX.Element {
  const { dataVersion, refreshData } = useApp()
  const { isAiBusy } = useLock()
  const [section, setSection] = useState<SettingsSection>('ai')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [providers, setProviders] = useState<ProviderView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [settingsResult, providersResult] = await Promise.all([window.api.settings.get(), window.api.settings.providers()])
    if (!settingsResult.ok) {
      setError(settingsResult.error.message)
      setLoading(false)
      return
    }
    if (!providersResult.ok) {
      setError(providersResult.error.message)
      setLoading(false)
      return
    }
    setSettings(settingsResult.data)
    setProviders(providersResult.data)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  return (
    <>
      <div className="page-header">
        <div className="page-header__title">
          <h1>Settings</h1>
          <span className="page-header__subtitle">Provider AI, thư mục dữ liệu và giao diện</span>
        </div>
        {isAiBusy ? <span className="muted">AI đang thực thi — hoàn tất trước khi chỉnh Settings</span> : null}
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Nhóm cài đặt">
        <div className="segmented">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={section === item.id}
              className={`segmented__item${section === item.id ? ' segmented__item--active' : ''}`}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !settings ? <LoadingBlock message="Đang tải cài đặt…" /> : null}

      {error ? <ErrorBlock message={error} action={<Button onClick={() => void load()}>Thử lại</Button>} /> : null}

      {!error && settings ? <AiModePanel aiMode={settings.aiMode} onChanged={refreshData} /> : null}

      {!error && settings ? (
        <div className="settings-panel">
          {section === 'ai' ? <AiSettingsPanel providers={providers} onChanged={refreshData} /> : null}
          {section === 'websearch' ? (
            <WebSearchPanel webSearch={settings.webSearch} onChanged={refreshData} />
          ) : null}
          {section === 'data' ? (
            <DataPathPanel dataPath={settings.dataPath} onChanged={refreshData} />
          ) : null}
          {section === 'appearance' ? <AppearancePanel /> : null}
        </div>
      ) : null}
    </>
  )
}
