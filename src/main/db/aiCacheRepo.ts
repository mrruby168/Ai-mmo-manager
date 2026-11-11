import type { ScanItem } from '@shared/types'
import { getDatabase, getDatabasePath, withTransaction } from './connection'

/**
 * Cost-control cache. Stored in the existing `meta` key/value table so no
 * schema migration is needed:
 *   ai_cache:news:<projectId> -> { fingerprint, checkedAt }
 *   ai_cache:scan:<cacheKey>  -> { item, createdAt }
 * News results themselves already live in `news_items`; the cache only records
 * that a project was searched, so it does not need to copy them.
 */

const NEWS_PREFIX = 'ai_cache:news:'
const SCAN_PREFIX = 'ai_cache:scan:'

export interface NewsCheckEntry {
  fingerprint: string
  checkedAt: string
}

export interface ScanCacheEntry {
  item: ScanItem
  createdAt: string
}

/**
 * The cache is an optimisation, not a source of truth. When no database is open
 * (unit tests that mock the other repos, very early startup) reads come back
 * empty and writes are skipped. This checks the path instead of catching, so a
 * real database error is still thrown.
 */
function isDatabaseOpen(): boolean {
  return getDatabasePath() !== null
}

function upsert(key: string, value: string): void {
  getDatabase()
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

function readAll(prefix: string): Array<{ key: string; value: string }> {
  if (!isDatabaseOpen()) {
    return []
  }
  const rows = getDatabase().prepare('SELECT key, value FROM meta WHERE key GLOB ?').all(`${prefix}*`)
  return (rows as unknown as Array<{ key: string; value: string }>).map((row) => ({
    key: String(row.key),
    value: String(row.value)
  }))
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function getNewsCheckEntries(): Map<string, NewsCheckEntry> {
  const result = new Map<string, NewsCheckEntry>()
  for (const row of readAll(NEWS_PREFIX)) {
    const entry = parseJson<NewsCheckEntry>(row.value)
    if (entry && typeof entry.fingerprint === 'string' && typeof entry.checkedAt === 'string') {
      result.set(row.key.slice(NEWS_PREFIX.length), entry)
    }
  }
  return result
}

export function markNewsChecked(entries: ReadonlyArray<{ projectId: string; fingerprint: string }>, checkedAt: string): void {
  if (entries.length === 0 || !isDatabaseOpen()) {
    return
  }
  withTransaction(() => {
    for (const entry of entries) {
      upsert(`${NEWS_PREFIX}${entry.projectId}`, JSON.stringify({ fingerprint: entry.fingerprint, checkedAt }))
    }
  })
}

export function getScanCacheEntries(keys: readonly string[]): Map<string, ScanCacheEntry> {
  const wanted = new Set(keys)
  const result = new Map<string, ScanCacheEntry>()
  for (const row of readAll(SCAN_PREFIX)) {
    const key = row.key.slice(SCAN_PREFIX.length)
    if (!wanted.has(key)) {
      continue
    }
    const entry = parseJson<ScanCacheEntry>(row.value)
    if (entry && entry.item && typeof entry.createdAt === 'string') {
      result.set(key, entry)
    }
  }
  return result
}

export function putScanCacheEntries(entries: ReadonlyArray<{ key: string; item: ScanItem }>, createdAt: string): void {
  if (entries.length === 0 || !isDatabaseOpen()) {
    return
  }
  withTransaction(() => {
    for (const entry of entries) {
      upsert(`${SCAN_PREFIX}${entry.key}`, JSON.stringify({ item: entry.item, createdAt }))
    }
  })
}

/** Removes expired entries and news entries of projects that no longer exist. */
export function purgeAiCache(nowMs: number, newsTtlMs: number, scanTtlMs: number): number {
  if (!isDatabaseOpen()) {
    return 0
  }
  const database = getDatabase()
  const projectIds = new Set(
    (database.prepare('SELECT id FROM projects').all() as unknown as Array<{ id: string }>).map((row) => String(row.id))
  )
  const doomed: string[] = []

  for (const row of readAll(NEWS_PREFIX)) {
    const entry = parseJson<NewsCheckEntry>(row.value)
    const projectId = row.key.slice(NEWS_PREFIX.length)
    const checkedAt = entry ? Date.parse(entry.checkedAt) : Number.NaN
    if (!entry || Number.isNaN(checkedAt) || nowMs - checkedAt > newsTtlMs || !projectIds.has(projectId)) {
      doomed.push(row.key)
    }
  }
  for (const row of readAll(SCAN_PREFIX)) {
    const entry = parseJson<ScanCacheEntry>(row.value)
    const createdAt = entry ? Date.parse(entry.createdAt) : Number.NaN
    if (!entry || Number.isNaN(createdAt) || nowMs - createdAt > scanTtlMs) {
      doomed.push(row.key)
    }
  }

  if (doomed.length > 0) {
    withTransaction(() => {
      const statement = database.prepare('DELETE FROM meta WHERE key = ?')
      for (const key of doomed) {
        statement.run(key)
      }
    })
  }
  return doomed.length
}
