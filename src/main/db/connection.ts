import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync } from 'node:fs'
import { runMigrations } from './migrations'

let database: DatabaseSync | null = null
let databasePath: string | null = null

/**
 * D1: sao lưu file DB một lần trước khi nâng schema v1 -> v2.
 * Bỏ qua DB trong bộ nhớ và file đã có bản sao.
 */
function backupBeforeMigration(opened: DatabaseSync, path: string): void {
  if (path === ':memory:') {
    return
  }
  const row = opened.prepare('PRAGMA user_version').get()
  const version = row ? Number(row.user_version) : 0
  if (version !== 1) {
    return
  }
  const backupPath = `${path}.bak-v1`
  if (!existsSync(backupPath)) {
    copyFileSync(path, backupPath)
  }
}

export function openDatabase(path: string): DatabaseSync {
  closeDatabase()
  const opened = new DatabaseSync(path, {
    enableForeignKeyConstraints: true,
    timeout: 5_000
  })
  backupBeforeMigration(opened, path)
  runMigrations(opened)
  database = opened
  databasePath = path
  return opened
}

export function getDatabase(): DatabaseSync {
  if (!database) {
    throw new Error('Database chưa được mở')
  }
  return database
}

export function getDatabasePath(): string | null {
  return databasePath
}

export function closeDatabase(): void {
  if (database) {
    database.close()
    database = null
    databasePath = null
  }
}

export function withTransaction<T>(work: () => T): T {
  const db = getDatabase()
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
