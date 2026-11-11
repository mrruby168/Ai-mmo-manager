import type { AiMessage } from './types'
import { AiError } from './types'
import { newsResultSchema } from '@shared/schemas'
import type { MilestoneKind, VerificationState } from '@shared/constants'
import type { Project } from '@shared/types'
import { listProjects } from '../db/projectsRepo'
import { listNews, setLastNewsCheckedAt } from '../db/newsRepo'
import { saveNewsBatch } from '../services/newsService'
import { createModelClient } from './providers'
import { getModelConnection, getTaskModelMeta } from './providerService'
import { getNewsTools, NEWS_RESULT_KIND } from './tools'
import type { AgentResult, AgentTool, AgentUsage } from './agentRunner'
import { AgentStepLimitError, runAgent } from './agentRunner'
import { runAiTask } from './aiTaskRunner'
import { NEWS_SYSTEM_PROMPT } from './prompts'
import { isWithinNewsWindow, promptDateOnly } from '@shared/newsPrompt'
import { broadcastToRenderers } from '../ipc/guard'
import { EVENTS } from '@shared/ipc-channels'
import { buildNewsCheckMessage, parseNewsSubmission, verifyNewsSources } from './newsCheck'
import { mergeSearchTraces } from './searchTrace'
import { assertAiEnabled } from './aiMode'
import {
  createNewsEvidence,
  hasEvidence,
  isSeenSource,
  noteTraceSources
} from './newsEvidence'
import { loadSearchProvider } from '../services/webSearchService'
import { describeSearchError } from '../services/searchProviders'
import type { SearchProvider } from '../services/searchProviders'
import { COST_LIMITS, buildGroupedSearchQueries, chunk, isCacheFresh, pickNewsBatchSize } from '@shared/costControl'
import { getNewsCheckEntries, markNewsChecked, purgeAiCache } from '../db/aiCacheRepo'
import { projectLinkFingerprint } from './cacheKeys'
import { createSearchBudget } from './searchBudget'
import type { SearchBudget } from './searchBudget'
import { wrapUntrustedWebContent } from './webTools'
import { noteSearchSuccess } from './newsEvidence'
import { logInfo } from '../services/logger'

// Batch size comes from `pickNewsBatchSize`: Anthropic's built-in web search
// allows only 5 uses per request, so it keeps 3 projects per batch there and
// 5 everywhere else (fewer repeated system prompts).
const NEWS_WINDOW_DAYS = 7
const GROUPED_SEARCH_SUFFIX = 'airdrop news'
const PREFETCH_SNIPPET_MAX = 280

export interface NewsCheckResult {
  added: number
  rejected: number
  message: string
}

interface CheckSelection {
  connection: ReturnType<typeof getModelConnection>
  /** Model có tìm kiếm web gốc (dùng `enableWebSearch` của provider). */
  nativeSearch: boolean
  /** Web Search do app cung cấp (D2), null nếu chưa cấu hình. */
  search: SearchProvider | null
}

/**
 * FIX 3 / C: chạy được khi Model có tool calling VÀ (Model có Web Search gốc
 * HOẶC app đã cấu hình Web Search). Thiếu cả hai thì báo rõ hai cách xử lý.
 */
function requireSelection(): CheckSelection {
  const meta = getTaskModelMeta('news')
  if (!meta) {
    throw new AiError('unsupported', 'Chưa chọn Model cho Check News. Chọn Model ở khung của tab News (hoặc Chat Box làm mặc định)')
  }
  if (!meta.supportsTools) {
    throw new AiError(
      'unsupported',
      `Model "${meta.modelLabel}" không hỗ trợ tool calling nên không thể Check News. Hãy chọn Model khác ở khung Model của tab News`
    )
  }

  let search: SearchProvider | null = null
  try {
    search = loadSearchProvider()
  } catch (error) {
    throw new AiError(
      'unsupported',
      `Không đọc được cấu hình Web Search: ${describeSearchError(error)}. Vào Settings → Web Search để kiểm tra lại.`
    )
  }

  if (!meta.supportsWebSearch && !search) {
    throw new AiError(
      'unsupported',
      `Model "${meta.modelLabel}" không có Web Search và app chưa cấu hình Web Search. Có hai cách xử lý: (1) chọn Model có Web Search ở khung Model của tab News, hoặc (2) vào Settings → Web Search để thêm API key Tavily/Brave hay URL SearXNG.`
    )
  }

  return {
    connection: getModelConnection(meta.providerId, meta.modelId),
    nativeSearch: meta.supportsWebSearch,
    search
  }
}

interface KnownMilestone {
  kind: MilestoneKind
  date: string
  verification: VerificationState
}

function buildKnownMilestones(): Map<string, KnownMilestone[]> {
  const map = new Map<string, KnownMilestone[]>()
  for (const item of listNews()) {
    if (!item.milestoneKind || !item.milestoneDate) {
      continue
    }
    const list = map.get(item.projectId) ?? []
    list.push({ kind: item.milestoneKind, date: item.milestoneDate, verification: item.verification })
    map.set(item.projectId, list)
  }
  return map
}

function projectPayload(project: Project, milestones: Map<string, KnownMilestone[]>): Record<string, unknown> {
  const known: string[] = []
  const push = (kind: string, date: string): void => {
    const label = `${kind}:${date}`
    if (!known.includes(label)) {
      known.push(label)
    }
  }
  if (project.endDate) {
    push('end', project.endDate)
  }
  for (const milestone of milestones.get(project.id) ?? []) {
    push(milestone.kind, milestone.date)
  }

  // Only what the model needs to search and to avoid re-reporting known dates.
  // Empty fields are omitted instead of sent as "không có".
  const payload: Record<string, unknown> = { id: project.id, name: project.name }
  if (project.website) payload.website = project.website
  if (project.socials.x) payload.x = project.socials.x
  if (project.socials.discord) payload.discord = project.socials.discord
  if (project.socials.telegram) payload.telegram = project.socials.telegram
  if (project.socials.other && project.socials.other.length > 0) payload.other = project.socials.other
  if (known.length > 0) payload.known = known
  return payload
}

function buildBatchMessage(
  batch: Project[],
  milestones: Map<string, KnownMilestone[]>,
  now: Date,
  prefetched: string | null
): string {
  const today = promptDateOnly(now)
  const windowStart = promptDateOnly(new Date(now.getTime() - (NEWS_WINDOW_DAYS - 1) * 86_400_000))
  const batchJson = JSON.stringify(batch.map((project) => projectPayload(project, milestones)))
  const lines = [
    `Hôm nay: ${today} (UTC+7). Chỉ nhận tin có publishedAt từ ${windowStart} đến hết hôm nay.`,
    `Dự án (JSON; "known" là các mốc đã biết dạng kind:date): ${batchJson}`
  ]
  if (prefetched) {
    lines.push('', 'Kết quả tìm kiếm gộp đã chạy sẵn (chỉ là gợi ý, vẫn phải mở bài gốc để xác minh ngày):', prefetched)
  }
  lines.push(
    '',
    'Khi tìm, gộp tối đa 3 dự án mỗi truy vấn bằng (A OR B OR C) kèm từ khóa; chỉ tìm riêng lẻ khi kết quả gộp thiếu một dự án.',
    'Mỗi dự án tối đa MỘT tin kind="important"; kind="todo" tùy số việc cần làm. Điền milestoneKind + milestoneDate khi bài nêu ngày, không bịa.',
    'Nộp qua submit_news; không có tin mới thì nộp items rỗng.'
  )
  return lines.join('\n')
}

/**
 * One grouped query per up to 3 projects instead of one search per project.
 * Only used for the app-side search provider; native provider search is run by
 * the model itself. Every query is charged to the run-wide budget.
 */
async function prefetchGroupedSearch(
  search: SearchProvider,
  batch: Project[],
  budget: SearchBudget,
  evidence: ReturnType<typeof createNewsEvidence>,
  signal: AbortSignal
): Promise<string | null> {
  const queries = buildGroupedSearchQueries(
    batch.map((project) => project.name),
    GROUPED_SEARCH_SUFFIX
  )
  const sections: string[] = []
  for (const query of queries) {
    if (signal.aborted || !budget.tryConsume()) {
      break
    }
    try {
      const results = await search.search(query, { signal, maxResults: 6 })
      noteSearchSuccess(
        evidence,
        results.map((item) => item.url)
      )
      if (results.length === 0) {
        continue
      }
      const body = results
        .map(
          (item, index) =>
            `${index + 1}. ${item.title}\n${item.url}\n${item.snippet.slice(0, PREFETCH_SNIPPET_MAX)}${
              item.publishedAt ? `\n(đăng: ${item.publishedAt})` : ''
            }`
        )
        .join('\n\n')
      sections.push(wrapUntrustedWebContent(`web_search:${query}`, body))
    } catch (error) {
      // A failed prefetch is not fatal: the model still has the web_search tool.
      logInfo(`Prefetch search thất bại: ${describeSearchError(error)}`)
    }
  }
  return sections.length > 0 ? sections.join('\n\n') : null
}

function pickTools(
  selection: CheckSelection,
  batchEvidence: ReturnType<typeof createNewsEvidence>,
  budget: SearchBudget
): AgentTool[] {
  return getNewsTools({
    search: selection.search,
    evidence: batchEvidence,
    costControl: { budget }
  })
}

export interface CheckNewsOptions {
  /** Ignore the cache and check every project again. */
  force?: boolean
}

export async function runCheckNews(options: CheckNewsOptions = {}): Promise<NewsCheckResult> {
  assertAiEnabled()
  const selection = requireSelection()

  const all = listProjects()
  if (all.length === 0) {
    return { added: 0, rejected: 0, message: 'Chưa có dự án nào để kiểm tra tin' }
  }

  // D4: quét mọi dự án; dự án đã hoàn thành xếp cuối để Claim/Whitelist/Listing
  // vẫn được kiểm tra mà không chiếm chỗ các dự án đang chạy.
  const ordered = [
    ...all.filter((project) => project.status !== 'completed'),
    ...all.filter((project) => project.status === 'completed')
  ]

  // Smart cache: a project searched within the TTL whose links did not change is
  // skipped entirely (no LLM call, no search). Its news is already in news_items.
  const nowMs = Date.now()
  purgeAiCache(nowMs, COST_LIMITS.newsCacheTtlMs, COST_LIMITS.scanCacheTtlMs)
  const cacheEntries = getNewsCheckEntries()
  const fingerprints = new Map(ordered.map((project) => [project.id, projectLinkFingerprint(project)]))
  const scope: Project[] = []
  let cachedCount = 0
  for (const project of ordered) {
    const entry = cacheEntries.get(project.id)
    const fresh =
      !options.force &&
      entry !== undefined &&
      entry.fingerprint === fingerprints.get(project.id) &&
      isCacheFresh(entry.checkedAt, nowMs, COST_LIMITS.newsCacheTtlMs)
    if (fresh) {
      cachedCount += 1
    } else {
      scope.push(project)
    }
  }

  if (scope.length === 0) {
    return {
      added: 0,
      rejected: 0,
      message: `Cả ${cachedCount} dự án đã được kiểm tra trong ${COST_LIMITS.newsCacheTtlMs / 3_600_000} giờ qua và link không đổi nên không gọi AI/Search. Sửa link dự án hoặc đợi hết hạn cache để quét lại.`
    }
  }

  const client = createModelClient(selection.connection)
  const milestones = buildKnownMilestones()
  const batches = chunk(scope, pickNewsBatchSize(selection.connection.providerType, selection.nativeSearch))
  const budget = createSearchBudget(COST_LIMITS.newsMaxSearchesPerRun)
  const usageTotal = { inputTokens: 0, outputTokens: 0, calls: 0 }
  const onUsage = (usage: AgentUsage): void => {
    usageTotal.inputTokens += usage.inputTokens
    usageTotal.outputTokens += usage.outputTokens
    usageTotal.calls += 1
    // App-side searches are charged when they run; provider-side ones only show up here.
    if (selection.nativeSearch) {
      budget.record(usage.searches)
    }
  }

  let added = 0
  let rejected = 0

  return runAiTask('Check News', 'news', async (signal, reporter) => {
    const total = batches.length
    let failedBatches = 0
    let noEvidenceBatches = 0
    let searchUnverifiedBatches = 0
    let firstFailure: string | null = null
    let checkedProjects = 0
    let stoppedByBudget = false

    // `tools` is created once per batch and shared by the reminder run, so the
    // per-batch caps on web_fetch / web_search are not reset by the retry.
    const runBatchAgent = async (tools: AgentTool[], messages: AiMessage[]): Promise<AgentResult | null> => {
      try {
        return await runAgent({
          client,
          system: NEWS_SYSTEM_PROMPT,
          messages,
          tools,
          enableWebSearch: selection.nativeSearch,
          maxTokens: 4096,
          maxSteps: COST_LIMITS.agentMaxSteps,
          promptCache: true,
          compactToolResults: {
            keepFullTurns: COST_LIMITS.toolResultFullTurns,
            maxChars: COST_LIMITS.toolResultCompactChars
          },
          onUsage,
          signal
        })
      } catch (error) {
        // Running out of steps ruins one batch, not the whole run.
        if (error instanceof AgentStepLimitError && !signal.aborted) {
          return null
        }
        throw error
      }
    }

    for (let batchIndex = 0; batchIndex < total; batchIndex += 1) {
      if (signal.aborted) {
        break
      }
      if (budget.exhausted()) {
        stoppedByBudget = true
        break
      }
      const batch = batches[batchIndex]
      reporter.report('Kiểm tra tin', batchIndex / total, 1, `Lô ${batchIndex + 1}/${total} (${batch.length} dự án)`)

      const evidence = createNewsEvidence()
      const now = new Date()
      const prefetched =
        !selection.nativeSearch && selection.search
          ? await prefetchGroupedSearch(selection.search, batch, budget, evidence, signal)
          : null
      const messages: AiMessage[] = [{ role: 'user', content: buildBatchMessage(batch, milestones, now, prefetched) }]
      const tools = pickTools(selection, evidence, budget)

      let result = await runBatchAgent(tools, messages)
      if (!result) {
        failedBatches += 1
        firstFailure ??= `Lô ${batchIndex + 1}: AI quá số bước cho phép`
        continue
      }
      // Search traces from the first attempt still count as evidence when the
      // reminder succeeds.
      const traces = [...result.webSearch]

      // One reminder when the model answered with prose instead of calling
      // submit_news. A second miss counts as a failed batch.
      if (!signal.aborted && result.outcome !== 'submit' && result.outcome === 'completed') {
        result = await runBatchAgent(tools, [
          ...result.messages,
          { role: 'user', content: 'Bạn chưa nộp kết quả. Hãy gọi submit_news ngay với items (rỗng nếu không có tin mới).' }
        ])
        if (!result) {
          failedBatches += 1
          firstFailure ??= `Lô ${batchIndex + 1}: AI quá số bước cho phép`
          continue
        }
        traces.push(...result.webSearch)
      }

      if (signal.aborted) {
        break
      }

      if (result.outcome !== 'submit') {
        failedBatches += 1
        firstFailure ??= `Lô ${batchIndex + 1}: AI không gọi submit_news`
        continue
      }

      const payload = result.payload as { kind?: string; data?: unknown }
      if (payload.kind !== NEWS_RESULT_KIND) {
        failedBatches += 1
        firstFailure ??= `Lô ${batchIndex + 1}: kết quả nộp sai loại`
        continue
      }
      const parsed = newsResultSchema.safeParse(payload.data)
      if (!parsed.success) {
        failedBatches += 1
        firstFailure ??= `Lô ${batchIndex + 1}: JSON không đúng schema (${parsed.error.issues[0]?.message ?? 'không rõ'})`
        continue
      }

      for (const trace of traces) {
        noteTraceSources(evidence, trace.sources)
      }
      const traceUsed = mergeSearchTraces(traces).used

      const allowedIds = new Set(batch.map((project) => project.id))
      const windowNow = new Date()
      const submission = parseNewsSubmission(parsed.data.items, allowedIds, (iso) =>
        isWithinNewsWindow(iso, windowNow, NEWS_WINDOW_DAYS)
      )
      rejected += submission.rejected

      // F.2: không có bất kỳ bằng chứng tìm kiếm nào thì bỏ cả lô.
      if (!hasEvidence(evidence, traceUsed)) {
        noEvidenceBatches += 1
        rejected += submission.items.length
        firstFailure ??= `Lô ${batchIndex + 1}: không có bằng chứng web search nên bỏ ${submission.items.length} tin AI tự khai`
        continue
      }

      // F.3: sourceUrl do model tự nghĩ (không nằm trong tập URL đã thấy) bị bỏ.
      const seen = submission.items.filter((item) => isSeenSource(evidence, item.sourceUrl))
      rejected += submission.items.length - seen.length

      const projectNames = new Map(batch.map((project) => [project.id, project.name]))
      const verified = await verifyNewsSources(seen, projectNames)
      rejected += verified.rejected

      const outcome = saveNewsBatch(verified.items, windowNow.toISOString(), (iso) =>
        isWithinNewsWindow(iso, windowNow, NEWS_WINDOW_DAYS), allowedIds)
      added += outcome.added
      rejected += outcome.rejected

      if (!traceUsed && evidence.searchSuccesses === 0) {
        searchUnverifiedBatches += 1
      }

      // Only a batch that really ran and was saved is cached; failed batches are retried next time.
      markNewsChecked(
        batch.map((project) => ({ projectId: project.id, fingerprint: fingerprints.get(project.id) ?? '' })),
        new Date().toISOString()
      )
      checkedProjects += batch.length
    }

    if (!signal.aborted) {
      setLastNewsCheckedAt(new Date().toISOString())
    }

    logInfo(
      `Check News: ${checkedProjects}/${scope.length} dự án, ${cachedCount} từ cache, ${usageTotal.calls} lượt gọi model, ` +
        `input=${usageTotal.inputTokens} output=${usageTotal.outputTokens} token, tìm kiếm=${budget.used()}/${budget.max}`
    )

    reporter.report('Tổng hợp', 1, 1, `Đã thêm ${added} tin`)
    broadcastToRenderers(EVENTS.dataChanged, { entity: 'news' })

    const extras: string[] = []
    if (cachedCount > 0) {
      extras.push(`${cachedCount} dự án dùng cache (đã kiểm tra < ${COST_LIMITS.newsCacheTtlMs / 3_600_000} giờ, link không đổi)`)
    }
    if (stoppedByBudget) {
      extras.push(
        `đạt giới hạn ${budget.max} lượt tìm kiếm mỗi phiên, còn ${scope.length - checkedProjects} dự án chưa kiểm tra, bấm Check News lại để tiếp tục`
      )
    }
    const base = signal.aborted
      ? `Đã dừng kiểm tra tin giữa chừng: thêm ${added} tin, bỏ ${rejected} tin`
      : buildNewsCheckMessage({
          added,
          rejected,
          failedBatches,
          totalBatches: total,
          searchUnverifiedBatches,
          noEvidenceBatches,
          firstFailure
        })

    return {
      added,
      rejected,
      message: extras.length > 0 ? `${base} · ${extras.join(' · ')}` : base
    }
  })
}
