import { DatabaseSync } from 'node:sqlite'
import { runMigrations } from './migrations'

let database: DatabaseSync | null = null
let databasePath: string | null = null

export function openDatabase(path: string): DatabaseSync {
  closeDatabase()
  const opened = new DatabaseSync(path, {
    enableForeignKeyConstraints: true,
    timeout: 5_000
  })
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
