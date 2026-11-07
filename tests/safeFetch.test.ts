import { describe, expect, it } from 'vitest'
import { isBlockedAddress, SafeFetchError, safeFetch } from '../src/main/services/safeFetch'

async function expectSafeFetchError(url: string, code: string): Promise<void> {
  try {
    await safeFetch(url)
    expect.unreachable(`safeFetch(${url}) phải ném lỗi`)
  } catch (error) {
    expect(error).toBeInstanceOf(SafeFetchError)
    expect((error as SafeFetchError).code).toBe(code)
  }
}

describe('safeFetch', () => {
  it('rejects non-http protocols', async () => {
    await expectSafeFetchError('ftp://example.com/file', 'INVALID_PROTOCOL')
    await expectSafeFetchError('file:///C:/Windows/win.ini', 'INVALID_PROTOCOL')
    await expectSafeFetchError('not a url', 'INVALID_PROTOCOL')
  })

  it('blocks localhost and private addresses before fetching', async () => {
    await expectSafeFetchError('http://localhost/admin', 'BLOCKED_HOST')
    await expectSafeFetchError('http://127.0.0.1:8080/', 'BLOCKED_HOST')
    await expectSafeFetchError('http://10.1.2.3/', 'BLOCKED_HOST')
    await expectSafeFetchError('http://192.168.0.10/', 'BLOCKED_HOST')
    await expectSafeFetchError('http://[::1]/', 'BLOCKED_HOST')
  })

  it('classifies public and private IP ranges', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false)
    expect(isBlockedAddress('192.168.1.1')).toBe(true)
    expect(isBlockedAddress('172.20.0.1')).toBe(true)
    expect(isBlockedAddress('172.32.0.1')).toBe(false)
    expect(isBlockedAddress('169.254.1.1')).toBe(true)
    expect(isBlockedAddress('100.64.0.1')).toBe(true)
    expect(isBlockedAddress('::1')).toBe(true)
    expect(isBlockedAddress('fd00::1')).toBe(true)
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false)
  })
})
