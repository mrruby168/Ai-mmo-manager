import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { closeDatabase, getDatabasePath, openDatabase } from '../db/connection'
import { logError, logInfo } from './logger'
import { getSettings, updateSettings } from './settingsStore'

export interface DataLayout {
  root: string
  databaseDir: string
  databaseFile: string
  logosDir: string
  attachmentsDir: string
}

export type DataPathErrorCode = 'DB_EXISTS' | 'SAME_PATH'

export class DataPathError extends Error {
  readonly code: DataPathErrorCode

  constructor(code: DataPathErrorCode, message: string) {
    super(message)
    this.name = 'DataPathError'
    this.code = code
  }
}

export function buildLayout(root: string): DataLayout {
  const databaseDir = join(root, 'database')
  return {
    root,
    databaseDir,
    databaseFile: join(databaseDir, 'mmo-manager.db'),
    logosDir: join(root, 'logos'),
    attachmentsDir: join(root, 'attachments')
  }
}

export function ensureLayout(root: string): DataLayout {
  const layout = buildLayout(root)
  mkdirSync(layout.databaseDir, { recursive: true })
  mkdirSync(layout.logosDir, { recursive: true })
  mkdirSync(layout.attachmentsDir, { recursive: true })
  return layout
}

export function getCurrentLayout(): DataLayout {
  return buildLayout(getSettings().dataPath)
}

export function initializeDataDirectory(): DataLayout {
  const layout = ensureLayout(getSettings().dataPath)
  openDatabase(layout.databaseFile)
  logInfo(`Đã mở database tại ${layout.databaseFile}`)
  return layout
}

function copyIfExists(source: string, target: string): void {
  if (existsSync(source)) {
    cpSync(source, target, { recursive: true, force: false, errorOnExist: false })
  }
}

export function changeDataPath(nextRoot: string, copyExisting: boolean): DataLayout {
  const currentRoot = getSettings().dataPath
  if (nextRoot === currentRoot) {
    throw new DataPathError('SAME_PATH', 'Thư mục mới trùng với thư mục dữ liệu hiện tại')
  }

  const target = ensureLayout(nextRoot)
  if (existsSync(target.databaseFile)) {
    throw new DataPathError('DB_EXISTS', 'Thư mục đã có database mmo-manager.db, không ghi đè')
  }

  const previousDatabasePath = getDatabasePath()
  closeDatabase()

  try {
    if (copyExisting) {
      const source = buildLayout(currentRoot)
      copyIfExists(source.databaseDir, target.databaseDir)
      copyIfExists(source.logosDir, target.logosDir)
      copyIfExists(source.attachmentsDir, target.attachmentsDir)
    }

    openDatabase(target.databaseFile)
    updateSettings({ dataPath: nextRoot })
    logInfo(`Đã đổi thư mục dữ liệu sang ${nextRoot}`)
    return target
  } catch (error) {
    if (previousDatabasePath) {
      try {
        openDatabase(previousDatabasePath)
      } catch (reopenError) {
        logError('Không mở lại được database cũ sau khi đổi thư mục thất bại', reopenError)
      }
    }
    throw error
  }
}

export function getDataFolderToOpen(): string {
  return getSettings().dataPath
}
