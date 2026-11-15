import { useSyncExternalStore } from 'react'
import type { ProjectCategory } from '@shared/constants'
import { emptyPriorityIds, togglePriority } from '@shared/priorityPicks'
import type { PriorityIds } from '@shared/priorityPicks'

interface CategoryState {
  ids: PriorityIds
  selectMode: boolean
}

let stateByCategory: Record<ProjectCategory, CategoryState> = {
  event_mmo: { ids: emptyPriorityIds, selectMode: false },
  airdrop: { ids: emptyPriorityIds, selectMode: false }
}

const listeners = new Set<() => void>()

function notify(): void {
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

function getSnapshot(category: ProjectCategory): CategoryState {
  return stateByCategory[category]
}

export function toggleProject(category: ProjectCategory, projectId: string): void {
  const current = stateByCategory[category]
  stateByCategory = {
    ...stateByCategory,
    [category]: { ...current, ids: togglePriority(current.ids, projectId) }
  }
  notify()
}

export function setSelectMode(category: ProjectCategory, on: boolean): void {
  const current = stateByCategory[category]
  if (current.selectMode === on) {
    return
  }
  stateByCategory = {
    ...stateByCategory,
    [category]: { ...current, selectMode: on }
  }
  notify()
}

export interface PriorityPicks {
  ids: PriorityIds
  selectMode: boolean
  toggle: (projectId: string) => void
  setSelectMode: (on: boolean) => void
}

export function usePriorityPicks(category: ProjectCategory): PriorityPicks {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => getSnapshot(category),
    () => getSnapshot(category)
  )

  return {
    ids: snapshot.ids,
    selectMode: snapshot.selectMode,
    toggle: (projectId) => toggleProject(category, projectId),
    setSelectMode: (on) => setSelectMode(category, on)
  }
}
