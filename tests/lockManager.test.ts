import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireAiLock,
  assertUserCanMutate,
  beginUserEditing,
  canStartAiTask,
  endUserEditing,
  getLockState,
  isAllowedWhileAiBusy,
  LockError,
  onLockChanged,
  releaseAiLock,
  resetLockForTests
} from '../src/main/services/lockManager'

beforeEach(() => {
  resetLockForTests()
})

describe('lock manager', () => {
  it('starts idle and can be acquired by AI', () => {
    expect(getLockState()).toEqual({ owner: 'none', taskId: null, label: null, startedAt: null, userEditing: false })

    acquireAiLock('task-1', 'Scan Project')
    const state = getLockState()
    expect(state.owner).toBe('ai')
    expect(state.taskId).toBe('task-1')
    expect(state.label).toBe('Scan Project')
    expect(state.startedAt).not.toBeNull()
  })

  it('blocks user mutations and user editing while AI runs', () => {
    acquireAiLock('task-1', 'Scan Project')

    expect(() => assertUserCanMutate()).toThrow(LockError)
    expect(() => beginUserEditing()).toThrow(/AI đang thực thi/)
    expect(canStartAiTask()).toEqual({ ok: false, reason: 'AI đang thực thi tác vụ khác' })
  })

  it('prevents AI from starting while the user is editing', () => {
    beginUserEditing()
    expect(getLockState().userEditing).toBe(true)

    try {
      acquireAiLock('task-2', 'Check News')
      expect.unreachable('acquireAiLock phải ném lỗi')
    } catch (error) {
      expect(error).toBeInstanceOf(LockError)
      expect((error as LockError).code).toBe('USER_EDITING')
    }

    endUserEditing()
    expect(canStartAiTask()).toEqual({ ok: true })
    expect(() => acquireAiLock('task-2', 'Check News')).not.toThrow()
  })

  it('releases only the matching task and notifies listeners', () => {
    const listener = vi.fn()
    const unsubscribe = onLockChanged(listener)

    acquireAiLock('task-1', 'Scan Project')
    expect(listener).toHaveBeenCalledTimes(1)

    releaseAiLock('other-task')
    expect(getLockState().owner).toBe('ai')

    releaseAiLock('task-1')
    expect(getLockState().owner).toBe('none')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('allows only the documented actions while AI is busy', () => {
    expect(isAllowedWhileAiBusy('open_external_link')).toBe(true)
    expect(isAllowedWhileAiBusy('open_project_detail')).toBe(true)
    expect(isAllowedWhileAiBusy('projects:create')).toBe(false)
  })
})
