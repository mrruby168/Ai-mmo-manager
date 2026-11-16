import { useEffect, useState } from 'react'
import { WEB_SEARCH_PROVIDERS } from '@shared/constants'
import type { WebSearchProvider } from '@shared/constants'
import type { NewsScanSettings, WebSearchSettings, WebSearchTestResult } from '@shared/types'
import { Button } from '../../common/Button'
import { Field, Select, TextInput } from '../../common/Field'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'

const PROVIDER_LABEL: Record<WebSearchProvider, string> = {
  none: 'Không dùng Web Search',
  tavily: 'Tavily',
  brave: 'Brave Search',
  searxng: 'SearXNG (instance tự dựng)'
}

const NEEDS_KEY: ReadonlySet<WebSearchProvider> = new Set(['tavily', 'brave'])

interface WebSearchPanelProps {
  webSearch: WebSearchSettings
  onChanged: () => void
}

/**
 * FIX 3 / D2: cấu hình Web Search do app cung cấp. API key chỉ gửi xuống main,
 * chưa bao giờ được trả ngược về renderer — nên UI chỉ biết `hasApiKey`.
 */
export function WebSearchPanel({ webSearch, onChanged }: WebSearchPanelProps): React.JSX.Element {
  const { isAiBusy } = useLock()
  const { pushToast } = useToast()
  const [provider, setProvider] = useState<WebSearchProvider>(webSearch.provider)
  const [baseUrl, setBaseUrl] = useState(webSearch.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<WebSearchTestResult | null>(null)
  // v0.1.4: mode Check News nằm cùng nhóm Web Search. SettingsPage không truyền
  // prop này nên panel tự đọc settings (chỉ đọc, không sửa SettingsPage).
  const [scanSettings, setScanSettings] = useState<NewsScanSettings | null>(null)
  const [scanSaving, setScanSaving] = useState(false)
  const [aiModeOn, setAiModeOn] = useState(true)

  useEffect(() => {
    let active = true
    void window.api.settings.get().then((result) => {
      if (!active || !result.ok) {
        return
      }
      setScanSettings(result.data.newsScan)
      setAiModeOn(result.data.aiMode === 'ai')
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setProvider(webSearch.provider)
    setBaseUrl(webSearch.baseUrl ?? '')
  }, [webSearch.provider, webSearch.baseUrl])

  useEffect(() => {
    let active = true
    void window.api.settings.webSearch().then((result) => {
      if (!active || !result.ok) {
        return
      }
      setHasApiKey(result.data.hasApiKey)
    })
    return () => {
      active = false
    }
  }, [webSearch.provider])

  const busy = isAiBusy || saving || testing
  const needsKey = NEEDS_KEY.has(provider)
  const keyAlreadySaved = needsKey && hasApiKey

  async function handleSave(): Promise<void> {
    setError(null)
    setTestResult(null)
    setSaving(true)
    const result = await window.api.settings.saveWebSearch({
      provider,
      baseUrl: provider === 'searxng' ? baseUrl : null,
      apiKey: apiKey.trim().length > 0 ? apiKey.trim() : undefined
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error.message)
      pushToast(result.error.message, 'error')
      return
    }
    setApiKey('')
    setHasApiKey(result.data.hasApiKey)
    pushToast('Đã lưu cấu hình Web Search', 'success')
    onChanged()
  }

  async function handleTest(): Promise<void> {
    setError(null)
    setTestResult(null)
    setTesting(true)
    const result = await window.api.settings.testWebSearch({
      provider,
      baseUrl: provider === 'searxng' ? baseUrl : null,
      apiKey: apiKey.trim().length > 0 ? apiKey.trim() : undefined
    })
    setTesting(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setTestResult(result.data)
    if (!result.data.ok) {
      pushToast(result.data.message, 'error')
    }
  }

  async function handleSaveScan(): Promise<void> {
    if (!scanSettings || scanSaving || isAiBusy) {
      return
    }
    setScanSaving(true)
    const result = await window.api.settings.saveNewsScan(scanSettings)
    setScanSaving(false)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    setScanSettings(result.data.newsScan)
    pushToast('Đã lưu chế độ Check News', 'success')
    onChanged()
  }

  return (
    <div className="stack">
      {aiModeOn && scanSettings ? (
        <section className="card stack">
          <div className="section-title">
            <h2>Chế độ Check News</h2>
            <span className="muted">{scanSettings.defaultMode === 'daily' ? 'Daily Scan' : 'Full Scan'}</span>
          </div>
          <p className="muted">
            Daily Scan quét nhanh tin trong 2–3 ngày và bỏ qua dự án vừa quét, phù hợp bấm nhiều lần trong ngày. Full Scan
            quét sâu 7 ngày và kiểm tra lại mọi dự án chưa có trong cache. Cả hai đều chỉ dùng được ở AI Mode.
          </p>

          <Field label="Chế độ mặc định" htmlFor="news-scan-mode" hint="Nút chính trên trang News dùng chế độ này.">
            <Select
              id="news-scan-mode"
              value={scanSettings.defaultMode}
              disabled={isAiBusy || scanSaving}
              onChange={(event) =>
                setScanSettings({ ...scanSettings, defaultMode: event.target.value === 'daily' ? 'daily' : 'full' })
              }
            >
              <option value="full">Full Scan (7 ngày)</option>
              <option value="daily">Daily Scan (2–3 ngày)</option>
            </Select>
          </Field>

          <Field
            label="Daily bỏ qua dự án đã quét trong"
            htmlFor="news-scan-interval"
            hint="Dự án vừa quét trong khoảng này sẽ được bỏ qua nếu link không đổi."
          >
            <Select
              id="news-scan-interval"
              value={String(scanSettings.dailyMinIntervalHours)}
              disabled={isAiBusy || scanSaving}
              onChange={(event) =>
                setScanSettings({
                  ...scanSettings,
                  dailyMinIntervalHours: Number(event.target.value) as NewsScanSettings['dailyMinIntervalHours']
                })
              }
            >
              <option value="3">3 giờ</option>
              <option value="12">12 giờ</option>
              <option value="24">24 giờ</option>
            </Select>
          </Field>

          <Field
            label="Cửa sổ tin của Daily"
            htmlFor="news-scan-window"
            hint="Chỉ nhận tin có ngày đăng trong khoảng này (tính cả hôm nay)."
          >
            <Select
              id="news-scan-window"
              value={String(scanSettings.dailyWindowDays)}
              disabled={isAiBusy || scanSaving}
              onChange={(event) =>
                setScanSettings({
                  ...scanSettings,
                  dailyWindowDays: Number(event.target.value) as NewsScanSettings['dailyWindowDays']
                })
              }
            >
              <option value="2">2 ngày</option>
              <option value="3">3 ngày</option>
            </Select>
          </Field>

          <div className="row">
            <Button variant="primary" loading={scanSaving} disabled={isAiBusy || scanSaving} onClick={() => void handleSaveScan()}>
              Lưu chế độ
            </Button>
          </div>
        </section>
      ) : null}

      <section className="card stack">
        <div className="section-title">
          <h2>Web Search</h2>
          <span className="muted">{PROVIDER_LABEL[provider]}</span>
        </div>
        <p className="muted">
          App dùng Web Search này khi Model không có tìm kiếm web gốc (ví dụ OpenRouter free). Check News sẽ tìm và xác minh tin
          trong 7 ngày gần nhất; Scan Project dùng Web Search này để tra cứu dự án. API key lưu trong kho bảo mật của app, không hiện lại và không ghi log.
        </p>

        <Field label="Nhà cung cấp" htmlFor="web-search-provider">
          <Select
            id="web-search-provider"
            value={provider}
            disabled={busy}
            onChange={(event) => {
              setProvider(event.target.value as WebSearchProvider)
              setError(null)
              setTestResult(null)
            }}
          >
            {WEB_SEARCH_PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {PROVIDER_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        {provider === 'searxng' ? (
          <Field
            label="URL instance SearXNG"
            htmlFor="web-search-base-url"
            hint="Ví dụ https://searx.example.org. Instance phải bật định dạng JSON trong settings.yml."
          >
            <TextInput
              id="web-search-base-url"
              value={baseUrl}
              disabled={busy}
              placeholder="https://searx.example.org"
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </Field>
        ) : null}

        {needsKey ? (
          <Field
            label="API key"
            htmlFor="web-search-api-key"
            hint={
              keyAlreadySaved
                ? 'Đã lưu key. Để trống nếu không đổi.'
                : provider === 'tavily'
                  ? 'Lấy key tại tavily.com.'
                  : 'Lấy key tại api-dashboard.search.brave.com.'
            }
          >
            <TextInput
              id="web-search-api-key"
              type="password"
              value={apiKey}
              disabled={busy}
              autoComplete="off"
              placeholder={keyAlreadySaved ? '•••••••• (đã lưu)' : 'Dán API key'}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </Field>
        ) : null}

        <div className="row">
          <Button variant="primary" loading={saving} disabled={busy} onClick={() => void handleSave()}>
            Lưu
          </Button>
          <Button
            variant="secondary"
            loading={testing}
            disabled={busy || provider === 'none'}
            onClick={() => void handleTest()}
          >
            Thử kết nối
          </Button>
        </div>

        {error ? (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        ) : null}

        {testResult ? (
          <div
            className={`banner ${testResult.ok ? 'banner--success' : 'banner--error'}`}
            role={testResult.ok ? 'status' : 'alert'}
          >
            {testResult.message}
          </div>
        ) : null}
      </section>
    </div>
  )
}
