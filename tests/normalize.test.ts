import { describe, expect, it } from 'vitest'
import { normalizeDomainKey, normalizeNameKey } from '@shared/normalize'

describe('normalize', () => {
  it('normalizes Vietnamese names to a stable key', () => {
    expect(normalizeNameKey('  Dự Án  ĐẶC BIỆT! ')).toBe('du an dac biet')
    expect(normalizeNameKey('ĐÔ thị')).toBe('do thi')
    expect(normalizeNameKey('Alpha   Beta')).toBe('alpha beta')
    expect(normalizeNameKey('   ')).toBe('')
  })

  it('normalizes domains and rejects invalid URLs', () => {
    expect(normalizeDomainKey('https://www.Example.com/path?x=1')).toBe('example.com')
    expect(normalizeDomainKey('http://sub.example.org')).toBe('sub.example.org')
    expect(normalizeDomainKey('')).toBeNull()
    expect(normalizeDomainKey(null)).toBeNull()
    expect(normalizeDomainKey('not-a-url')).toBeNull()
    expect(normalizeDomainKey('ftp://example.com')).toBeNull()
  })
})
