export interface WebSearchTrace {
  used: boolean
  sources: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function walk(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      walk(entry, visit)
    }
    return
  }
  if (!isRecord(value)) {
    return
  }
  visit(value)
  for (const entry of Object.values(value)) {
    walk(entry, visit)
  }
}

function collectHttpUrls(value: unknown): string[] {
  const urls: string[] = []
  walk(value, (record) => {
    for (const key of ['url', 'uri'] as const) {
      const candidate = record[key]
      if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate) && !urls.includes(candidate)) {
        urls.push(candidate)
      }
    }
  })
  return urls
}

/**
 * Anthropic returns `server_tool_use` and `web_search_tool_result` content
 * blocks when the server-side search tool actually ran.
 */
export function traceFromAnthropicBlocks(blocks: unknown): WebSearchTrace {
  let used = false
  walk(blocks, (record) => {
    if (record.type === 'server_tool_use' || record.type === 'web_search_tool_result') {
      used = true
    }
  })
  return { used, sources: used ? collectHttpUrls(blocks) : [] }
}

/**
 * OpenAI-compatible providers expose citations as `url_citation` annotations.
 * Some compatible servers ignore `web_search_options`; in that case no
 * annotation appears and the caller can warn the user.
 */
export function traceFromOpenAiMessage(message: unknown): WebSearchTrace {
  let used = false
  const urls: string[] = []
  walk(message, (record) => {
    if (record.type === 'url_citation') {
      used = true
      const citation = record.url_citation
      if (isRecord(citation) && typeof citation.url === 'string' && !urls.includes(citation.url)) {
        urls.push(citation.url)
      }
    }
  })
  return { used, sources: urls }
}

/** Gemini reports grounding chunks and the queries it ran. */
export function traceFromGoogleCandidate(candidate: unknown): WebSearchTrace {
  if (!isRecord(candidate)) {
    return { used: false, sources: [] }
  }
  const metadata = isRecord(candidate.groundingMetadata) ? candidate.groundingMetadata : null
  if (!metadata) {
    return { used: false, sources: [] }
  }
  const queries = Array.isArray(metadata.webSearchQueries) ? metadata.webSearchQueries : []
  const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : []
  const urls: string[] = []
  walk(chunks, (record) => {
    const web = isRecord(record.web) ? record.web : null
    const uri = web && typeof web.uri === 'string' ? web.uri : null
    if (uri && /^https?:\/\//i.test(uri) && !urls.includes(uri)) {
      urls.push(uri)
    }
  })
  return { used: queries.length > 0 || chunks.length > 0, sources: urls }
}

export function mergeSearchTraces(traces: Array<WebSearchTrace | undefined>): WebSearchTrace {
  let used = false
  const sources: string[] = []
  for (const trace of traces) {
    if (!trace) {
      continue
    }
    used = used || trace.used
    for (const source of trace.sources) {
      if (!sources.includes(source)) {
        sources.push(source)
      }
    }
  }
  return { used, sources }
}

/** Number of server-side searches Anthropic ran (one `server_tool_use` block each). */
export function countAnthropicSearches(blocks: unknown): number {
  let count = 0
  walk(blocks, (record) => {
    if (record.type === 'server_tool_use' && (record.name === undefined || record.name === 'web_search')) {
      count += 1
    }
  })
  return count
}

/** Number of search queries Gemini reports in its grounding metadata. */
export function countGoogleSearches(candidate: unknown): number {
  if (!isRecord(candidate) || !isRecord(candidate.groundingMetadata)) {
    return 0
  }
  const queries = candidate.groundingMetadata.webSearchQueries
  return Array.isArray(queries) ? queries.length : 0
}
