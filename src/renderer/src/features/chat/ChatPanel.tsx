import { useEffect, useRef, useState } from 'react'
import type { AppSettings, ChatChoice, ModelSelection, PendingAction } from '@shared/types'
import { chatRoleLabel, formatChatTime } from '@shared/chatView'
import type { ChatRole } from '@shared/chatView'
import {
  CHAT_ATTACHMENT_ACCEPT,
  formatAttachmentSize,
  validateChatAttachment
} from '@shared/chatAttachment'
import { Button } from '../../common/Button'
import { ModelPicker } from '../../common/ModelPicker'
import { useApp } from '../../state/AppContext'
import { useLock } from '../../state/LockContext'
import { useToast } from '../../state/ToastContext'

interface ChatMessage {
  id: number
  role: ChatRole
  text: string
  at: string
  choices?: ChatChoice[]
  pendingAction?: PendingAction | null
  /** FIX 4: chip tệp đã gửi kèm tin nhắn này. */
  attachment?: { name: string; size: number }
}

interface ChatAttachment {
  name: string
  text: string
  size: number
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

function UserIcon({ size = 16 }: ChatIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c0-3.2 3.1-5.5 7-5.5s7 2.3 7 5.5" />
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

function PaperclipIcon({ size = 16 }: ChatIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
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

function WarningIcon({ size = 18 }: ChatIconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3.5L21 20H3l9-16.5z" />
      <path d="M12 9.5v5" />
      <path d="M12 17.2v.3" />
    </svg>
  )
}

interface ChatPanelProps {
  /**
   * Ẩn toàn bộ giao diện chat (panel + nút nổi) bằng CSS mà không gỡ component
   * khỏi cây React, để lịch sử hội thoại và lượt đang gửi không bị mất.
   */
  hidden?: boolean
}

export function ChatPanel({ hidden = false }: ChatPanelProps = {}): React.JSX.Element {
  const { refreshData, isAiEnabled } = useApp()
  const { isBusy } = useLock()
  const { pushToast } = useToast()
  const nextId = useRef(1)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const AI_DISABLED_MESSAGE = 'Vui lòng bật AI Mode trong Settings để sử dụng Chat Box.'

  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [quickHint, setQuickHint] = useState<string | null>(null)
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
  const chatBusy = isBusy('chat')
  const canChat = isAiEnabled && Boolean(currentProvider && currentModel) && !chatBusy && !sending

  const selection: ModelSelection | null =
    providerId && modelId ? { providerId, modelId } : null

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

  function appendMessage(message: Omit<ChatMessage, 'id' | 'at'>): void {
    setMessages((current) => [...current, { ...message, id: id(), at: new Date().toISOString() }])
  }

  function handleNewChat(): void {
    void window.api.chat.newSession()
    setMessages([])
    setError(null)
    setAttachment(null)
    setQuickHint(null)
    pushToast('Đã bắt đầu cuộc trò chuyện mới', 'success')
  }

  async function acceptAttachment(file: File): Promise<void> {
    if (chatBusy || sending) {
      return
    }
    const text = await file.text()
    const check = validateChatAttachment({ name: file.name, text, sizeBytes: file.size })
    if (!check.ok) {
      pushToast(check.message, 'error')
      return
    }
    setAttachment({ name: check.attachment.name, text: check.attachment.text, size: check.sizeBytes })
    setQuickHint(null)
  }

  async function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) {
      await acceptAttachment(file)
    }
  }

  function handleDragEnter(event: React.DragEvent): void {
    event.preventDefault()
    dragDepth.current += 1
    setDropActive(true)
  }

  function handleDragOver(event: React.DragEvent): void {
    event.preventDefault()
  }

  function handleDragLeave(event: React.DragEvent): void {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) {
      setDropActive(false)
    }
  }

  function handleDrop(event: React.DragEvent): void {
    event.preventDefault()
    dragDepth.current = 0
    setDropActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) {
      void acceptAttachment(file)
    }
  }

  async function handleSend(): Promise<void> {
    const trimmed = input.trim()
    if (!isAiEnabled) {
      pushToast(AI_DISABLED_MESSAGE, 'info')
      return
    }
    if (!canChat || (trimmed.length === 0 && !attachment)) {
      return
    }
    const sent = attachment
    appendMessage({
      role: 'user',
      text: trimmed,
      attachment: sent ? { name: sent.name, size: sent.size } : undefined
    })
    setInput('')
    setAttachment(null)
    setQuickHint(null)
    setError(null)
    setSending(true)
    const result = await window.api.chat.send({
      text: trimmed,
      providerId,
      modelId,
      attachment: sent ? { name: sent.name, text: sent.text } : undefined
    })
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
    const result = await window.api.chat.cancelTask('chat')
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
      setQuickHint('Dán JSON vào ô hoặc bấm 📎 để tải tệp .json lên — app sẽ hiện thẻ xác nhận trước khi thêm.')
    } else if (action === 'Sửa dự án') {
      setInput('Tôi muốn sửa dự án: ')
      setQuickHint(null)
    } else {
      setInput('Tôi muốn xóa dự án: ')
      setQuickHint(null)
    }
  }

  const hasAttachment = attachment !== null
  const sendDisabled = sending || (input.trim().length === 0 && !hasAttachment) || !canChat
  const sendBlockedReason = !isAiEnabled
    ? AI_DISABLED_MESSAGE
    : !currentProvider || !currentModel
      ? 'Chưa cấu hình Provider/Model trong Settings.'
      : chatBusy
        ? 'AI đang thực thi…'
        : sending
          ? 'Đang gửi…'
          : input.trim().length === 0 && !hasAttachment
            ? 'Nhập nội dung hoặc đính kèm tệp để gửi.'
            : null

  return (
    <div className="chat-host" style={{ display: hidden ? 'none' : 'contents' }} data-lock-allow="true">
      <>
        {open && isAiEnabled ? (
        <div className="chat-panel" role="dialog" aria-modal="false" aria-label="AI Chat Box">
          <div className="chat-panel__header">
            <span className="chat-panel__badge" aria-hidden="true">
              <SparkleIcon size={18} />
            </span>
            <h2 className="chat-panel__title">AI Chat</h2>
            <span className="chat-panel__spacer" />
            <Button className="chat-new" size="sm" variant="primary" disabled={sending} onClick={handleNewChat}>
              <PlusIcon />
              <span>New Chat</span>
            </Button>
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

          <div className="chat-selectors" role="group" aria-label="Chọn Provider và Model">
            <ModelPicker
              className="chat-model-picker"
              label="AI Chat"
              providers={providers}
              value={selection}
              disabled={sending}
              onChange={(next) => {
                setProviderId(next.providerId)
                setModelId(next.modelId)
                void persistSelection(next.providerId, next.modelId)
              }}
            />
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
            {messages.map((message) =>
              message.role === 'system' ? (
                <div key={message.id} className="chat-notice">
                  {message.text}
                </div>
              ) : (
                <div key={message.id} className={`chat-row chat-row--${message.role}`}>
                  <span className={`chat-avatar chat-avatar--${message.role}`} aria-hidden="true">
                    {message.role === 'user' ? <UserIcon size={16} /> : <SparkleIcon size={16} />}
                  </span>
                  <div className="chat-message-stack">
                    <div className="chat-message-head">
                      <span className="chat-sender">{chatRoleLabel(message.role)}</span>
                      <time className="chat-time" dateTime={message.at}>
                        {formatChatTime(message.at)}
                      </time>
                    </div>
                    {message.attachment ? (
                      <span className="chat-message-attachment">
                        <PaperclipIcon size={12} />
                        <span className="chat-message-attachment__name">{message.attachment.name}</span>
                        <span className="chat-message-attachment__size">
                          {formatAttachmentSize(message.attachment.size)}
                        </span>
                      </span>
                    ) : null}
                    {message.text.length > 0 ? (
                      <div className={`chat-bubble chat-bubble--${message.role}`}>{message.text}</div>
                    ) : null}
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
                </div>
              )
            )}
            {sending ? <div className="chat-notice">AI đang xử lý…</div> : null}
            <div ref={messagesEndRef} />
          </div>

          {error ? <div className="chat-error" role="alert">{error}</div> : null}

          <div
            className={`chat-composer${dropActive ? ' chat-composer--drop' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {chatBusy ? (
              <div className="chat-busy" role="status">
                <span className="chat-busy__spinner" aria-hidden="true" />
                AI đang thực thi…
              </div>
            ) : null}
            {quickHint ? <p className="chat-quick-hint">{quickHint}</p> : null}
            <div className="chat-composer__box">
              <div className="chat-composer__field">
                {attachment ? (
                  <div className="chat-attachment">
                    <PaperclipIcon size={13} />
                    <span className="chat-attachment__name">{attachment.name}</span>
                    <span className="chat-attachment__size">{formatAttachmentSize(attachment.size)}</span>
                    <button
                      type="button"
                      className="chat-attachment__remove"
                      aria-label={`Gỡ tệp ${attachment.name}`}
                      title="Gỡ tệp"
                      disabled={sending}
                      onClick={() => setAttachment(null)}
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
                <textarea
                  className="chat-composer__input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={
                    currentModel
                      ? attachment
                        ? 'Thêm lời nhắn cho tệp (không bắt buộc)…'
                        : 'Nhập tin nhắn…'
                      : 'Chưa có Model, vào Settings để cấu hình'
                  }
                  rows={1}
                  aria-label="Nội dung tin nhắn"
                  disabled={chatBusy || sending}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault()
                      void handleSend()
                    }
                  }}
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={CHAT_ATTACHMENT_ACCEPT}
                className="visually-hidden"
                onChange={(event) => void handleAttachmentChange(event)}
              />
              <Button
                className="chat-attach"
                variant="ghost"
                iconOnly
                aria-label="Đính kèm tệp"
                title="Đính kèm .json, .txt, .md (tối đa 1 MB)"
                disabled={!canChat}
                onClick={() => fileInputRef.current?.click()}
              >
                <PaperclipIcon />
              </Button>
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
              <span className="chat-composer__hint">Ctrl+Enter để gửi · 📎 đính kèm .json/.txt/.md ≤ 1 MB</span>
              {sendBlockedReason ? <span className="chat-composer__reason">{sendBlockedReason}</span> : null}
            </div>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={`chat-fab${chatBusy ? ' chat-fab--busy' : ''}${isAiEnabled ? '' : ' chat-fab--disabled'}`}
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
    </div>
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
      <div className="pending-action__heading">
        <span className="pending-action__icon" aria-hidden="true">
          <WarningIcon />
        </span>
        <span className="pending-action__label">PendingAction</span>
      </div>
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
