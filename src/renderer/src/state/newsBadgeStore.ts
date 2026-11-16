import { useSyncExternalStore } from 'react'
import type { NewsScanMode } from '@shared/types'

/**
 * v0.1.4: trạng thái "có tin mới" dùng chung giữa NewsPage và Sidebar.
 * Một lần Check News chạy nền vẫn phải hiện chấm đỏ ở tab News dù người dùng
 * đã chuyển sang tab khác, nên trạng thái không thể nằm trong NewsPage.
 */
export interface NewsBadgeState {
  /** Có tin mới chưa xem (chấm đỏ ở sidebar). */
  unseen: boolean
  /** Số tin thêm bởi lần Daily gần nhất (badge cạnh nút Daily). */
  dailyAdded: number
}

const EMPTY: NewsBadgeState = { unseen: false, dailyAdded: 0 }

let state: NewsBadgeState = EMPTY
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): NewsBadgeState {
  return state
}

/** Gọi sau khi một lần Check News thêm tin. Full không đụng badge Daily. */
export function markNewsAdded(added: number, mode: NewsScanMode): void {
  if (added <= 0) {
    return
  }
  state = {
    unseen: true,
    dailyAdded: mode === 'daily' ? state.dailyAdded + added : state.dailyAdded
  }
  emit()
}

/** Mở tab News: coi như đã xem chấm đỏ, badge Daily giữ nguyên. */
export function clearUnseen(): void {
  if (!state.unseen) {
    return
  }
  state = { ...state, unseen: false }
  emit()
}

/** Bắt đầu một lần Daily mới: badge số tin cũ không còn ý nghĩa. */
export function clearDailyAdded(): void {
  if (state.dailyAdded === 0) {
    return
  }
  state = { ...state, dailyAdded: 0 }
  emit()
}

export function useNewsBadge(): NewsBadgeState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
