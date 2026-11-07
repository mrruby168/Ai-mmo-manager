import { describe, expect, it } from 'vitest'
import { parseLogoProjectId } from '../src/main/services/logoUrl'

describe('parseLogoProjectId', () => {
  it('reads the id from the url the renderer builds', () => {
    expect(parseLogoProjectId('mmo-logo://logo/PRJ-001')).toBe('PRJ-001')
  })

  it('ignores a trailing slash and query string', () => {
    expect(parseLogoProjectId('mmo-logo://logo/PRJ-001/?v=2')).toBe('PRJ-001')
  })

  it('accepts the host-less form', () => {
    expect(parseLogoProjectId('mmo-logo:///PRJ-002')).toBe('PRJ-002')
  })

  it('decodes an encoded project id', () => {
    expect(parseLogoProjectId('mmo-logo://logo/PRJ%20003')).toBe('PRJ 003')
  })

  it('uses the last path segment when an extra prefix is present', () => {
    expect(parseLogoProjectId('mmo-logo://logo/logos/PRJ-004')).toBe('PRJ-004')
  })

  it('returns null for a missing id, a wrong scheme or garbage', () => {
    expect(parseLogoProjectId('mmo-logo://logo')).toBeNull()
    expect(parseLogoProjectId('mmo-logo://logo/')).toBeNull()
    expect(parseLogoProjectId('https://logo/PRJ-001')).toBeNull()
    expect(parseLogoProjectId('not a url')).toBeNull()
  })
})
