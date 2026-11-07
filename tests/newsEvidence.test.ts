import { describe, expect, it } from 'vitest'
import {
  createNewsEvidence,
  hasEvidence,
  isSeenSource,
  normaliseEvidenceUrl,
  noteFetchSuccess,
  noteSearchSuccess,
  noteTraceSources
} from '../src/main/ai/newsEvidence'

describe('normaliseEvidenceUrl', () => {
  it('lowercases the host and drops query, hash and trailing slashes', () => {
    expect(normaliseEvidenceUrl('https://Alpha.Example.com/news/?utm_source=x#top')).toBe(
      'https://alpha.example.com/news'
    )
    expect(normaliseEvidenceUrl('  https://example.com/a/b/  ')).toBe('https://example.com/a/b')
  })

  it('keeps the root path as an empty segment and rejects non-http URLs', () => {
    expect(normaliseEvidenceUrl('https://example.com/')).toBe('https://example.com')
    expect(normaliseEvidenceUrl('ftp://example.com/file')).toBeNull()
    expect(normaliseEvidenceUrl('not a url')).toBeNull()
    expect(normaliseEvidenceUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('news evidence recorder', () => {
  it('counts search and fetch successes and records the URLs', () => {
    const evidence = createNewsEvidence()

    expect(hasEvidence(evidence, false)).toBe(false)

    noteSearchSuccess(evidence, ['https://alpha.example.com/a', 'javascript:alert(1)'])
    expect(evidence.searchSuccesses).toBe(1)
    expect(evidence.seenUrls.size).toBe(1)
    expect(hasEvidence(evidence, false)).toBe(true)

    noteFetchSuccess(evidence, 'https://alpha.example.com/b/?x=1')
    expect(evidence.fetchSuccesses).toBe(1)
    expect(evidence.seenUrls.has('https://alpha.example.com/b')).toBe(true)
  })

  it('accepts the native provider trace as evidence without counting app searches', () => {
    const evidence = createNewsEvidence()
    noteTraceSources(evidence, ['https://alpha.example.com/post'])

    expect(evidence.searchSuccesses).toBe(0)
    expect(hasEvidence(evidence, true)).toBe(true)
    expect(evidence.seenUrls.has('https://alpha.example.com/post')).toBe(true)
  })

  it('blocks invented sources when at least one URL was seen, but allows the empty case', () => {
    const empty = createNewsEvidence()
    expect(isSeenSource(empty, 'https://anything.example.com')).toBe(true)

    const evidence = createNewsEvidence()
    noteSearchSuccess(evidence, ['https://alpha.example.com/post?ref=1'])

    expect(isSeenSource(evidence, 'https://alpha.example.com/post')).toBe(true)
    expect(isSeenSource(evidence, 'https://alpha.example.com/other')).toBe(false)
    expect(isSeenSource(evidence, 'not a url')).toBe(false)
  })
})
