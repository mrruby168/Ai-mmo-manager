import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  groupScanRows,
  isScanRowSelectable,
  scanRowKey,
  selectedScanNames,
  selectableScanIndexes,
  toggleScanIndex,
  toggleScanIndexes
} from '../src/shared/scanSelection'
import type { ScanItem } from '../src/shared/types'

const ROOT = resolve(__dirname, '..')
const SCAN_PAGE = join(ROOT, 'src', 'renderer', 'src', 'features', 'scan', 'ScanPage.tsx')
const readSource = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

function item(overrides: Partial<ScanItem> = {}): ScanItem {
  return {
    name: 'Arch Prime',
    category: 'airdrop',
    website: null,
    summary: '',
    taskSummary: '',
    howToJoin: '',
    startDate: null,
    endDate: null,
    costType: 'free',
    costAmountUsd: null,
    riskLevel: 'low',
    riskReason: null,
    potential: null,
    verification: 'unverified',
    sources: [],
    duplicateOf: null,
    ...overrides
  }
}

describe('Scan: mỗi dòng có khoá riêng dù trùng tên dự án', () => {
  it('scanRowKey khác nhau cho hai dòng cùng tên', () => {
    const first = scanRowKey(item(), 0)
    const second = scanRowKey(item(), 1)
    expect(first).toBe('0:Arch Prime')
    expect(second).toBe('1:Arch Prime')
    expect(first).not.toBe(second)
  })

  it('React key của cả danh sách là duy nhất kể cả khi mọi dòng trùng tên', () => {
    const items = [item(), item(), item()]
    const keys = items.map((entry, index) => scanRowKey(entry, index))
    expect(new Set(keys).size).toBe(items.length)
  })

  it('dòng "insufficient" vẫn chọn được, chỉ khóa khi trùng dự án đã có', () => {
    expect(isScanRowSelectable(item())).toBe(true)
    expect(isScanRowSelectable(item({ category: 'insufficient' }))).toBe(true)
    expect(isScanRowSelectable(item({ category: 'insufficient', duplicateOf: 'PRJ-001' }))).toBe(false)
    expect(isScanRowSelectable(item({ duplicateOf: 'PRJ-001' }))).toBe(false)
  })

  it('selectableScanIndexes giữ đúng vị trí gốc', () => {
    const items = [
      item(),
      item({ name: 'Beta', category: 'insufficient' }),
      item({ name: 'Gamma', duplicateOf: 'PRJ-002' }),
      item({ name: 'Delta', category: 'event_mmo' })
    ]
    expect(selectableScanIndexes(items)).toEqual([0, 1, 3])
  })

  it('groupScanRows giữ vị trí gốc và đúng danh mục', () => {
    const items = [item({ category: 'event_mmo' }), item(), item({ name: 'Eps', category: 'insufficient' })]
    expect(groupScanRows(items, 'airdrop')).toEqual([{ item: items[1], index: 1 }])
    expect(groupScanRows(items, 'event_mmo').map((row) => row.index)).toEqual([0])
    expect(groupScanRows(items, 'insufficient').map((row) => row.index)).toEqual([2])
    expect(groupScanRows(null, 'airdrop')).toEqual([])
  })
})

describe('Scan: chọn theo vị trí nên hai dòng trùng tên độc lập', () => {
  it('toggleScanIndex chỉ đổi đúng một dòng', () => {
    const afterFirst = toggleScanIndex(new Set<number>(), 0)
    expect([...afterFirst]).toEqual([0])
    const afterSecond = toggleScanIndex(afterFirst, 1)
    expect([...afterSecond].sort()).toEqual([0, 1])
    expect([...toggleScanIndex(afterSecond, 0)]).toEqual([1])
    // Không sửa tập cũ (immutable).
    expect([...afterSecond].sort()).toEqual([0, 1])
  })

  it('toggleScanIndexes: chọn cả nhóm rồi bỏ cả nhóm', () => {
    const first = toggleScanIndexes(new Set<number>(), [0, 2])
    expect([...first].sort()).toEqual([0, 2])
    const second = toggleScanIndexes(first, [0, 2])
    expect([...second]).toEqual([])
  })

  it('toggleScanIndexes chỉ thêm dòng còn thiếu thay vì bỏ cả nhóm', () => {
    const partial = toggleScanIndex(new Set<number>(), 4)
    const full = toggleScanIndexes(partial, [0, 4])
    expect([...full].sort()).toEqual([0, 4])
  })

  it('selectedScanNames trả tên theo thứ tự dòng gốc và bỏ vị trí sai', () => {
    const items = [item({ name: 'Arch Prime' }), item({ name: 'Beta' }), item({ name: 'Arch Prime' })]
    const selected = new Set<number>([2, 0, 99, -1])
    expect(selectedScanNames(selected, items)).toEqual(['Arch Prime', 'Arch Prime'])
    expect(selectedScanNames(new Set<number>(), items)).toEqual([])
  })
})

describe('ScanPage dùng khoá theo vị trí thay vì tên', () => {
  const source = readSource(SCAN_PAGE)

  it('không còn key={item.name}', () => {
    expect(source).not.toContain('key={item.name}')
    expect(source).toContain('key={scanRowKey(item, index)}')
  })

  it('trạng thái chọn là Set<number> và gửi tên qua selectedScanNames', () => {
    expect(source).toContain('useState<Set<number>>(new Set())')
    expect(source).toContain('window.api.scan.submit(')
    expect(source).toContain('selectedScanNames(selected, items)')
    expect(source).toContain('toggleScanIndex(current, index)')
    expect(source).toContain('toggleScanIndexes(current, selectableIndexes())')
  })

  it('một bảng duy nhất, nút OK thêm dự án đã chọn', () => {
    expect(source).toContain('aria-label="Kết quả quét"')
    expect(source).toContain('OK – Thêm ${selected.size} dự án')
    expect(source).not.toContain('ScanGroup')
  })
})
