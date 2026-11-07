import { useEffect, useRef, useState } from 'react'
import type { AppSettings, ChatChoice, PendingAction } from '@shared/types'
import { Button } from '../../common/Button'
import { Select } from '../../common/Field'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  text: string
  choices?: ChatChoice[]
  pendingAction?: PendingAction | null
}

const QUICK_ACTIONS = ['Thêm dự án', 'Sửa dự án', 'Xóa dự án'] as const

interface ChatIconProps {
  size?: number
}

function SparkleIcon({ size = 16 }: ChatIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M11 2.6l1.85 5 5 1.85-5 1.85L11 16.3l-1.85-5-5-1.85 5-1.85L11 2.6z" />
      <path d="M18.4 14.4l.95 2.45 2.45.95-2.45.95-.95 2.45-.95-2.45-2.45-.95 2.45-.95.95-2.45z" />
    </svg>
  )
}

function RefreshIcon({ size = 18 }: ChatIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4.5V9h-4.5" />
    </svg>
  )
}

function CloseIcon({ size = 18 }: ChatIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function PlusIcon({ size = 16 }: ChatIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function PencilIcon({ size = 16 }: ChatIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
      <path d="M13.6 6.4l4 4" />
    </svg>
  )
}

function TrashIcon({ size = 16 }: ChatIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  )
}

function SendIcon({ size = 18 }: ChatIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M4.4 19.6L20 12 4.4 4.4l2.8 7.6-2.8 7.6z" />
    </svg>
  )
}

function StopIcon({ size = 20 }: ChatIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

export function ChatPanel(): React.JSX.Element {
  const { refreshData, isAiEnabled } = useApp()
  const { isAiBusy } = useLock()
  const { pushToast } = useToast()
  const nextId = useRef(1)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const AI_DISABLED_MESSAGE = 'Vui lòng bật AI Mode trong Settings để sử dụng Chat Box.'

  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingActionId, setConfirmingActionId] = useState<string | null>(null)

  useEffect(() => {
    void window.api.settings.get().then((result) => {
      if (!result.ok) {
        return
      }
      const data = result.data
      setSettings(data)
      const selection = data.ai.lastSelection
      const providerExists = selection && data.ai.providers.some((provider) => provider.id === selection.providerId)
      const modelExists =
        providerExists &&
        data.ai.providers
          .find((provider) => provider.id === selection!.providerId)
          ?.models.some((model) => model.id === selection!.modelId)
      const provider = providerExists
        ? data.ai.providers.find((entry) => entry.id === selection!.providerId)!
        : data.ai.providers[0]
      const model = provider
        ? modelExists
          ? provider.models.find((entry) => entry.id === selection!.modelId)!
          : provider.models[0]
        : null
      setProviderId(provider?.id ?? '')
      setModelId(model?.id ?? '')
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => {
    if (!isAiEnabled) {
      setOpen(false)
    }
  }, [isAiEnabled])

  const providers = settings?.ai.providers ?? []
  const currentProvider = providers.find((provider) => provider.id === providerId) ?? null
  const models = currentProvider?.models ?? []
  const currentModel = models.find((model) => model.id === modelId) ?? null
  const canChat = isAiEnabled && Boolean(currentProvider && currentModel) && !isAiBusy && !sending

  function id(): number {
    const value = nextId.current
    nextId.current += 1
    return value
  }

  async function persistSelection(nextProviderId: string, nextModelId: string): Promise<void> {
    const result = await window.api.settings.setLastSelection({ providerId: nextProviderId, modelId: nextModelId })
    if (result.ok) {
      setSettings(result.data)
    }
  }

  function handleProviderChange(nextProviderId: string): void {
    const provider = providers.find((entry) => entry.id === nextProviderId)
    const firstModel = provider?.models[0]
    setProviderId(nextProviderId)
    setModelId(firstModel?.id ?? '')
    if (firstModel) {
      void persistSelection(nextProviderId, firstModel.id)
    }
  }

  function handleModelChange(nextModelId: string): void {
    setModelId(nextModelId)
    if (providerId) {
      void persistSelection(providerId, nextModelId)
    }
  }

  function appendMessage(message: Omit<ChatMessage, 'id'>): void {
    setMessages((current) => [...current, { ...message, id: id() }])
  }

  function handleNewChat(): void {
    void window.api.chat.newSession()
    setMessages([])
    setError(null)
    pushToast('Đã bắt đầu cuộc trò chuyện mới', 'success')
  }

  async function handleSend(): Promise<void> {
    const trimmed = input.trim()
    if (!isAiEnabled) {
      pushToast(AI_DISABLED_MESSAGE, 'info')
      return
    }
    if (trimmed.length === 0 || !canChat) {
      return
    }
    appendMessage({ role: 'user', text: trimmed })
    setInput('')
    setError(null)
    setSending(true)
    const result = await window.api.chat.send({ text: trimmed, providerId, modelId })
    setSending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    appendMessage({
      role: 'assistant',
      text: result.data.message,
      choices: result.data.choices,
      pendingAction: result.data.pendingAction
    })
  }

  async function handleStop(): Promise<void> {
    const result = await window.api.chat.cancelTask()
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    appendMessage({
      role: 'system',
      text: result.data.canceled ? 'Đã yêu cầu dừng AI. Khoá sẽ được giải phóng ngay khi lượt này kết thúc.' : 'Không có tác vụ AI nào đang chạy.'
    })
  }

  async function handleChoose(choiceId: string, label: string): Promise<void> {
    if (!canChat) {
      return
    }
    appendMessage({ role: 'user', text: label })
    setSending(true)
    setError(null)
    const result = await window.api.chat.choose(choiceId)
    setSending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    appendMessage({
      role: 'assistant',
      text: result.data.message,
      choices: result.data.choices,
      pendingAction: result.data.pendingAction
    })
  }

  async function handleConfirm(actionId: string): Promise<void> {
    setConfirmingActionId(actionId)
    const result = await window.api.chat.confirm(actionId)
    setConfirmingActionId(null)
    if (!result.ok) {
      appendMessage({ role: 'system', text: result.error.message })
      return
    }
    appendMessage({ role: 'system', text: result.data.message })
    refreshData()
  }

  async function handleCancelAction(actionId: string): Promise<void> {
    const result = await window.api.chat.cancelAction(actionId)
    if (!result.ok) {
      appendMessage({ role: 'system', text: result.error.message })
      return
    }
    appendMessage({ role: 'system', text: 'Đã hủy hành động, không có gì thay đổi.' })
  }

  function handleQuick(action: (typeof QUICK_ACTIONS)[number]): void {
    if (action === 'Thêm dự án') {
      setInput('Thêm dự án: ')
    } else if (action === 'Sửa dự án') {
      setInput('Tôi muốn sửa dự án: ')
    } else {
      setInput('Tôi muốn xóa dự án: ')
    }
  }

  const sendDisabled = sending || input.trim().length === 0 || !canChat
  const sendBlockedReason = !isAiEnabled
    ? AI_DISABLED_MESSAGE
    : !currentProvider || !currentModel
      ? 'Chưa cấu hình Provider/Model trong Settings.'
      : isAiBusy
        ? 'AI đang thực thi…'
        : sending
          ? 'Đang gửi…'
          : input.trim().length === 0
            ? 'Nhập nội dung để gửi.'
            : null

  return (
    <>
      {open && isAiEnabled ? (
        <div className="chat-panel" role="dialog" aria-label="AI Chat Box">
          <div className="chat-panel__header">
            <span className="chat-panel__badge" aria-hidden="true">
              <SparkleIcon size={16} />
            </span>
            <h2 className="chat-panel__title">AI Chat</h2>
            <span className="chat-panel__spacer" />
            <button
              type="button"
              className="chat-icon-btn"
              onClick={handleNewChat}
              disabled={sending}
              aria-label="Cuộc trò chuyện mới"
              title="Cuộc trò chuyện mới"
            >
              <RefreshIcon />
            </button>
            <button
              type="button"
              className="chat-icon-btn"
              onClick={() => setOpen(false)}
              aria-label="Đóng AI Chat"
              title="Đóng"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="chat-model-row" role="group" aria-label="Chọn Provider và Model">
            <div className="chat-model-pill">
              <Select
                className="chat-model-pill__provider"
                value={providerId}
                onChange={(event) => handleProviderChange(event.target.value)}
                disabled={sending || providers.length === 0}
                aria-label="Chọn Provider"
                title={currentProvider ? currentProvider.name : 'Chưa cấu hình Provider'}
              >
                {providers.length === 0 ? <option value="">Chưa cấu hình</option> : null}
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </Select>
              <Select
                className="chat-model-pill__model"
                value={modelId}
                onChange={(event) => handleModelChange(event.target.value)}
                disabled={sending || models.length === 0}
                aria-label="Chọn Model"
                title={currentModel ? `${currentProvider?.name ?? ''} · ${currentModel.label}` : 'Chưa có Model'}
              >
                {models.length === 0 ? <option value="">Không có Model</option> : null}
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </Select>
            </div>
            {currentModel ? (
              <span className={`chat-model-tier chat-model-tier--${currentModel.costTier}`}>
                {currentModel.costTier === 'paid' ? 'Paid' : 'Free'}
              </span>
            ) : null}
          </div>

          <div className="chat-quick-actions">
            {QUICK_ACTIONS.map((action) => {
              const icon =
                action === 'Thêm dự án' ? <PlusIcon /> : action === 'Sửa dự án' ? <PencilIcon /> : <TrashIcon />
              return (
                <Button
                  key={action}
                  className={`chat-quick${action === 'Xóa dự án' ? ' chat-quick--danger' : ''}`}
                  variant="secondary"
                  disabled={!canChat}
                  onClick={() => handleQuick(action)}
                >
                  <span className="chat-quick__icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="chat-quick__label">{action}</span>
                </Button>
              )
            })}
          </div>

          <div className="chat-messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <span className="chat-empty__icon" aria-hidden="true">
                  <SparkleIcon size={40} />
                </span>
                <p className="chat-empty__title">Mình giúp gì cho dự án của bạn?</p>
                <p className="chat-empty__hint">Mọi thay đổi dữ liệu đều cần bạn bấm OK trước khi thực hiện.</p>
              </div>
            ) : null}
            {messages.map((message) => (
              <div key={message.id} className={`chat-message chat-message--${message.role}`}>
                {message.text}
                {message.choices && message.choices.length > 0 ? (
                  <div className="chat-choices">
                    {message.choices.map((choice) => (
                      <Button
                        key={choice.id}
                        size="sm"
                        variant="secondary"
                        disabled={!canChat}
                        onClick={() => void handleChoose(choice.id, choice.label)}
                      >
                        {choice.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
                {message.pendingAction ? (
                  <PendingActionCard
                    action={message.pendingAction}
                    busy={confirmingActionId === message.pendingAction.id}
                    onConfirm={() => void handleConfirm(message.pendingAction!.id)}
                    onCancel={() => void handleCancelAction(message.pendingAction!.id)}
                  />
                ) : null}
              </div>
            ))}
            {sending ? <div className="chat-message chat-message--system">AI đang xử lý…</div> : null}
            <div ref={messagesEndRef} />
          </div>

          {error ? <div className="chat-error" role="alert">{error}</div> : null}

          <div className="chat-composer">
            {isAiBusy ? (
              <div className="chat-busy" role="status">
                <span className="chat-busy__spinner" aria-hidden="true" />
                AI đang thực thi…
              </div>
            ) : null}
            <div className="chat-composer__row">
              <textarea
                className="chat-composer__input field__control"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={currentModel ? `Hỏi AI (${currentModel.label})…` : 'Chưa có Model, vào Settings để cấu hình'}
                rows={2}
                aria-label="Nội dung tin nhắn"
                disabled={isAiBusy || sending}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
              />
              {sending ? (
                <Button
                  className="chat-send"
                  variant="danger"
                  iconOnly
                  aria-label="Dừng"
                  title="Dừng tác vụ AI"
                  onClick={() => void handleStop()}
                >
                  <StopIcon />
                </Button>
              ) : (
                <Button
                  className="chat-send"
                  variant="primary"
                  iconOnly
                  aria-label="Gửi tin nhắn"
                  aria-disabled={sendDisabled}
                  title={sendBlockedReason ?? 'Gửi (Ctrl+Enter)'}
                  disabled={sendDisabled}
                  onClick={() => void handleSend()}
                >
                  <SendIcon />
                </Button>
              )}
            </div>
            <div className="chat-composer__meta">
              <span className="chat-composer__hint">Ctrl+Enter để gửi</span>
              {sendBlockedReason ? <span className="chat-composer__reason">{sendBlockedReason}</span> : null}
            </div>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={`chat-fab${isAiBusy ? ' chat-fab--busy' : ''}${isAiEnabled ? '' : ' chat-fab--disabled'}`}
        onClick={() => {
          if (!isAiEnabled) {
            pushToast(AI_DISABLED_MESSAGE, 'info')
            return
          }
          setOpen((current) => !current)
        }}
        aria-label={open ? 'Đóng AI Chat' : 'Mở AI Chat'}
        aria-expanded={open}
        title={isAiEnabled ? (open ? 'Đóng AI Chat' : 'Mở AI Chat') : AI_DISABLED_MESSAGE}
      >
        {open && isAiEnabled ? <CloseIcon size={26} /> : <SparkleIcon size={26} />}
      </button>
    </>
  )
}

function PendingActionCard({
  action,
  busy,
  onConfirm,
  onCancel
}: {
  action: PendingAction
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <div className="pending-action" role="group" aria-label="Xác nhận hành động">
      <div className="pending-action__title">{action.summary}</div>
      <div className="pending-action__details">
        {action.details.map((detail, index) => (
          <span key={index}>{detail}</span>
        ))}
      </div>
      {action.before ? (
        <div>
          <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Trước</div>
          <pre className="pending-action__block">{action.before}</pre>
        </div>
      ) : null}
      {action.after ? (
        <div>
          <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Sau</div>
          <pre className="pending-action__block">{action.after}</pre>
        </div>
      ) : null}
      <div className="pending-action__buttons">
        <Button size="sm" variant="primary" loading={busy} onClick={onConfirm}>
          OK
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <span className="muted" style={{ fontSize: '0.75rem' }}>Mọi thay đổi cần OK của bạn · Hết hạn sau 30 phút</span>
    </div>
  )
}
