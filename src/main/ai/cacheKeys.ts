import { createHash } from 'node:crypto'
import { normalizeDomainKey, normalizeNameKey } from '@shared/normalize'
import type { SocialLinks } from '@shared/types'

interface LinkSource {
  name: string
  website: string | null
  socials: SocialLinks
}

function normaliseLink(value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  return value.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/+$/, '')
}

/**
 * Identity of "what we would search for". Changing the website, X, Discord,
 * Telegram or other links (or renaming the project) changes the fingerprint,
 * which invalidates the cache entry. Status, notes and dates do not.
 */
export function projectLinkFingerprint(project: LinkSource): string {
  const payload = [
    normalizeNameKey(project.name),
    normaliseLink(project.website),
    normaliseLink(project.socials.x),
    normaliseLink(project.socials.discord),
    normaliseLink(project.socials.telegram),
    ...[...(project.socials.other ?? [])].map(normaliseLink).sort()
  ]
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32)
}

/** Cache key for a Scan candidate: same name + same website domain. */
export function scanCacheKey(name: string, website: string | null | undefined): string {
  const domain = normalizeDomainKey(website ?? null) ?? ''
  return createHash('sha256').update(`${normalizeNameKey(name)}|${domain}`).digest('hex').slice(0, 32)
}
