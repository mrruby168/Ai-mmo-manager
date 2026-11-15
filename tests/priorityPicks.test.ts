import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emptyPriorityIds, isPriority, togglePriority } from '../src/shared/priorityPicks'

const ROOT = resolve(__dirname, '..')
const readSource = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

const PROJECT_LIST_PAGE = join(ROOT, 'src', 'renderer', 'src', 'features', 'projects', 'ProjectListPage.tsx')
const PROJECT_ROW = join(ROOT, 'src', 'renderer', 'src', 'features', 'projects', 'ProjectRow.tsx')
const PRIORITY_STORE = join(ROOT, 'src', 'renderer', 'src', 'state', 'priorityStore.ts')
const PRIORITY_PICKS = join(ROOT, 'src', 'shared', 'priorityPicks.ts')
const SWITCH = join(ROOT, 'src', 'renderer', 'src', 'common', 'Switch.tsx')

describe('priorityPicks: tập id ưu tiên thuần, bất biến', () => {
  it('togglePriority thêm rồi bỏ đúng một id', () => {
    const empty = new Set<string>()
    const added = togglePriority(empty, 'PRJ-001')
    expect([...added]).toEqual(['PRJ-001'])
    expect(isPriority(added, 'PRJ-001')).toBe(true)

    const removed = togglePriority(added, 'PRJ-001')
    expect([...removed]).toEqual([])
    expect(isPriority(removed, 'PRJ-001')).toBe(false)
  })

  it('không đột biến Set gốc', () => {
    const original = new Set(['PRJ-001'])
    const next = togglePriority(original, 'PRJ-002')
    expect([...original]).toEqual(['PRJ-001'])
    expect([...next].sort()).toEqual(['PRJ-001', 'PRJ-002'])
  })

  it('hai id khác nhau độc lập', () => {
    const first = togglePriority(emptyPriorityIds, 'PRJ-001')
    const second = togglePriority(emptyPriorityIds, 'PRJ-002')
    expect([...first]).toEqual(['PRJ-001'])
    expect([...second]).toEqual(['PRJ-002'])
    expect(isPriority(first, 'PRJ-002')).toBe(false)
    expect(isPriority(second, 'PRJ-001')).toBe(false)
  })

  it('emptyPriorityIds rỗng và isPriority trả false', () => {
    expect([...emptyPriorityIds]).toEqual([])
    expect(isPriority(emptyPriorityIds, 'PRJ-001')).toBe(false)
  })
})

describe('Priority picker: UI-only, state sống ngoài trang', () => {
  const projectList = readSource(PROJECT_LIST_PAGE)
  const projectRow = readSource(PROJECT_ROW)
  const store = readSource(PRIORITY_STORE)
  const switchSource = readSource(SWITCH)
  const picks = readSource(PRIORITY_PICKS)

  it('ProjectListPage chỉ hiện Switch khi No AI và nối đúng store', () => {
    expect(projectList).toContain('!isAiEnabled')
    expect(projectList).toContain('<Switch')
    expect(projectList).toContain('Chọn dự án ưu tiên')
    expect(projectList).toContain('const selectActive = !isAiEnabled && picks.selectMode')
    expect(projectList).toContain('usePriorityPicks(category)')
    expect(projectList).toContain('priority={picks.ids.has(project.id)}')
    expect(projectList).toContain('selectMode={selectActive}')
    expect(projectList).toContain('onTogglePriority={() => picks.toggle(project.id)}')
  })

  it('ProjectRow đổi click theo selectMode, thêm class và aria-pressed', () => {
    expect(projectRow).toContain('selectMode ? onTogglePriority : onOpen')
    expect(projectRow).toContain('project-row--priority')
    expect(projectRow).toContain('project-row--selecting')
    expect(projectRow).toContain('aria-pressed={selectMode ? priority : undefined}')
    expect(projectRow).toContain('data-lock-allow="true"')
    expect(projectRow).toContain('type="button"')
  })

  it('store dùng useSyncExternalStore, tách danh mục và không lưu ra đĩa', () => {
    expect(store).toContain('useSyncExternalStore')
    expect(store).toContain('event_mmo')
    expect(store).toContain('airdrop')
    expect(store).not.toContain('localStorage')
    expect(store).not.toContain('sessionStorage')
    expect(store).not.toContain('indexedDB')
    expect(store).not.toContain('window.api')
  })

  it('Switch là UI thuần, không lưu trữ và không gọi IPC', () => {
    expect(switchSource).toContain('role="switch"')
    expect(switchSource).toContain('aria-checked={checked}')
    expect(switchSource).not.toContain('localStorage')
    expect(switchSource).not.toContain('sessionStorage')
    expect(switchSource).not.toContain('indexedDB')
    expect(switchSource).not.toContain('window.api')
  })

  it('priorityPicks không import React/Electron', () => {
    expect(picks).not.toContain("from 'react'")
    expect(picks).not.toContain("from 'electron'")
  })
})
