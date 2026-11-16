import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { UpdateState } from '@shared/types'

interface UpdateContextValue {
  state: UpdateState | null
  dialogOpen: boolean
  installError: string | null
  openDialog: () => void
  closeDialog: () => void
  startUpdate: () => Promise<void>
  install: () => Promise<void>
}

const UpdateContext = createContext<UpdateContextValue | null>(null)

export function UpdateProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<UpdateState | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const autoOpenedVersion = useRef<string | null>(null)
  const downloading = useRef(false)

  useEffect(() => {
    let active = true
    void window.api.update.getState().then((result) => {
      if (active && result.ok) {
        setState(result.data)
      }
    })
    // Chỉ đăng ký một listener cho toàn bộ renderer.
    const unsubscribe = window.api.events.onUpdateState((next) => setState(next))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const latestVersion =
    state && (state.phase === 'available' || state.phase === 'downloading' || state.phase === 'downloaded')
      ? state.latestVersion ?? null
      : null

  // Tự mở hộp thoại một lần cho mỗi phiên bản mới trong phiên chạy này.
  useEffect(() => {
    if (!latestVersion || autoOpenedVersion.current === latestVersion) {
      return
    }
    autoOpenedVersion.current = latestVersion
    setDialogOpen(true)
  }, [latestVersion])

  const openDialog = useCallback(() => {
    setInstallError(null)
    setDialogOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
  }, [])

  const install = useCallback(async (): Promise<void> => {
    setInstallError(null)
    const result = await window.api.update.install()
    if (!result.ok) {
      setInstallError(result.error.message)
      return
    }
    // installUpdate trả { error } bên trong data khi bị chặn (AI đang chạy / đang sửa).
    if ('error' in result.data) {
      setInstallError(result.data.error)
    }
  }, [])

  const startUpdate = useCallback(async (): Promise<void> => {
    if (!state) {
      return
    }
    if (state.portable) {
      const result = await window.api.update.openRelease()
      if (!result.ok) {
        setInstallError(result.error.message)
      } else if (!result.data.opened) {
        setInstallError('Không mở được trang tải.')
      }
      return
    }
    if (downloading.current || state.phase === 'downloading') {
      return
    }
    downloading.current = true
    setInstallError(null)
    try {
      const result = await window.api.update.download()
      if (!result.ok) {
        setInstallError(result.error.message)
        return
      }
      // Lỗi tải do main process báo qua phase 'error' + message, không lặp lại ở đây.
      if (!result.data.downloaded) {
        return
      }
      await install()
    } finally {
      downloading.current = false
    }
  }, [install, state])

  const value = useMemo<UpdateContextValue>(
    () => ({ state, dialogOpen, installError, openDialog, closeDialog, startUpdate, install }),
    [state, dialogOpen, installError, openDialog, closeDialog, startUpdate, install]
  )

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}

export function useUpdate(): UpdateContextValue {
  const context = useContext(UpdateContext)
  if (!context) {
    throw new Error('useUpdate phải dùng bên trong UpdateProvider')
  }
  return context
}
