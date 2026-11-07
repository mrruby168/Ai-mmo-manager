import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import { logError } from './logger'

interface StoredSecret {
  apiKey: string
  headers?: string
}

type StoredSecrets = Record<string, StoredSecret>

export interface ProviderSecret {
  apiKey: string
  headers?: Record<string, string>
}

export class SecretStoreError extends Error {
  readonly code: 'ENCRYPTION_UNAVAILABLE' | 'DECRYPT_FAILED'

  constructor(code: SecretStoreError['code'], message: string) {
    super(message)
    this.name = 'SecretStoreError'
    this.code = code
  }
}

function secretsFilePath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

function readAll(): StoredSecrets {
  const file = secretsFilePath()
  if (!existsSync(file)) {
    return {}
  }
  return JSON.parse(readFileSync(file, 'utf8')) as StoredSecrets
}

function persist(all: StoredSecrets): void {
  const file = secretsFilePath()
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  writeFileSync(temporary, JSON.stringify(all, null, 2), 'utf8')
  renameSync(temporary, file)
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function saveProviderSecret(providerId: string, apiKey: string, headers?: Record<string, string>): void {
  if (!isEncryptionAvailable()) {
    throw new SecretStoreError('ENCRYPTION_UNAVAILABLE', 'Hệ điều hành không hỗ trợ mã hóa, từ chối lưu API Key')
  }

  const all = readAll()
  all[providerId] = {
    apiKey: safeStorage.encryptString(apiKey).toString('base64'),
    headers: headers ? safeStorage.encryptString(JSON.stringify(headers)).toString('base64') : undefined
  }
  persist(all)
}

export function hasProviderSecret(providerId: string): boolean {
  const entry = readAll()[providerId]
  return Boolean(entry?.apiKey)
}

export function getProviderSecret(providerId: string): ProviderSecret | null {
  const entry = readAll()[providerId]
  if (!entry) {
    return null
  }

  try {
    const apiKey = safeStorage.decryptString(Buffer.from(entry.apiKey, 'base64'))
    const headers = entry.headers
      ? (JSON.parse(safeStorage.decryptString(Buffer.from(entry.headers, 'base64'))) as Record<string, string>)
      : undefined
    return { apiKey, headers }
  } catch (error) {
    logError(`Không giải mã được API Key của provider ${providerId}`, error)
    throw new SecretStoreError('DECRYPT_FAILED', 'Không giải mã được API Key đã lưu')
  }
}

export function deleteProviderSecret(providerId: string): void {
  const all = readAll()
  if (!(providerId in all)) {
    return
  }
  delete all[providerId]
  persist(all)
}
