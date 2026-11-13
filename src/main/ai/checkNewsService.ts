import type { AiMessage } from './types'
import { AiError } from './types'
import { newsSubmissionResultSchema } from '@shared/schemas'
import type { MilestoneKind, VerificationState } from '@shared/constants'
import type { Project } from '@shared/types'
import { listProjects } from '../db/projectsRepo'
import { listNews, setLastNewsCheckedAt } from '../db/newsRepo'
import { saveNewsBatch } from '../services/newsService'
import { buildTaskChain } from './providerService'
import type { TaskChain } from './providerService'
import { createFailoverClient } from './failoverClient'
import { getNewsTools, NEWS_RESULT_KIND } from './tools'
import type { AgentResult, AgentTool, AgentUsage } from './agentRunner'
import { AgentStepLimitError, runAgent } from './agentRunner'
import { runAiTask } from './aiTaskRunner'
import { NEWS_SYSTEM_PROMPT } from './prompts'
import { isWithinNewsWindow, promptDateOnly } from '@shared/newsPrompt'
import { broadcastToRenderers } from '../ipc/guard'
import { EVENTS } from '@shared/ipc-channels'
import {
  addRejectReasons,
  buildNewsCheckMessage,
  buildNewsRejectLogLine,
  createNewsRejectReasons,
  parseNewsSubmission,
  verifyNewsSources
} from './newsCheck'
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
import {
  COST_LIMITS,
  chunk,
  decideNewsCacheOutcome,
  formatNewsCacheTtl,
  isCacheFresh,
  newsCacheTtlForOutcome,
  newsSearchBudgetForProjects,
  pickNewsBatchSize
} from '@shared/costControl'
import {
  buildGroupedProjectNameQueries,
  buildProjectQueries,
  queryTextHitsProject
} from '@shared/projectQueries'
import { getNewsCheckEntries, markNewsChecked, purgeAiCache } from '../db/aiCacheRepo'
import { projectLinkFingerprint } from './cacheKeys'
import { createSearchBudget } from './searchBudget'
import type { SearchBudget } from './searchBudget'
import { wrapUntrustedWebContent } from './webTools'
import { noteSearchSuccess } from './newsEvidence'
import { logInfo } from '../services/logger'
import { getSettings } from '../services/settingsStore'
import { appendAiLog, beginAiLog, finishAiLog } from './aiActivityLog'
import { normalizeXHandle } from '@shared/xLinks'

// Batch size comes from `pickNewsBatchSize`: Anthropic's built-in web search
// allows only 5 uses per request, so it keeps 3 projects per batch there and
// 5 everywhere else (fewer repeated system prompts).
const NEWS_WINDOW_DAYS = 7
const PREFETCH_SNIPPET_MAX = 280

/** 9d: nhắc model tìm lại khi nộp rỗng dù lô đã có bằng chứng tìm kiếm. */
const EMPTY_RETRY_PROMPT =
  'Bạn vừa nộp items rỗng nhưng lô này đã có bằng chứng tìm kiếm. Hãy kiểm tra lại kết quả tìm kiếm và mở thêm bài gốc; nếu thật sự không có tin mới trong 7 ngày, gọi submit_news lại với items rỗng và ghi notes ngắn gọn (≤200 ký tự) đã tìm từ khóa nào. Không bịa tin.'

export interface NewsCheckResult {
  added: number
  rejected: number
  message: string
}

interface CheckSelection {
  /** Chuỗi A1–A3 đã lọc: có tool calling và (Web Search gốc hoặc app đã cấu hình Web Search). */
  chain: TaskChain
  /** Model A1 có tìm kiếm web gốc (dùng `enableWebSearch` của provider). */
  nativeSearch: boolean
  /** Web Search do app cung cấp (D2), null nếu chưa cấu hình. */
  search: SearchProvider | null
}

/**
 * FIX 3 / C: chạy được khi Model có tool calling VÀ (Model có Web Search gốc
 * HOẶC app đã cấu hình Web Search). Thiếu cả hai thì báo rõ hai cách xử lý.
 */
function requireSelection(): CheckSelection {
  let search: SearchProvider | null = null
  try {
    search = loadSearchProvider()
  } catch (error) {
    throw new AiError(
      'unsupported',
      `Không đọc được cấu hình Web Search: ${describeSearchError(error)}. Vào Settings → Web Search để kiểm tra lại.`
    )
  }

  // `native-or-app`: model thiếu Web Search gốc vẫn dùng được nhờ Web Search của app.
  const chain = buildTaskChain('news', { requireTools: true, webSearch: 'native-or-app' }, search !== null)
  const first = chain.candidates[0]
  if (!first) {
    const blocked = chain.skipped[0]
    if (blocked?.reason === 'tools') {
      throw new AiError(
        'unsupported',
        `Model "${blocked.label}" không hỗ trợ tool calling nên không thể Check News. Vào Settings → Model Configuration để chọn model khác cho News.`
      )
    }
    if (blocked?.reason === 'web_search') {
      throw new AiError(
        'unsupported',
        `Model "${blocked.label}" không có Web Search và app chưa cấu hình Web Search. Có hai cách xử lý: (1) vào Settings → Model Configuration chọn model có Web Search cho News, hoặc (2) vào Settings → Web Search để thêm API key Tavily/Brave hay URL SearXNG.`
      )
    }
    throw new AiError(
      'unsupported',
      'Chưa chọn Model cho Check News. Vào Settings → Model Configuration để chọn model A1 cho News.'
    )
  }

  return { chain, nativeSearch: first.supportsWebSearch, search }
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
 * 9b: mỗi dự án được tìm theo handle X trước, rồi tên dự án. Dự án không có
 * handle X được gộp 3 tên một truy vấn; dự án chưa có gợi ý nào được tìm riêng
 * một lần nữa. Mọi truy vấn đều trừ ngân sách chung của lần chạy.
 */
async function prefetchProjectSearch(
  search: SearchProvider,
  batch: Project[],
  budget: SearchBudget,
  evidence: ReturnType<typeof createNewsEvidence>,
  signal: AbortSignal
): Promise<string | null> {
  const byId = new Map(batch.map((project) => [project.id, project]))
  const hits = new Set<string>()
  const ran = new Set<string>()
  const sections: string[] = []
  let queries = 0
  let results = 0

  const runQuery = async (query: string, maxResults: number, projectIds: readonly string[]): Promise<void> => {
    if (signal.aborted || ran.has(query) || !budget.tryConsume()) {
      return
    }
    ran.add(query)
    try {
      const list = await search.search(query, { signal, maxResults })
      queries += 1
      results += list.length
      noteSearchSuccess(
        evidence,
        list.map((item) => item.url)
      )
      appendAiLog('news', 'step', `Quét web "${query}" · ${list.length} kết quả`)
      if (list.length === 0) {
        return
      }
      const targets = projectIds
        .map((id) => byId.get(id))
        .filter((project): project is Project => project !== undefined)
      for (const item of list) {
        for (const project of targets) {
          if (queryTextHitsProject(item, project)) {
            hits.add(project.id)
          }
        }
      }
      const body = list
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
      const reason = describeSearchError(error)
      logInfo(`Prefetch search thất bại: ${reason}`)
      appendAiLog('news', 'warn', `Tìm kiếm "${query}" lỗi: ${reason}`)
    }
  }

  // 1) Bài trên X của từng dự án có handle.
  for (const project of batch) {
    const xQuery = buildProjectQueries(project).find((query) => query.kind === 'x')
    if (xQuery) {
      await runQuery(xQuery.query, xQuery.maxResults, [project.id])
    }
  }

  // 2) Tên các dự án không có handle X, gộp tối đa 3 tên/truy vấn.
  for (const group of buildGroupedProjectNameQueries(batch)) {
    await runQuery(group.query, group.maxResults, group.projectIds)
  }

  // 3) Dự án chưa có gợi ý nào (X yếu, gộp không khớp tên) tìm riêng theo tên.
  for (const project of batch) {
    if (signal.aborted || hits.has(project.id)) {
      continue
    }
    const nameQuery = buildProjectQueries(project).find((query) => query.kind === 'name')
    if (nameQuery) {
      await runQuery(nameQuery.query, nameQuery.maxResults, [project.id])
    }
  }

  if (queries > 0) {
    appendAiLog(
      'news',
      'step',
      `Prefetch: ${queries} truy vấn, ${results} kết quả, ${hits.size}/${batch.length} dự án có gợi ý`
    )
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
    costControl: { budget },
    onLog: (level, text) => appendAiLog('news', level, text)
  })
}

export interface CheckNewsOptions {
  /** Ignore the cache and check every project again. */
  force?: boolean
}

export async function runCheckNews(options: CheckNewsOptions = {}): Promise<NewsCheckResult> {
  assertAiEnabled()
  const selection = requireSelection()
  // FIX 2: TTL cache do người dùng chọn ở Settings → Model Configuration (1 phút / 3 giờ / 8 giờ).
  const newsCacheTtlMs = getSettings().ai.newsCacheTtlMs

  const all = listProjects()
  if (all.length === 0) {
    beginAiLog('news')
    appendAiLog('news', 'warn', 'Chưa có dự án nào để kiểm tra tin')
    finishAiLog('news')
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
  purgeAiCache(nowMs, newsCacheTtlMs, COST_LIMITS.scanCacheTtlMs)
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
      isCacheFresh(entry.checkedAt, nowMs, newsCacheTtlForOutcome(entry.outcome, newsCacheTtlMs))
    if (fresh) {
      cachedCount += 1
    } else {
      scope.push(project)
    }
  }

  if (scope.length === 0) {
    const message = `Cả ${cachedCount} dự án đã được kiểm tra trong ${formatNewsCacheTtl(newsCacheTtlMs)} qua và link không đổi nên không gọi AI/Search. Sửa link dự án hoặc đợi hết hạn cache để quét lại.`
    beginAiLog('news')
    appendAiLog('news', 'success', message)
    finishAiLog('news')
    return {
      added: 0,
      rejected: 0,
      message
    }
  }

  // FIX 2: chuỗi A1–A3. Model đang chạy có thể đổi giữa chừng nên phần đếm
  // lượt tìm kiếm gốc dùng cờ cập nhật theo model đang online; batch size giữ theo A1.
  let activeNativeSearch = selection.nativeSearch
  const client = createFailoverClient(selection.chain.candidates, {
    onOnline: (candidate) => {
      activeNativeSearch = candidate.supportsWebSearch
      logInfo(`Check News dùng model ${candidate.label}`)
      appendAiLog('news', 'online', `${candidate.label} đang online`)
    },
    onSwap: (from, to, error) => {
      logInfo(`Check News đổi model ${from.label} → ${to.label}: ${error.message}`)
      appendAiLog('news', 'warn', `${from.label} lỗi (${error.message}) → chuyển sang ${to.label}`)
    }
  })
  const milestones = buildKnownMilestones()
  const batches = chunk(scope, pickNewsBatchSize(selection.chain.providerType, selection.nativeSearch))
  const budget = createSearchBudget(newsSearchBudgetForProjects(scope.length))
  const usageTotal = { inputTokens: 0, outputTokens: 0, calls: 0 }
  const onUsage = (usage: AgentUsage): void => {
    usageTotal.inputTokens += usage.inputTokens
    usageTotal.outputTokens += usage.outputTokens
    usageTotal.calls += 1
    // App-side searches are charged when they run; provider-side ones only show up here.
    if (activeNativeSearch) {
      budget.record(usage.searches)
    }
  }

  let added = 0
  let rejected = 0
  const rejectReasons = createNewsRejectReasons()

  return runAiTask('Check News', 'news', async (signal, reporter) => {
    const total = batches.length
    let failedBatches = 0
    let noEvidenceBatches = 0
    let searchUnverifiedBatches = 0
    let firstFailure: string | null = null
    let checkedProjects = 0
    let stoppedByBudget = false

    appendAiLog(
      'news',
      'step',
      `Kiểm tra ${scope.length} dự án${cachedCount > 0 ? ` (${cachedCount} dùng cache)` : ''}`
    )

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
        appendAiLog('news', 'warn', `Đạt giới hạn ${budget.max} lượt tìm kiếm, dừng trước lô ${batchIndex + 1}/${total}`)
        break
      }
      const batch = batches[batchIndex]
      const rejectedAtBatchStart = rejected
      // FIX 3: tiến trình News đếm theo dự án đã xử lý (kể cả dự án dùng cache).
      reporter.report(
        'Kiểm tra tin',
        cachedCount + checkedProjects,
        ordered.length,
        `Lô ${batchIndex + 1}/${total} (${batch.length} dự án)`
      )

      const evidence = createNewsEvidence()
      const now = new Date()
      // D25: có Web Search riêng của app thì luôn chạy prefetch, kể cả model A1 có
      // Web Search gốc; kết quả gộp chỉ là gợi ý, model vẫn phải mở bài gốc.
      const prefetched = selection.search
        ? await prefetchProjectSearch(selection.search, batch, budget, evidence, signal)
        : null
      const messages: AiMessage[] = [{ role: 'user', content: buildBatchMessage(batch, milestones, now, prefetched) }]
      const tools = pickTools(selection, evidence, budget)

      let result = await runBatchAgent(tools, messages)
      if (!result) {
        failedBatches += 1
        firstFailure ??= `Lô ${batchIndex + 1}: AI quá số bước cho phép`
        appendAiLog('news', 'warn', `Lô ${batchIndex + 1}: AI quá số bước cho phép`)
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
          appendAiLog('news', 'warn', `Lô ${batchIndex + 1}: AI quá số bước cho phép`)
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
        appendAiLog('news', 'warn', `Lô ${batchIndex + 1}: AI không gọi submit_news`)
        continue
      }

      const payload = result.payload as { kind?: string; data?: unknown }
      if (payload.kind !== NEWS_RESULT_KIND) {
        failedBatches += 1
        firstFailure ??= `Lô ${batchIndex + 1}: kết quả nộp sai loại`
        appendAiLog('news', 'warn', `Lô ${batchIndex + 1}: kết quả nộp sai loại`)
        continue
      }
      const parsed = newsSubmissionResultSchema.safeParse(payload.data)
      if (!parsed.success) {
        failedBatches += 1
        firstFailure ??= `Lô ${batchIndex + 1}: JSON không đúng schema (${parsed.error.issues[0]?.message ?? 'không rõ'})`
        appendAiLog(
          'news',
          'warn',
          `Lô ${batchIndex + 1}: JSON không đúng schema (${parsed.error.issues[0]?.message ?? 'không rõ'})`
        )
        continue
      }

      for (const trace of traces) {
        noteTraceSources(evidence, trace.sources)
      }
      let traceUsed = mergeSearchTraces(traces).used

      const allowedIds = new Set(batch.map((project) => project.id))
      const windowNow = new Date()
      const projectHandles = new Map(batch.map((project) => [project.id, normalizeXHandle(project.socials.x)]))
      const parseBatch = (raw: unknown): ReturnType<typeof parseNewsSubmission> =>
        parseNewsSubmission(
          raw,
          allowedIds,
          (iso) => isWithinNewsWindow(iso, windowNow, NEWS_WINDOW_DAYS),
          projectHandles
        )
      let submission = parseBatch(parsed.data.items)
      rejected += submission.rejected
      addRejectReasons(rejectReasons, submission.reasons)

      // 9d: nộp rỗng dù đã có bằng chứng thì thử lại đúng một lần, trừ 1 đơn vị
      // ngân sách tìm kiếm cho lượt thử.
      if (
        submission.items.length === 0 &&
        hasEvidence(evidence, traceUsed) &&
        !signal.aborted &&
        budget.tryConsume()
      ) {
        appendAiLog('news', 'step', `Lô ${batchIndex + 1}: AI nộp rỗng dù có bằng chứng, thử lại một lần`)
        const retryMessages: AiMessage[] = [
          ...messages,
          { role: 'assistant', content: 'Đã nộp items rỗng cho lô này.' },
          { role: 'user', content: EMPTY_RETRY_PROMPT }
        ]
        const retry = await runBatchAgent(tools, retryMessages)
        if (retry && retry.outcome === 'submit') {
          traces.push(...retry.webSearch)
          for (const trace of retry.webSearch) {
            noteTraceSources(evidence, trace.sources)
          }
          traceUsed = mergeSearchTraces(traces).used
          const retryPayload = retry.payload as { kind?: string; data?: unknown }
          if (retryPayload.kind === NEWS_RESULT_KIND) {
            const retryParsed = newsSubmissionResultSchema.safeParse(retryPayload.data)
            if (retryParsed.success) {
              const next = parseBatch(retryParsed.data.items)
              rejected += next.rejected
              addRejectReasons(rejectReasons, next.reasons)
              submission = next
            }
          }
        }
      }

      // F.2: không có bất kỳ bằng chứng tìm kiếm nào thì bỏ cả lô.
      if (!hasEvidence(evidence, traceUsed)) {
        noEvidenceBatches += 1
        rejected += submission.items.length
        rejectReasons.noEvidence += submission.items.length
        firstFailure ??= `Lô ${batchIndex + 1}: không có bằng chứng web search nên bỏ ${submission.items.length} tin AI tự khai`
        appendAiLog(
          'news',
          'warn',
          `Lô ${batchIndex + 1}: không có bằng chứng web search, bỏ ${submission.items.length} tin`
        )
        continue
      }

      // F.3: sourceUrl do model tự nghĩ (không nằm trong tập URL đã thấy) bị bỏ.
      const seen = submission.items.filter((item) => isSeenSource(evidence, item.sourceUrl))
      const unseen = submission.items.length - seen.length
      rejected += unseen
      rejectReasons.urlNotSeen += unseen

      const projectNames = new Map(batch.map((project) => [project.id, project.name]))
      const verified = await verifyNewsSources(seen, projectNames)
      rejected += verified.rejected
      addRejectReasons(rejectReasons, verified.reasons)

      const outcome = saveNewsBatch(verified.items, windowNow.toISOString(), (iso) =>
        isWithinNewsWindow(iso, windowNow, NEWS_WINDOW_DAYS), allowedIds)
      added += outcome.added
      rejected += outcome.rejected
      const duplicates = outcome.duplicates ?? 0
      rejectReasons.duplicate += duplicates
      rejectReasons.outsideWindow += Math.max(0, outcome.rejected - duplicates)

      if (!traceUsed && evidence.searchSuccesses === 0) {
        searchUnverifiedBatches += 1
      }

      // Chỉ lô chạy thật và đã lưu mới được cache; lô không có tin mới chỉ khóa
      // 2 giờ (newsCacheTtlForOutcome), lô nộp mà bị loại hết thì không cache.
      const cacheOutcome = decideNewsCacheOutcome(outcome.added, rejected - rejectedAtBatchStart)
      if (cacheOutcome !== null) {
        markNewsChecked(
          batch.map((project) => ({ projectId: project.id, fingerprint: fingerprints.get(project.id) ?? '' })),
          new Date().toISOString(),
          cacheOutcome
        )
      }
      checkedProjects += batch.length
      appendAiLog(
        'news',
        'success',
        `Lô ${batchIndex + 1}: nhận ${outcome.added} tin mới, bỏ ${outcome.rejected} tin`
      )
    }

    if (!signal.aborted) {
      setLastNewsCheckedAt(new Date().toISOString())
    }

    logInfo(
      `Check News: ${checkedProjects}/${scope.length} dự án, ${cachedCount} từ cache, ${usageTotal.calls} lượt gọi model, ` +
        `input=${usageTotal.inputTokens} output=${usageTotal.outputTokens} token, tìm kiếm=${budget.used()}/${budget.max}`
    )

    reporter.report('Tổng hợp', ordered.length, ordered.length, `Đã thêm ${added} tin`)
    broadcastToRenderers(EVENTS.dataChanged, { entity: 'news' })

    const extras: string[] = []
    if (cachedCount > 0) {
      extras.push(`${cachedCount} dự án dùng cache (đã kiểm tra < ${formatNewsCacheTtl(newsCacheTtlMs)}, link không đổi)`)
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
          firstFailure,
          reasons: rejectReasons
        })

    const message = extras.length > 0 ? `${base} · ${extras.join(' · ')}` : base
    const rejectLine = buildNewsRejectLogLine(rejectReasons)
    if (rejectLine) {
      appendAiLog('news', 'warn', rejectLine)
    }
    appendAiLog('news', signal.aborted ? 'warn' : 'success', message)

    return {
      added,
      rejected,
      message
    }
  })
}
