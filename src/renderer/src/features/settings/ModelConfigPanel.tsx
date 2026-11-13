import { Fragment, useEffect, useState } from 'react'
import { formatNewsCacheTtl } from '@shared/costControl'
import {
  appSearchConfigured,
  chainSlot,
  chainWarnings,
  listModelChoices,
  selectionFromKey,
  selectionKey,
  setChainSlot
} from '@shared/modelConfig'
import { NEWS_CACHE_TTL_OPTIONS_MS } from '@shared/types'
import type { AiSettings, ModelChain, ModelTask, ProviderView, TaskModels, WebSearchView } from '@shared/types'
import { Listbox } from '../../common/Listbox'
import type { ListboxOption } from '../../common/Listbox'
import { ProviderLogo } from '../../common/ProviderLogo'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'

interface ModelConfigPanelProps {
  ai: AiSettings
  providers: ProviderView[]
  onChanged: () => void
}

const ROWS: Array<{ task: ModelTask; label: string; hint: string }> = [
  { task: 'news', label: 'News', hint: 'Check News' },
  { task: 'scan', label: 'Scan Project', hint: 'Scan dự án' },
  { task: 'chat', label: 'AI Chat Box', hint: 'Model đang chọn ở Chat Box là A1' }
]

const SLOT_LABELS = ['A1 (chính)', 'A2 (dự phòng)', 'A3 (dự phòng 2)'] as const

/**
 * FIX 2: tab Settings → Model Configuration.
 * Mỗi tác vụ có chuỗi A1 → A2 → A3; lưu ngay khi đổi qua IPC `settings:setModelConfig`.
 */
export function ModelConfigPanel({ ai, providers, onChanged }: ModelConfigPanelProps): React.JSX.Element {
  const { isAiBusy } = useLock()
  const { pushToast } = useToast()

  const [chains, setChains] = useState<TaskModels>(ai.taskModels)
  const [ttl, setTtl] = useState(ai.newsCacheTtlMs)
  const [saving, setSaving] = useState<ModelTask | null>(null)
  const [searchView, setSearchView] = useState<WebSearchView | null>(null)
  const [searchViewLoaded, setSearchViewLoaded] = useState(false)

  // SettingsPage nạp lại settings sau mỗi lần lưu; đồng bộ lại state theo server.
  useEffect(() => {
    setChains(ai.taskModels)
    setTtl(ai.newsCacheTtlMs)
  }, [ai.taskModels, ai.newsCacheTtlMs])

  useEffect(() => {
    let cancelled = false
    void window.api.settings.webSearch().then((result) => {
      if (cancelled) {
        return
      }
      if (result.ok) {
        setSearchView(result.data)
      }
      setSearchViewLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const choices = listModelChoices(providers)
  const appSearch = appSearchConfigured(searchView)
  const disabled = isAiBusy || saving !== null || choices.length === 0

  async function save(task: ModelTask, chain: ModelChain, nextTtl = ttl): Promise<void> {
    setSaving(task)
    const input = task === 'news' ? { task, chain, newsCacheTtlMs: nextTtl } : { task, chain }
    const result = await window.api.settings.setModelConfig(input)
    setSaving(null)
    if (!result.ok) {
      pushToast(result.error.message, 'error')
      return
    }
    setChains(result.data.ai.taskModels)
    setTtl(result.data.ai.newsCacheTtlMs)
    onChanged()
  }

  function handleSlotChange(task: ModelTask, index: number, value: string): void {
    const next = setChainSlot(chains[task], index, selectionFromKey(value))
    setChains((current) => ({ ...current, [task]: next }))
    void save(task, next)
  }

  function handleTtlChange(value: number): void {
    setTtl(value)
    void save('news', chains.news, value)
  }

  function optionsFor(chain: ModelChain, index: number): ListboxOption[] {
    const usedElsewhere = new Set(
      chain.filter((_, slot) => slot !== index).map((selection) => selectionKey(selection))
    )
    const options: ListboxOption[] = choices.map((choice) => ({
      value: choice.key,
      label: choice.label,
      badge: choice.costTier === 'paid' ? 'Paid' : 'Free',
      icon: <ProviderLogo name={choice.providerName} baseUrl={choice.providerBaseUrl} size={18} />,
      disabled: usedElsewhere.has(choice.key)
    }))
    if (index > 0) {
      options.unshift({ value: '', label: 'Không dùng' })
    }
    return options
  }

  return (
    <div className="stack">
      <section className="card stack">
        <div className="section-title">
          <h2>Model Configuration</h2>
          <span className="muted">
            {choices.length} model từ {providers.length} Provider
          </span>
        </div>

        <p className="muted">
          A2/A3 chỉ dùng khi A1 lỗi (hết token, giới hạn tần suất, timeout, lỗi tool calling) và tự chuyển lần lượt.
          Không chọn trùng model trong cùng một hàng.
        </p>

        {choices.length === 0 ? (
          <div className="banner banner--info">
            Chưa có Model nào. Vào tab AI Settings để thêm Provider và Model trước, sau đó quay lại đây chọn A1/A2/A3.
          </div>
        ) : null}

        <div className="model-config__scroll">
          <table className="model-config">
            <thead>
              <tr>
                <th scope="col">Vai trò</th>
                {SLOT_LABELS.map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
                <th scope="col">Cache TTL</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const chain = chains[row.task]
                const warnings = chainWarnings(row.task, chain, choices, appSearch)
                return (
                  <Fragment key={row.task}>
                    <tr>
                      <th scope="row" className="model-config__role-cell">
                        <span className="model-config__role">
                          <span>{row.label}</span>
                          <span className="muted">{row.hint}</span>
                        </span>
                      </th>
                      {SLOT_LABELS.map((slotLabel, index) => (
                        <td key={slotLabel}>
                          <Listbox
                            ariaLabel={`${row.label} — ${slotLabel}`}
                            options={optionsFor(chain, index)}
                            value={selectionKey(chainSlot(chain, index))}
                            placeholder={index === 0 ? 'Chọn Model' : 'Không dùng'}
                            disabled={disabled}
                            onChange={(value) => handleSlotChange(row.task, index, value)}
                          />
                        </td>
                      ))}
                      <td className="model-config__ttl">
                        {row.task === 'news' ? (
                          <div className="stack model-config__ttl-body">
                            <div className="segmented" role="group" aria-label="Cache TTL của Check News">
                              {NEWS_CACHE_TTL_OPTIONS_MS.map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  className={`segmented__item${ttl === value ? ' segmented__item--active' : ''}`}
                                  aria-pressed={ttl === value}
                                  disabled={disabled}
                                  onClick={() => handleTtlChange(value)}
                                >
                                  {formatNewsCacheTtl(value)}
                                </button>
                              ))}
                            </div>
                            <span className="muted model-config__note">
                              {ttl === NEWS_CACHE_TTL_OPTIONS_MS[0]
                                ? '1 phút: dùng để test đầu ra.'
                                : 'Dự án đã kiểm tra trong thời gian này và link không đổi sẽ không gọi lại AI/Search.'}
                            </span>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={SLOT_LABELS.length + 2} className="model-config__issues">
                        {chain.length === 0 ? (
                          <p className="muted">
                            {row.task === 'chat'
                              ? 'Chưa chọn model — Chat Box dùng model đang chọn trong khung Chat.'
                              : 'Chưa chọn model — tác vụ này dùng model Chat Box làm mặc định.'}
                          </p>
                        ) : null}
                        {warnings.map((warning) => (
                          <p className="ai-task-picker__warning" role="alert" key={warning.index}>
                            {warning.message}
                          </p>
                        ))}
                        {(row.task === 'news' || row.task === 'scan') && chain.length > 0 && !appSearch && searchViewLoaded ? (
                          <p className="muted model-config__note">
                            {row.task === 'news'
                              ? 'App chưa cấu hình Web Search: News chỉ chạy được với model có Web Search gốc.'
                              : 'App chưa cấu hình Web Search: Scan chỉ chạy được với model có Web Search gốc.'}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
