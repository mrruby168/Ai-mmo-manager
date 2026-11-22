import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDraftConnection } from '../src/main/ai/draftConnection'
import { providerTestSchema } from '../src/shared/schemas'

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')

describe('Test Provider không cần Lưu: schema IPC', () => {
  it('vẫn nhận payload cũ (Provider đã lưu)', () => {
    expect(providerTestSchema.parse({ providerId: 'a', modelId: 'b' })).toEqual({ providerId: 'a', modelId: 'b' })
  })

  it('nhận payload chỉ có draft (Provider mới, chưa lưu)', () => {
    const parsed = providerTestSchema.parse({
      modelId: 'gpt-5',
      draft: { type: 'openai', baseUrl: null, apiKey: 'sk-test', supportsWebSearch: true }
    })
    expect(parsed.providerId).toBeUndefined()
    expect(parsed.draft?.type).toBe('openai')
  })

  it('từ chối payload thiếu cả providerId lẫn draft', () => {
    expect(providerTestSchema.safeParse({ modelId: 'gpt-5' }).success).toBe(false)
  })

  it('từ chối Base URL sai định dạng trong draft', () => {
    const result = providerTestSchema.safeParse({ modelId: 'm', draft: { type: 'custom', baseUrl: 'ftp://x' } })
    expect(result.success).toBe(false)
  })
})

describe('Test Provider không cần Lưu: dựng kết nối từ cấu hình đang nhập', () => {
  it('dùng khóa và Base URL đang nhập', () => {
    const result = buildDraftConnection('gpt-5', { type: 'custom', baseUrl: 'https://api.example.com/v1', apiKey: ' sk-new ' }, null)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.connection.apiKey).toBe('sk-new')
      expect(result.connection.baseUrl).toBe('https://api.example.com/v1')
      expect(result.connection.modelId).toBe('gpt-5')
    }
  })

  it('không gõ khóa thì lấy khóa và headers đã lưu của Provider', () => {
    const result = buildDraftConnection('m', { type: 'openai', baseUrl: null }, { apiKey: 'saved-key', headers: { 'X-A': '1' } })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.connection.apiKey).toBe('saved-key')
      expect(result.connection.headers).toEqual({ 'X-A': '1' })
    }
  })

  it('không có khóa ở đâu cả thì báo lỗi rõ ràng, không ném lỗi', () => {
    const result = buildDraftConnection('m', { type: 'openai' }, null)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('API Key')
    }
  })

  it('Provider Custom thiếu Base URL thì báo lỗi; Provider có sẵn preset thì dùng mặc định', () => {
    expect(buildDraftConnection('m', { type: 'custom', apiKey: 'k' }, null).ok).toBe(false)
    const builtIn = buildDraftConnection('m', { type: 'openai', apiKey: 'k' }, null)
    expect(builtIn.ok).toBe(true)
    if (builtIn.ok) {
      expect(builtIn.connection.baseUrl.startsWith('https://')).toBe(true)
    }
  })

  it('draft.baseUrl = null (cố ý để trống) không rơi về Base URL đã lưu', () => {
    const result = buildDraftConnection('m', { type: 'openai', baseUrl: null, apiKey: 'k' }, { baseUrl: 'https://old.example.com/v1' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.connection.baseUrl).not.toContain('old.example.com')
    }
  })
})

describe('Test Provider không cần Lưu: ProviderEditor', () => {
  const editor = read('src/renderer/src/features/settings/ProviderEditor.tsx')

  it('nút Test không còn phụ thuộc "đã Lưu / không dirty" và gửi draft', () => {
    expect(editor).not.toContain('canTest = provider !== null && !dirty')
    expect(editor).not.toContain('Lưu thay đổi trước khi Test')
    expect(editor).not.toContain('Nút Test dùng cấu hình đã lưu')
    expect(editor).toContain('draft:')
    expect(editor).toContain('providerId: provider?.id')
  })
})
