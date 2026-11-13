import type { ScanItem } from './types'

/**
 * Một dòng kết quả quét. `ScanItem` không có id và tên dự án có thể trùng nhau
 * (ví dụ hai dự án cùng tên "Arch Prime"), nên React key và trạng thái chọn
 * phải dựa trên vị trí trong mảng gốc thay vì tên.
 */
export interface ScanRowEntry {
  item: ScanItem
  /** Vị trí trong mảng `items` gốc của lần quét. */
  index: number
}

/** Khoá React duy nhất: tên + vị trí. Cùng tên ở hai dòng vẫn khác key. */
export function scanRowKey(item: ScanItem, index: number): string {
  return `${index}:${item.name}`
}

/** Dòng chọn được: chỉ khóa khi trùng dự án đã có trong app (kể cả "insufficient"). */
export function isScanRowSelectable(item: ScanItem): boolean {
  return item.duplicateOf === null
}

/** Vị trí các dòng chọn được, theo thứ tự gốc. */
export function selectableScanIndexes(items: readonly ScanItem[]): number[] {
  const indexes: number[] = []
  items.forEach((item, index) => {
    if (isScanRowSelectable(item)) {
      indexes.push(index)
    }
  })
  return indexes
}

/** Nhóm dòng theo danh mục, giữ nguyên vị trí gốc để làm key/lựa chọn. */
export function groupScanRows(
  items: readonly ScanItem[] | null,
  category: ScanItem['category']
): ScanRowEntry[] {
  const rows: ScanRowEntry[] = []
  ;(items ?? []).forEach((item, index) => {
    if (item.category === category) {
      rows.push({ item, index })
    }
  })
  return rows
}

/** Bật/tắt đúng một dòng, không ảnh hưởng dòng khác dù trùng tên. */
export function toggleScanIndex(selected: ReadonlySet<number>, index: number): Set<number> {
  const next = new Set(selected)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }
  return next
}

/** Chọn cả nhóm nếu chưa đủ, ngược lại bỏ chọn cả nhóm. */
export function toggleScanIndexes(selected: ReadonlySet<number>, indexes: readonly number[]): Set<number> {
  const all = indexes.length > 0 && indexes.every((index) => selected.has(index))
  const next = new Set(selected)
  for (const index of indexes) {
    if (all) {
      next.delete(index)
    } else {
      next.add(index)
    }
  }
  return next
}

/** Tên dự án gửi sang main: theo thứ tự dòng gốc, bỏ vị trí không hợp lệ. */
export function selectedScanNames(selected: ReadonlySet<number>, items: readonly ScanItem[]): string[] {
  return [...selected]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < items.length)
    .sort((a, b) => a - b)
    .map((index) => items[index].name)
}
