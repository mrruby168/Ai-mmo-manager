import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LOCK_POLICY } from '@shared/constants'
import { deriveRunningTasks, isChannelBusy } from '@shared/lockView'
import type { AiChannel, LockState, LockTask } from '@shared/types'

const idleLock: LockState = {
  owner: 'none',
  taskId: null,
  label: null,
  startedAt: null,
  userEditing: false
}

interface LockContextValue {
  lock: LockState
  /** Mọi tác vụ AI đang chạy (mỗi kênh tối đa một tác vụ). */
  runningTasks: LockTask[]
  /** Có BẤT KỲ tác vụ AI nào đang chạy — dùng cho thao tác ghi dữ liệu. */
  isAiBusy: boolean
  /** Kênh cụ thể có đang bận không — dùng cho nút bắt đầu tác vụ AI. */
  isBusy: (channel: AiChannel) => boolean
  canMutate: boolean
  beginUserEditing: () => Promise<boolean>
  endUserEditing: () => Promise<void>
  isAllowedWhileAiBusy: (action: string) => boolean
}

const LockContext = createContext<LockContextValue | null>(null)

export function LockProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [lock, setLock] = useState<LockState>(idleLock)

  useEffect(() => {
    let active = true
    void window.api.lock.get().then((result) => {
      if (active && result.ok) {
        setLock(result.data)
      }
    })

    const unsubscribe = window.api.events.onLockChanged((state) => {
      setLock(state)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const beginUserEditing = useCallback(async (): Promise<boolean> => {
    const result = await window.api.lock.beginUserEditing()
    if (!result.ok) {
      return false
    }
    setLock(result.data)
    return true
  }, [])

  const endUserEditing = useCallback(async (): Promise<void> => {
    const result = await window.api.lock.endUserEditing()
    if (result.ok) {
      setLock(result.data)
    }
  }, [])

  const isAllowedWhileAiBusy = useCallback((action: string): boolean => {
    return (LOCK_POLICY.allowedWhileAiBusy as readonly string[]).includes(action)
  }, [])

  const runningTasks = useMemo(() => deriveRunningTasks(lock), [lock])
  const isBusy = useCallback((channel: AiChannel) => isChannelBusy(runningTasks, channel), [runningTasks])

  const value = useMemo<LockContextValue>(
    () => ({
      lock,
      runningTasks,
      isAiBusy: lock.owner === 'ai',
      isBusy,
      canMutate: lock.owner !== 'ai',
      beginUserEditing,
      endUserEditing,
      isAllowedWhileAiBusy
    }),
    [lock, runningTasks, isBusy, beginUserEditing, endUserEditing, isAllowedWhileAiBusy]
  )

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>
}

export function useLock(): LockContextValue {
  const context = useContext(LockContext)
  if (!context) {
    throw new Error('useLock phải dùng bên trong LockProvider')
  }
  return context
}
