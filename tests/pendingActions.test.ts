import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIMITS } from '../src/shared/constants'
import {
  clearPendingActions,
  consumePendingAction,
  createPendingAction,
  expectedRowVersionsMatch,
  peekPendingAction,
  cancelPendingAction
} from '../src/main/ai/pendingActions'

const sampleInput = {
  type: 'add' as const,
  summary: 'Thêm 1 dự án',
  details: ['+ Test (airdrop)'],
  before: null,
  after: '- Test: https://example.com',
  payload: { type: 'add' as const, items: [] }
}

describe('pendingActions', () => {
  beforeEach(() => {
    clearPendingActions()
    vi.useFakeTimers()
  })

  afterEach(() => {
    clearPendingActions()
    vi.useRealTimers()
  })

  it('creates a pending action with uuid and stores it for later consume', () => {
    const action = createPendingAction(sampleInput)
    expect(action.id).toMatch(/[0-9a-f-]{36}/)
    expect(action.type).toBe('add')
    expect(action.summary).toBe(sampleInput.summary)

    const record = peekPendingAction(action.id)
    expect(record?.payload.type).toBe('add')

    const consumed = consumePendingAction(action.id)
    expect(consumed.action.id).toBe(action.id)
    expect(peekPendingAction(action.id)).toBeNull()

    expect(() => consumePendingAction(action.id)).toThrowError(/đã được thực thi|không tồn tại/)
  })

  it('expires actions after the 30 minute TTL', () => {
    const action = createPendingAction(sampleInput)
    vi.advanceTimersByTime(LIMITS.pendingActionTtlMs + 1)
    expect(peekPendingAction(action.id)).toBeNull()
    expect(() => consumePendingAction(action.id)).toThrowError(/hết hạn/)
  })

  it('cancels a pending action without executing', () => {
    const action = createPendingAction(sampleInput)
    expect(cancelPendingAction(action.id)).toBe(true)
    expect(cancelPendingAction(action.id)).toBe(false)
    expect(peekPendingAction(action.id)).toBeNull()
  })

  it('checks snapshot row versions', () => {
    const action = createPendingAction({
      ...sampleInput,
      type: 'update',
      expectedRowVersions: { PRJ001: 7 },
      payload: { type: 'update', projectId: 'PRJ001', changes: { name: 'Mới' } }
    })
    const record = consumePendingAction(action.id)
    expect(expectedRowVersionsMatch(record, { PRJ001: 7 })).toBe(true)
    expect(expectedRowVersionsMatch(record, { PRJ001: 8 })).toBe(false)
    expect(expectedRowVersionsMatch(record, {})).toBe(false)
  })

  it('limits the number of unconsumed actions to 10', () => {
    for (let index = 0; index < 10; index += 1) {
      createPendingAction(sampleInput)
    }
    expect(() => createPendingAction(sampleInput)).toThrowError(/quá nhiều hành động/)
  })
})
