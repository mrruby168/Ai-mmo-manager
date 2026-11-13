import { useEffect, useState } from 'react'
import { WEB_SEARCH_PROVIDERS } from '@shared/constants'
import type { WebSearchProvider } from '@shared/constants'
import type { WebSearchSettings, WebSearchTestResult } from '@shared/types'
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

  return (
    <div className="stack">
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
