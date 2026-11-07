import type { ScanLatest, ScanItem } from '@shared/types'
import { getDatabase } from './connection'

export function saveScanLatest(items: ScanItem[], createdAt: string): void {
  getDatabase()
    .prepare('INSERT OR REPLACE INTO scan_latest (id, result_json, created_at) VALUES (1, ?, ?)')
    .run(JSON.stringify(items), createdAt)
}

export function getScanLatest(): ScanLatest | null {
  const row = getDatabase().prepare('SELECT result_json, created_at FROM scan_latest WHERE id = 1').get()
  if (!row) {
    return null
  }
  return {
    items: JSON.parse(String(row.result_json)) as ScanItem[],
    createdAt: String(row.created_at)
  }
}
