import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../src/main/db/connection'

const dir = mkdtempSync(join(tmpdir(), 'mmo-migration-'))
const dbPath = join(dir, 'legacy.db')

afterAll(() => {
  closeDatabase()
  rmSync(dir, { recursive: true, force: true })
})

function createV1Database(path: string): void {
  const database = new DatabaseSync(path)
  database.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      website TEXT,
      task_summary TEXT NOT NULL DEFAULT '',
      how_to_join TEXT NOT NULL DEFAULT '',
      start_date TEXT,
      end_date TEXT,
      cost_type TEXT NOT NULL DEFAULT 'unverified',
      cost_amount_usd REAL,
      status TEXT NOT NULL DEFAULT 'not_joined',
      verification TEXT NOT NULL DEFAULT 'unverified',
      sources_json TEXT NOT NULL DEFAULT '[]',
      logo_path TEXT,
      notes TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL,
      row_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE news_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('important','todo')),
      summary TEXT NOT NULL,
      verification TEXT NOT NULL CHECK(verification IN ('verified','unverified')),
      source_url TEXT NOT NULL,
      source_name TEXT,
      published_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      todo_deadline TEXT,
      is_done INTEGER NOT NULL DEFAULT 0,
      dedupe_hash TEXT NOT NULL UNIQUE
    );

    PRAGMA user_version = 1;
  `)
  database
    .prepare(
      `INSERT INTO projects (id, category, name, name_key, origin, created_at, updated_at)
       VALUES ('PRJ-001', 'airdrop', 'Alpha', 'alpha', 'manual', '2026-11-01', '2026-11-01')`
    )
    .run()
  database
    .prepare(
      `INSERT INTO news_items (
        project_id, kind, summary, verification, source_url, source_name,
        published_at, fetched_at, todo_deadline, is_done, dedupe_hash
      ) VALUES ('PRJ-001', 'important', 'Tin cũ', 'verified', 'https://alpha.example.com/news',
        'Alpha', '2026-11-05T08:00:00.000Z', '2026-11-05T08:05:00.000Z', NULL, 0, 'hash-legacy')`
    )
    .run()
  database.close()
}

describe('migration v1 -> v2 (FIX 1 / D1)', () => {
  it('adds milestone columns, keeps old rows and writes a one-time backup', () => {
    createV1Database(dbPath)

    const database = openDatabase(dbPath)

    expect(Number(database.prepare('PRAGMA user_version').get()?.user_version)).toBe(2)
    const columns = (
      database.prepare('PRAGMA table_info(news_items)').all() as unknown as Array<{ name: string }>
    ).map((column) => column.name)
    expect(columns).toContain('milestone_kind')
    expect(columns).toContain('milestone_date')

    const row = database.prepare('SELECT summary, milestone_kind, milestone_date FROM news_items').get()
    expect(row?.summary).toBe('Tin cũ')
    expect(row?.milestone_kind).toBeNull()
    expect(row?.milestone_date).toBeNull()

    const backupPath = `${dbPath}.bak-v1`
    expect(existsSync(backupPath)).toBe(true)
    const backup = new DatabaseSync(backupPath)
    expect(Number(backup.prepare('PRAGMA user_version').get()?.user_version)).toBe(1)
    expect(Number(backup.prepare('SELECT COUNT(*) AS count FROM news_items').get()?.count)).toBe(1)
    backup.close()

    // Mở lại lần nữa không chạy lại migration và không ghi đè bản sao.
    closeDatabase()
    const reopened = openDatabase(dbPath)
    expect(Number(reopened.prepare('PRAGMA user_version').get()?.user_version)).toBe(2)
    expect(Number(reopened.prepare('SELECT COUNT(*) AS count FROM news_items').get()?.count)).toBe(1)
  })

  it('creates a fresh database at v2 without a backup file', () => {
    const freshPath = join(dir, 'fresh.db')
    const database = openDatabase(freshPath)

    expect(Number(database.prepare('PRAGMA user_version').get()?.user_version)).toBe(2)
    expect(existsSync(`${freshPath}.bak-v1`)).toBe(false)
  })
})
