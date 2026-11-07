import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { LIMITS } from '@shared/constants'

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***'],
  [/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1***'],
  [/(api[_-]?key["'\s:=]+)[A-Za-z0-9._-]{8,}/gi, '$1***']
]

function logDirectory(): string {
  return join(app.getPath('userData'), 'logs')
}

export function getLogFilePath(): string {
  return join(logDirectory(), 'app.log')
}

function redact(text: string): string {
  return REDACTION_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text)
}

function rotateIfNeeded(file: string): void {
  if (!existsSync(file)) {
    return
  }
  if (statSync(file).size <= LIMITS.logMaxBytes) {
    return
  }
  const rotated = `${file}.1`
  rmSync(rotated, { force: true })
  renameSync(file, rotated)
}

function writeLine(level: 'INFO' | 'ERROR', message: string): void {
  try {
    const file = getLogFilePath()
    mkdirSync(dirname(file), { recursive: true })
    rotateIfNeeded(file)
    appendFileSync(file, `[${new Date().toISOString()}] ${level} ${redact(message)}\n`, 'utf8')
  } catch (error) {
    console.error('Không ghi được log', error)
  }
}

export function logInfo(message: string): void {
  writeLine('INFO', message)
}

export function logError(message: string, error?: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : error === undefined ? '' : String(error)
  writeLine('ERROR', detail ? `${message} | ${detail}` : message)
}
