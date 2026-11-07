import type { AiMessage } from './types'
import { AiError } from './types'
import { newsResultSchema } from '@shared/schemas'
import type { MilestoneKind, VerificationState } from '@shared/constants'
import type { Project } from '@shared/types'
import { listProjects } from '../db/projectsRepo'
import { listNews, setLastNewsCheckedAt } from '../db/newsRepo'
import { saveNewsBatch } from '../services/newsService'
import { createModelClient } from './providers'
import { getModelConnection, getSelectedModelMeta } from './providerService'
import { getNewsTools, NEWS_RESULT_KIND } from './tools'
import type { AgentTool } from './agentRunner'
import { runAgent } from './agentRunner'
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

// Anthropic's built-in web search allows only 5 uses per request, so 5 projects
// per batch leaves no room for retries. Three projects per batch is safer.
const BATCH_SIZE = 3
const NEWS_WINDOW_DAYS = 7
const TASK_SUMMARY_MAX = 300

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
  const meta = getSelectedModelMeta()
  if (!meta) {
    throw new AiError('unsupported', 'Chưa chọn Model, hãy chọn ở Chat Box trước khi Check News')
  }
  if (!meta.supportsTools) {
    throw new AiError(
      'unsupported',
      `Model "${meta.modelLabel}" không hỗ trợ tool calling nên không thể Check News. Hãy chọn Model khác ở Chat Box`
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
      `Model "${meta.modelLabel}" không có Web Search và app chưa cấu hình Web Search. Có hai cách xử lý: (1) chọn Model có Web Search ở Chat Box, hoặc (2) vào Settings → Web Search để thêm API key Tavily/Brave hay URL SearXNG.`
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
  const known: KnownMilestone[] = []
  if (project.endDate) {
    known.push({ kind: 'end', date: project.endDate, verification: project.verification })
  }
  for (const milestone of milestones.get(project.id) ?? []) {
    if (!known.some((entry) => entry.kind === milestone.kind && entry.date === milestone.date)) {
      known.push(milestone)
    }
  }

  return {
    id: project.id,
    name: project.name,
    category: project.category,
    status: project.status,
    website: project.website ?? 'không có',
    socials: project.socials,
    startDate: project.startDate,
    endDate: project.endDate,
    taskSummary: project.taskSummary.slice(0, TASK_SUMMARY_MAX),
    sources: project.sources.slice(0, 3),
    knownMilestones: known
  }
}

function buildBatchMessage(batch: Project[], milestones: Map<string, KnownMilestone[]>, now: Date): string {
  const today = promptDateOnly(now)
  const windowStart = promptDateOnly(new Date(now.getTime() - (NEWS_WINDOW_DAYS - 1) * 86_400_000))
  const batchJson = JSON.stringify(batch.map((project) => projectPayload(project, milestones)), null, 2)
  return [
    `Hôm nay: ${today} (UTC+7). Cửa sổ tin hợp lệ: 7 ngày gần nhất, từ ${windowStart} đến hết hôm nay.`,
    'Danh sách dự án cần kiểm tra (JSON):',
    batchJson,
    '',
    'Dùng web_search (nếu có) và/hoặc web_fetch trang chính thức để xác minh tin và ngày đăng. Chỉ nộp tin có publishedAt nằm trong cửa sổ trên.',
    'Mỗi dự án tối đa MỘT tin kind="important" (tin quan trọng nhất); kind="todo" thì tùy số việc cần làm.',
    'Điền milestoneKind + milestoneDate khi bài nêu ngày (End, Snapshot, Claim, Whitelist, TGE, Listing); không bịa ngày.',
    'Nộp kết quả qua submit_news. Không tìm thấy tin mới thì submit_news với items rỗng.'
  ].join('\n')
}

function pickTools(selection: CheckSelection, batchEvidence: ReturnType<typeof createNewsEvidence>): AgentTool[] {
  return getNewsTools({ search: selection.search, evidence: batchEvidence })
}

export async function runCheckNews(): Promise<NewsCheckResult> {
  assertAiEnabled()
  const selection = requireSelection()

  const all = listProjects()
  if (all.length === 0) {
    return { added: 0, rejected: 0, message: 'Chưa có dự án nào để kiểm tra tin' }
  }

  // D4: quét mọi dự án; dự án đã hoàn thành xếp cuối để Claim/Whitelist/Listing
  // vẫn được kiểm tra mà không chiếm chỗ các dự án đang chạy.
  const scope = [
    ...all.filter((project) => project.status !== 'completed'),
    ...all.filter((project) => project.status === 'completed')
  ]

  const client = createModelClient(selection.connection)
  const milestones = buildKnownMilestones()

  const batches: Project[][] = []
  for (let index = 0; index < scope.length; index += BATCH_SIZE) {
    batches.push(scope.slice(index, index + BATCH_SIZE))
  }

  let added = 0
  let rejected = 0

  return runAiTask('Check News', 'news', async (signal, reporter) => {
    const total = batches.length
    let failedBatches = 0
    let noEvidenceBatches = 0
    let searchUnverifiedBatches = 0
    let firstFailure: string | null = null

    for (let batchIndex = 0; batchIndex < total; batchIndex += 1) {
      if (signal.aborted) {
        break
      }
      const batch = batches[batchIndex]
      reporter.report('Kiểm tra tin', batchIndex / total, 1, `Lô ${batchIndex + 1}/${total} (${batch.length} dự án)`)

      const evidence = createNewsEvidence()
      const tools = pickTools(selection, evidence)
      const now = new Date()
      const messages: AiMessage[] = [{ role: 'user', content: buildBatchMessage(batch, milestones, now) }]

      let result = await runAgent({
        client,
        system: NEWS_SYSTEM_PROMPT,
        messages,
        tools,
        enableWebSearch: selection.nativeSearch,
        maxTokens: 4096,
        signal
      })
      // Search traces from the first attempt still count as evidence when the
      // reminder succeeds.
      const traces = [...result.webSearch]

      // One reminder when the model answered with prose instead of calling
      // submit_news. A second miss counts as a failed batch.
      if (!signal.aborted && result.outcome !== 'submit' && result.outcome === 'completed') {
        result = await runAgent({
          client,
          system: NEWS_SYSTEM_PROMPT,
          messages: [
            ...result.messages,
            { role: 'user', content: 'Bạn chưa nộp kết quả. Hãy gọi submit_news ngay với items (rỗng nếu không có tin mới).' }
          ],
          tools,
          enableWebSearch: selection.nativeSearch,
          maxTokens: 4096,
          signal
        })
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
    }

    if (!signal.aborted) {
      setLastNewsCheckedAt(new Date().toISOString())
    }

    reporter.report('Tổng hợp', 1, 1, `Đã thêm ${added} tin`)
    broadcastToRenderers(EVENTS.dataChanged, { entity: 'news' })

    return {
      added,
      rejected,
      message: signal.aborted
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
    }
  })
}
