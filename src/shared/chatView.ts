/** Hiển thị tin nhắn Chat Box (FIX 5c) — hàm thuần để test. */

export type ChatRole = 'user' | 'assistant' | 'system'

const ROLE_LABELS: Record<ChatRole, string> = {
  user: 'User',
  assistant: 'AI',
  system: 'Hệ thống'
}

export function chatRoleLabel(role: ChatRole): string {
  return ROLE_LABELS[role]
}

/** Trả về HH:mm theo giờ máy; dữ liệu hỏng thì trả '--:--'. */
export function formatChatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '--:--'
  }
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}
