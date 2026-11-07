import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LOCK_POLICY } from '@shared/constants'
import type { LockState } from '@shared/types'

const idleLock: LockState = {
  owner: 'none',
  taskId: null,
  label: null,
  startedAt: null,
  userEditing: false
}

interface LockContextValue {
  lock: LockState
  isAiBusy: boolean
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

  const value = useMemo<LockContextValue>(
    () => ({
      lock,
      isAiBusy: lock.owner === 'ai',
      canMutate: lock.owner !== 'ai',
      beginUserEditing,
      endUserEditing,
      isAllowedWhileAiBusy
    }),
    [lock, beginUserEditing, endUserEditing, isAllowedWhileAiBusy]
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
