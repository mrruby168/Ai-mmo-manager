/**
 * FIX 3 / F: bằng chứng của từng lô Check News. Chỉ tin được lưu khi lô đó
 * thật sự có web_search/web_fetch (hoặc trace web search gốc của Model), và
 * sourceUrl phải nằm trong tập URL đã thấy — chặn model tự nghĩ URL.
 */

export interface NewsEvidence {
  searchSuccesses: number
  fetchSuccesses: number
  seenUrls: Set<string>
}

export function createNewsEvidence(): NewsEvidence {
  return { searchSuccesses: 0, fetchSuccesses: 0, seenUrls: new Set<string>() }
}

/** So sánh URL theo origin + path, bỏ query/hash và dấu `/` cuối. */
export function normaliseEvidenceUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    const path = url.pathname.replace(/\/+$/, '')
    return `${url.protocol}//${url.host.toLowerCase()}${path}`
  } catch {
    return null
  }
}

export function noteSearchSuccess(evidence: NewsEvidence, urls: readonly string[]): void {
  evidence.searchSuccesses += 1
  for (const url of urls) {
    const normalised = normaliseEvidenceUrl(url)
    if (normalised) {
      evidence.seenUrls.add(normalised)
    }
  }
}

export function noteFetchSuccess(evidence: NewsEvidence, url: string): void {
  evidence.fetchSuccesses += 1
  const normalised = normaliseEvidenceUrl(url)
  if (normalised) {
    evidence.seenUrls.add(normalised)
  }
}

export function noteTraceSources(evidence: NewsEvidence, sources: readonly string[]): void {
  for (const url of sources) {
    const normalised = normaliseEvidenceUrl(url)
    if (normalised) {
      evidence.seenUrls.add(normalised)
    }
  }
}

/** Lô chỉ được lưu khi có ít nhất một nguồn bằng chứng thật. */
export function hasEvidence(evidence: NewsEvidence, traceUsed: boolean): boolean {
  return traceUsed || evidence.searchSuccesses > 0 || evidence.fetchSuccesses > 0
}

/**
 * Khi chưa thấy URL nào (provider không trả nguồn) thì không thể đối chiếu,
 * nên cho qua và để `verifyNewsSources` quyết định.
 */
export function isSeenSource(evidence: NewsEvidence, sourceUrl: string): boolean {
  if (evidence.seenUrls.size === 0) {
    return true
  }
  const normalised = normaliseEvidenceUrl(sourceUrl)
  return normalised !== null && evidence.seenUrls.has(normalised)
}
