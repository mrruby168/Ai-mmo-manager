/**
 * Hard cap on web searches for one AI run. App-side searches consume it before
 * running (`tryConsume`); provider-side searches are only known after the call,
 * so they are added with `record` and block the *next* batch once exhausted.
 */
export interface SearchBudget {
  readonly max: number
  used(): number
  remaining(): number
  exhausted(): boolean
  tryConsume(count?: number): boolean
  record(count: number): void
}

export function createSearchBudget(max: number): SearchBudget {
  const limit = Math.max(0, Math.floor(max))
  let used = 0
  return {
    max: limit,
    used: () => used,
    remaining: () => Math.max(0, limit - used),
    exhausted: () => used >= limit,
    tryConsume(count = 1) {
      if (used + count > limit) {
        return false
      }
      used += count
      return true
    },
    record(count) {
      if (count > 0) {
        used += count
      }
    }
  }
}
