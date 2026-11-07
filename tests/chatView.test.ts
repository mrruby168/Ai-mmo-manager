import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chatRoleLabel, formatChatTime } from '../src/shared/chatView'

const ROOT = resolve(__dirname, '..')
const CHAT_PANEL = join(ROOT, 'src', 'renderer', 'src', 'features', 'chat', 'ChatPanel.tsx')
const COMPONENTS = join(ROOT, 'src', 'renderer', 'src', 'styles', 'components.css')
const TOKENS = join(ROOT, 'src', 'renderer', 'src', 'styles', 'tokens.css')

describe('Chat Box — hiển thị tin nhắn (FIX 5c)', () => {
  it('nhãn vai trò đúng User/AI', () => {
    expect(chatRoleLabel('user')).toBe('User')
    expect(chatRoleLabel('assistant')).toBe('AI')
    expect(chatRoleLabel('system')).toBe('Hệ thống')
  })

  it('giờ hiển thị HH:mm, dữ liệu hỏng trả --:--', () => {
    expect(formatChatTime('2026-11-07T10:30:00')).toBe('10:30')
    expect(formatChatTime('2026-11-07T09:05:00')).toBe('09:05')
    expect(formatChatTime('not-a-date')).toBe('--:--')
  })
})

describe('Chat Box — bố cục và ràng buộc (FIX 5c)', () => {
  const css = readFileSync(COMPONENTS, 'utf8')
  const tokens = readFileSync(TOKENS, 'utf8')
  const tsx = readFileSync(CHAT_PANEL, 'utf8')

  it('dialog giữa màn hình đúng kích thước thiết kế', () => {
    expect(css).toMatch(/\.chat-panel\s*\{[^}]*width:\s*min\(70vw,\s*960px\)/)
    expect(css).toMatch(/\.chat-panel\s*\{[^}]*height:\s*84vh/)
    expect(css).toMatch(/\.chat-panel\s*\{[^}]*border-radius:\s*10px/)
    expect(css).toMatch(/@media \(max-width: 639px\)[\s\S]*?\.chat-panel\s*\{[^}]*width:\s*100vw/)
  })

  it('dùng biến --chat-* và bỏ pill select cũ', () => {
    expect(tokens).toMatch(/--chat-panel-bg:\s*#111a2a/)
    expect(tokens).toMatch(/--chat-user-bg:\s*#243a5a/)
    expect(tokens).toMatch(/--chat-ai-bg:\s*#182638/)
    expect(tokens).toMatch(/--chat-pending-bg:\s*#202d41/)
    expect(css).not.toContain('.chat-model-pill')
    expect(css).not.toContain('.chat-model-tier')
  })

  it('dùng Listbox cho Provider/Model và hiện giờ từng tin', () => {
    expect(tsx).toContain('import { Listbox }')
    expect(tsx).toContain('label="Provider"')
    expect(tsx).toContain('label="Model"')
    expect(tsx).toContain('dateTime={message.at}')
    expect(tsx).toContain('formatChatTime(message.at)')
  })

  it('không vẽ nút kẹp giấy (D6)', () => {
    expect(tsx.toLowerCase()).not.toContain('paperclip')
    expect(tsx.toLowerCase()).not.toContain('attach')
  })

  it('giữ nguyên Ctrl+Enter, dừng và xác nhận OK/Cancel', () => {
    expect(tsx).toContain('event.ctrlKey || event.metaKey')
    expect(tsx).toContain('handleStop')
    expect(tsx).toContain('PendingAction')
    expect(tsx).toContain('handleConfirm')
    expect(tsx).toContain('handleCancelAction')
  })
})
