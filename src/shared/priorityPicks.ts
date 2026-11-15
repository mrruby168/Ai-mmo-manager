export type PriorityIds = ReadonlySet<string>

export const emptyPriorityIds: PriorityIds = new Set()

export function togglePriority(ids: PriorityIds, projectId: string): Set<string> {
  const next = new Set(ids)
  if (next.has(projectId)) {
    next.delete(projectId)
  } else {
    next.add(projectId)
  }
  return next
}

export function isPriority(ids: PriorityIds, projectId: string): boolean {
  return ids.has(projectId)
}
