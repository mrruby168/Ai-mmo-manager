import type { AiMessage, ModelClient } from './types'
import { AiError } from './types'
import type { AiLogLevel, Project, ScanItem, ScanLatest } from '@shared/types'
import { scanResultSchema } from '@shared/schemas'
import type { ProjectImportItem } from '@shared/schemas'
import { normalizeDomainKey, normalizeNameKey } from '@shared/normalize'
import { saveScanLatest, getScanLatest } from '../db/scanRepo'
import { findProjectByDomainKey, findProjectByNameKey, listProjects } from '../db/projectsRepo'
import { addProjects, getProject, setProjectLogo } from '../services/projectService'
import { fetchLogoForProject } from '../services/logoService'
import { logError } from '../services/logger'
import { buildTaskChain } from './providerService'
import type { TaskChain } from './providerService'
import { createFailoverClient } from './failoverClient'
import {
  SCAN_EXTRACT_MAX_CHARS,
  SCAN_EXTRACT_SYSTEM_PROMPT,
  SCAN_MAX_PROJECTS,
  capProjects,
  classifyScanText,
  handleKey,
  parseExtractionOutput,
  parseNameList
} from '@shared/scanText'
import { getScanTools, SCAN_RESULT_KIND } from './tools'
import { appendAiLog } from './aiActivityLog'
import { AgentStepLimitError, runAgent } from './agentRunner'
import type { AgentResult, AgentUsage } from './agentRunner'
import { runAiTask } from './aiTaskRunner'
import { SCAN_SYSTEM_PROMPT } from './prompts'
import { assertAiEnabled } from './aiMode'
import { COST_LIMITS, chunk, isCacheFresh } from '@shared/costControl'
import { getScanCacheEntries, putScanCacheEntries } from '../db/aiCacheRepo'
import { scanCacheKey } from './cacheKeys'
import { createSearchBudget } from './searchBudget'
import { logInfo } from '../services/logger'

const MAX_CANDIDATES = SCAN_MAX_PROJECTS
const BATCH_SIZE = 5

export interface ScanInput {
  text: string
  fileName?: string
}

export interface ScanResult {
  items: ScanItem[]
  rejected: number
  message: string
}

interface CandidateSeed {
  website?: string | null
  category?: 'event_mmo' | 'airdrop'
  taskSummary?: string
  howToJoin?: string
  startDate?: string
  endDate?: string
  costType?: 'free' | 'paid' | 'unverified'
  costAmountUsd?: number
}

interface Candidate {
  name: string
  website: string | null
  domainKey: string | null
  xHandle: string | null
  seed: CandidateSeed
  duplicateOf: string | null
}

function dedupeCandidates(candidates: Candidate[]): { kept: Candidate[]; rejected: number } {
  const seen = new Set<string>()
  const kept: Candidate[] = []
  let rejected = 0
  for (const candidate of candidates) {
    const key = normalizeNameKey(candidate.name)
    if (!key || seen.has(key)) {
      rejected += 1
      continue
    }
    seen.add(key)
    kept.push(candidate)
  }
  return { kept, rejected }
}

function markDuplicates(candidates: Candidate[]): void {
  // Một lần đọc toàn bộ app để so khớp theo tên, website và tài khoản X.
  const existingProjects = listProjects()
  const byHandle = new Map<string, string>()
  for (const project of existingProjects) {
    const key = handleKey(project.socials.x ?? null)
    if (key && !byHandle.has(key)) {
      byHandle.set(key, project.id)
    }
  }
  for (const candidate of candidates) {
    if (candidate.duplicateOf) {
      continue
    }
    const nameKey = normalizeNameKey(candidate.name)
    const existing = findProjectByNameKey('event_mmo', nameKey) ?? findProjectByNameKey('airdrop', nameKey)
    if (existing) {
      candidate.duplicateOf = existing.id
      continue
    }
    const domainKey = candidate.domainKey ?? normalizeDomainKey(candidate.website)
    if (domainKey) {
      const byDomain = findProjectByDomainKey(domainKey)
      if (byDomain) {
        candidate.duplicateOf = byDomain.id
        continue
      }
    }
    const xKey = candidate.xHandle ? handleKey(candidate.xHandle) : null
    const byX = xKey ? byHandle.get(xKey) : undefined
    if (byX) {
      candidate.duplicateOf = byX
    }
  }
}

function plainCandidate(name: string, website: string | null = null, xHandle: string | null = null): Candidate {
  return { name, website, domainKey: normalizeDomainKey(website), xHandle, seed: {}, duplicateOf: null }
}

interface Extraction {
  candidates: Candidate[]
  /** Số dự án trùng tên trong chính bài viết (đã gộp). */
  rejected: number
  kind: 'json' | 'list' | 'article'
  truncated: boolean
}

function parseJsonCandidates(trimmed: string): { candidates: Candidate[]; rejected: number } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  const array = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { projects?: unknown }).projects)
      ? ((parsed as { projects: unknown[] }).projects as unknown[])
      : null
  if (!array) {
    return null
  }
  const candidates: Candidate[] = []
  let rejected = 0
  for (const entry of array) {
    if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
      const item = entry as Record<string, unknown>
      const name = String(item.name).trim()
      const website = typeof item.website === 'string' ? item.website.trim() : null
      if (name.length > 0) {
        candidates.push({
          name,
          website,
          domainKey: normalizeDomainKey(website),
          xHandle: typeof item.xHandle === 'string' ? item.xHandle : typeof item.x === 'string' ? item.x : null,
          seed: {
            website,
            category: item.category === 'event_mmo' || item.category === 'airdrop' ? item.category : undefined,
            taskSummary: typeof item.taskSummary === 'string' ? item.taskSummary : undefined,
            howToJoin: typeof item.howToJoin === 'string' ? item.howToJoin : undefined,
            startDate: typeof item.startDate === 'string' ? item.startDate : undefined,
            endDate: typeof item.endDate === 'string' ? item.endDate : undefined,
            costType: item.costType === 'free' || item.costType === 'paid' || item.costType === 'unverified' ? item.costType : undefined,
            costAmountUsd: typeof item.costAmountUsd === 'number' ? item.costAmountUsd : undefined
          },
          duplicateOf: null
        })
        continue
      }
    }
    rejected += 1
  }
  return { candidates, rejected }
}

/**
 * Đọc nội dung dán vào và trả về MỌI dự án phát hiện được (chưa giới hạn số lượng).
 * - JSON: đọc trực tiếp.
 * - Danh sách tên ngắn (mỗi dòng một dự án): đọc trực tiếp.
 * - Bài viết/đoạn văn: nhờ AI (không tool, không web) trích xuất tên dự án.
 */
async function extractCandidates(text: string, client: ModelClient, signal: AbortSignal): Promise<Extraction> {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { candidates: [], rejected: 0, kind: 'list', truncated: false }
  }
  const kind = classifyScanText(trimmed)

  if (kind === 'json') {
    const fromJson = parseJsonCandidates(trimmed)
    if (fromJson) {
      const { kept, rejected } = dedupeCandidates(fromJson.candidates)
      return { candidates: kept, rejected: fromJson.rejected + rejected, kind, truncated: false }
    }
  }

  if (kind === 'list') {
    const { kept, rejected } = dedupeCandidates(parseNameList(trimmed).map((name) => plainCandidate(name)))
    return { candidates: kept, rejected, kind, truncated: false }
  }

  const truncated = trimmed.length > SCAN_EXTRACT_MAX_CHARS
  const response = await client.complete({
    system: SCAN_EXTRACT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Bài viết:\n"""\n${trimmed.slice(0, SCAN_EXTRACT_MAX_CHARS)}\n"""` }],
    tools: [],
    enableWebSearch: false,
    signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    maxTokens: 2048
  })
  const { kept, rejected } = dedupeCandidates(
    parseExtractionOutput(response.text).map((entry) => plainCandidate(entry.name, entry.website, entry.xHandle))
  )
  return { candidates: kept, rejected, kind: 'article', truncated }
}

function candidatePayload(candidate: Candidate): Record<string, unknown> {
  const payload: Record<string, unknown> = { name: candidate.name }
  if (candidate.website) {
    payload.website = candidate.website
  }
  const seed = Object.fromEntries(
    Object.entries(candidate.seed).filter(([key, value]) => key !== 'website' && value !== undefined && value !== null && value !== '')
  )
  if (Object.keys(seed).length > 0) {
    payload.seed = seed
  }
  return payload
}

/**
 * FIX 2: chuỗi A1–A3 cho Scan. Scan cần tool calling và Web Search gốc của model.
 * Không còn model hợp lệ thì báo về Settings → Model Configuration.
 */
function requireSelection(): TaskChain {
  const chain = buildTaskChain('scan', { requireTools: true, webSearch: 'native' })
  if (chain.candidates.length === 0) {
    const blocked = chain.skipped[0]
    if (blocked?.reason === 'tools') {
      throw new AiError(
        'unsupported',
        'Model đã chọn không hỗ trợ tool calling, không thể Scan. Vào Settings → Model Configuration để chọn model khác cho Scan.'
      )
    }
    if (blocked?.reason === 'web_search') {
      throw new AiError(
        'unsupported',
        `Model "${blocked.label}" không hỗ trợ Web Search, không thể Scan. Vào Settings → Model Configuration để chọn model khác cho Scan.`
      )
    }
    throw new AiError('unsupported', 'Chưa chọn Model cho Scan. Vào Settings → Model Configuration để chọn model A1 cho Scan.')
  }
  return chain
}

/** Client có failover A1→A2→A3; mỗi lần đổi model ghi một dòng log để xem lại sau. */
function createScanClient(chain: TaskChain) {
  return createFailoverClient(chain.candidates, {
    onOnline: (candidate) => appendAiLog('scan', 'online', `${candidate.label} đang online`),
    onSwap: (from, to, error) => {
      logInfo(`Scan Project đổi model ${from.label} → ${to.label}: ${error.message}`)
      appendAiLog('scan', 'warn', `${from.label} lỗi (${error.message}) → chuyển sang ${to.label}`)
    }
  })
}

function insufficientItem(candidate: Candidate, summary: string): ScanItem {
  return {
    name: candidate.name,
    category: 'insufficient',
    website: candidate.website,
    summary,
    taskSummary: '',
    howToJoin: '',
    startDate: null,
    endDate: null,
    costType: 'unverified',
    costAmountUsd: null,
    riskLevel: 'unknown',
    riskReason: null,
    potential: null,
    verification: 'unverified',
    sources: [],
    duplicateOf: null
  }
}

function listNames(names: readonly string[], max = 6): string {
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')}… (+${names.length - max})`
}

export async function runScan(input: ScanInput): Promise<ScanResult> {
  assertAiEnabled()
  return runAiTask('Scan Project', 'scan', async (signal, reporter) => {
    reporter.report('Đọc dữ liệu', 0, 1, 'Đang đọc nội dung...')
    appendAiLog('scan', 'step', input.fileName ? `Đang đọc tệp ${input.fileName}` : 'Đang đọc nội dung đã dán')
    const client = createScanClient(requireSelection())

    const extraction = await extractCandidates(input.text, client, signal)
    const rejected = extraction.rejected
    if (extraction.truncated) {
      appendAiLog('scan', 'warn', `Bài viết dài, chỉ đọc ${SCAN_EXTRACT_MAX_CHARS.toLocaleString('vi-VN')} ký tự đầu`)
    }

    const found = extraction.candidates
    if (found.length === 0) {
      appendAiLog('scan', 'warn', 'Không tìm thấy dự án nào trong nội dung')
      reporter.report('Tổng hợp', 1, 1, 'Không tìm thấy dự án nào')
      return { items: [], rejected, message: 'Không tìm thấy dự án nào trong nội dung đã dán' }
    }

    // Bước 1: đếm dự án, bỏ dự án đã có trong app (không tra cứu lại).
    markDuplicates(found)
    const duplicates = found.filter((candidate) => candidate.duplicateOf)
    const fresh = found.filter((candidate) => !candidate.duplicateOf)
    appendAiLog('scan', 'success', `Phát hiện ${found.length} dự án trong nội dung`)
    if (duplicates.length > 0) {
      appendAiLog('scan', 'step', `${duplicates.length} dự án đã có trong app, bỏ qua: ${listNames(duplicates.map((c) => c.name))}`)
    }
    if (fresh.length === 0) {
      appendAiLog('scan', 'success', 'Không có dự án mới cần quét')
      reporter.report('Tổng hợp', 1, 1, 'Tất cả dự án đã có trong app')
      return { items: [], rejected, message: `Cả ${found.length} dự án đã có trong app, không cần quét` }
    }

    const { kept: toScan, dropped } = capProjects(fresh, MAX_CANDIDATES)
    if (dropped > 0) {
      appendAiLog('scan', 'warn', `Chỉ quét ${toScan.length} dự án đầu tiên, bỏ ${dropped} dự án (giới hạn mỗi lần quét)`)
    }
    const total = toScan.length
    const numberOf = new Map<Candidate, number>(toScan.map((candidate, index) => [candidate, index + 1]))
    appendAiLog('scan', 'step', `Bắt đầu quét ${total} dự án`)
    reporter.report('Quét dự án', 0, total, `Bắt đầu quét ${total} dự án`)

    const items: ScanItem[] = []
    let doneCount = 0
    const markDone = (candidate: Candidate, note = ''): void => {
      doneCount += 1
      appendAiLog('scan', 'step', `Dự án ${numberOf.get(candidate)}/${total}: ${candidate.name}${note}`)
      reporter.report('Quét dự án', doneCount, total, `Đã quét ${doneCount}/${total}`)
    }

    // Cost control: dự án đã quét trong TTL (cùng tên + domain) dùng lại từ cache; lỗi không bao giờ được cache.
    const nowMs = Date.now()
    const cacheEntries = getScanCacheEntries(toScan.map((candidate) => scanCacheKey(candidate.name, candidate.website)))
    const toResearch: Candidate[] = []
    let reusedCount = 0
    for (const candidate of toScan) {
      const entry = cacheEntries.get(scanCacheKey(candidate.name, candidate.website))
      if (entry && entry.item.category !== 'insufficient' && isCacheFresh(entry.createdAt, nowMs, COST_LIMITS.scanCacheTtlMs)) {
        items.push({ ...entry.item, name: candidate.name, duplicateOf: null })
        reusedCount += 1
        markDone(candidate, ' (dùng lại kết quả vừa quét)')
      } else {
        toResearch.push(candidate)
      }
    }

    const batches = chunk(toResearch, BATCH_SIZE)
    const budget = createSearchBudget(COST_LIMITS.scanMaxSearchesPerRun)
    const usageTotal = { inputTokens: 0, outputTokens: 0, calls: 0 }
    const onUsage = (usage: AgentUsage): void => {
      usageTotal.inputTokens += usage.inputTokens
      usageTotal.outputTokens += usage.outputTokens
      usageTotal.calls += 1
      budget.record(usage.searches)
    }
    let skippedByBudget = 0

    // Log chi tiết của từng tool (mỗi lượt tìm web, mở bài…) làm log rối: chỉ giữ cảnh báo và lỗi.
    const toolLog = (level: AiLogLevel, text: string): void => {
      if (level === 'warn' || level === 'error') {
        appendAiLog('scan', level, text)
      }
    }

    const runBatchAgent = async (messages: AiMessage[]): Promise<AgentResult | null> => {
      try {
        return await runAgent({
          client,
          system: SCAN_SYSTEM_PROMPT,
          messages,
          tools: getScanTools({ costControl: {}, onLog: toolLog }),
          enableWebSearch: true,
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
        if (error instanceof AgentStepLimitError && !signal.aborted) {
          return null
        }
        throw error
      }
    }

    for (const batch of batches) {
      if (signal.aborted) {
        break
      }

      if (budget.exhausted()) {
        // Hard search cap reached: keep the rest as "insufficient" so nothing is silently lost.
        skippedByBudget += batch.length
        for (const candidate of batch) {
          items.push(insufficientItem(candidate, `Chưa tra cứu: đạt giới hạn ${budget.max} lượt tìm kiếm mỗi phiên, hãy Scan lại phần này`))
          markDone(candidate, ' (chưa tra cứu, hết lượt tìm kiếm)')
        }
        continue
      }
      appendAiLog('scan', 'step', `Đang tra cứu: ${batch.map((candidate) => candidate.name).join(', ')}`)

      const messages: AiMessage[] = [
        {
          role: 'user',
          content:
            `Dự án cần tra cứu (JSON): ${JSON.stringify(batch.map(candidatePayload))}\n` +
            'Gộp tìm kiếm tối đa 3 dự án mỗi truy vấn bằng (A OR B OR C) kèm từ khóa; chỉ tìm riêng khi kết quả gộp thiếu dự án nào. ' +
            'Nộp qua submit_scan_result với đúng các dự án trong danh sách, không bịa thông tin không chắc chắn.'
        }
      ]

      try {
        const result = await runBatchAgent(messages)
        const batchItems: ScanItem[] = []

        if (result && result.outcome === 'submit') {
          const payload = result.payload as { kind?: string; data?: unknown }
          if (payload.kind === SCAN_RESULT_KIND) {
            const parsed = scanResultSchema.safeParse(payload.data)
            if (parsed.success) {
              for (const rawItem of parsed.data.items) {
                batchItems.push({
                  ...rawItem,
                  website: rawItem.website ?? null,
                  startDate: rawItem.startDate ?? null,
                  endDate: rawItem.endDate ?? null,
                  riskReason: rawItem.riskReason ?? null,
                  potential: rawItem.potential ?? null,
                  costAmountUsd: rawItem.costAmountUsd ?? null,
                  duplicateOf: null
                })
              }
              const stamp = new Date().toISOString()
              putScanCacheEntries(
                batchItems.flatMap((stored) => {
                  const source = batch.find((candidate) => normalizeNameKey(candidate.name) === normalizeNameKey(stored.name))
                  return source && stored.category !== 'insufficient'
                    ? [{ key: scanCacheKey(source.name, source.website), item: stored }]
                    : []
                }),
                stamp
              )
            }
          }
        }

        // Dự án nào AI không trả về → "không đủ bằng chứng" (không bỏ sót im lặng).
        for (const candidate of batch) {
          const key = normalizeNameKey(candidate.name)
          const matched = batchItems.find((item) => normalizeNameKey(item.name) === key)
          if (matched) {
            items.push(matched)
            markDone(candidate)
          } else {
            items.push(insufficientItem(candidate, 'AI không trả về kết quả hợp lệ cho dự án này'))
            markDone(candidate, ' (không có kết quả hợp lệ)')
          }
        }
        saveScanLatest(items, new Date().toISOString())
      } catch (error) {
        if (signal.aborted) {
          saveScanLatest(items, new Date().toISOString())
          reporter.report('Đã hủy', total, total, `Đã hủy, giữ kết quả ${items.length} dự án`)
          return {
            items,
            rejected,
            message: `Đã hủy, giữ kết quả ${items.length} dự án đã quét`
          }
        }
        throw error
      }
    }

    saveScanLatest(items, new Date().toISOString())
    logInfo(
      `Scan: ${found.length} phát hiện, ${duplicates.length} trùng app, ${reusedCount} từ cache, ` +
        `${toResearch.length - skippedByBudget} tra cứu, ${usageTotal.calls} lượt gọi model, ` +
        `input=${usageTotal.inputTokens} output=${usageTotal.outputTokens} token, tìm kiếm=${budget.used()}/${budget.max}`
    )
    reporter.report('Tổng hợp', total, total, `Hoàn tất ${items.length} dự án`)
    appendAiLog('scan', 'success', `Đã quét xong ${total} dự án`)

    // Bước 2: đánh giá ngắn gọn từng dự án (1 dòng, lấy từ `summary` của AI).
    items.forEach((item, index) => {
      const note = item.summary.trim() || 'Chưa đủ thông tin để đánh giá'
      appendAiLog('scan', item.category === 'insufficient' ? 'warn' : 'step', `Dự án ${index + 1}: ${item.name} — ${note}`)
    })
    const usable = items.filter((item) => item.category !== 'insufficient').length
    if (usable > 0) {
      appendAiLog('scan', 'step', 'Chọn dự án muốn thêm trong bảng bên dưới rồi bấm OK')
    }

    const notes: string[] = []
    if (duplicates.length > 0) {
      notes.push(`${duplicates.length} dự án đã có trong app, bỏ qua`)
    }
    if (reusedCount > 0) {
      notes.push(`${reusedCount} dùng lại kết quả vừa quét`)
    }
    if (skippedByBudget > 0) {
      notes.push(`${skippedByBudget} chưa tra cứu do đạt giới hạn ${budget.max} lượt tìm kiếm, hãy Scan lại`)
    }
    return {
      items,
      rejected,
      message: `Phát hiện ${found.length} dự án, quét ${total}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`
    }
  })
}

export function getScanLatestResult(): ScanLatest | null {
  return getScanLatest()
}

export interface ScanSubmitOutcome {
  results: Array<{
    name: string
    project: Project | null
    duplicateOf: string | null
    error: string | null
  }>
  addedCount: number
  duplicateCount: number
  failedCount: number
}

async function fetchAndSaveLogos(projectIds: string[]): Promise<void> {
  for (const id of projectIds) {
    try {
      const project = getProject(id)
      if (!project) {
        continue
      }
      const logo = await fetchLogoForProject({
        projectId: project.id,
        website: project.website,
        socialsX: project.socials.x ?? null,
        socialsDiscord: project.socials.discord ?? null,
        socialsTelegram: project.socials.telegram ?? null
      })
      if (logo) {
        setProjectLogo(project.id, logo)
      }
    } catch (error) {
      logError(`Không lấy được logo cho dự án ${id}`, error)
    }
  }
}

export async function submitScanSelection(names: string[]): Promise<ScanSubmitOutcome> {
  const latest = getScanLatest()
  const wanted = new Set(names.map((name) => normalizeNameKey(name)).filter(Boolean))

  const results: ScanSubmitOutcome['results'] = []
  const toAdd: Array<{ item: ScanItem; name: string }> = []

  if (latest) {
    for (const item of latest.items) {
      if (!wanted.has(normalizeNameKey(item.name))) {
        continue
      }
      if (item.category === 'insufficient') {
        results.push({ name: item.name, project: null, duplicateOf: null, error: 'Không đủ bằng chứng, không thêm được' })
        continue
      }
      if (item.duplicateOf) {
        results.push({ name: item.name, project: null, duplicateOf: item.duplicateOf, error: null })
        continue
      }
      toAdd.push({ item, name: item.name })
    }
  }

  for (const name of names) {
    if (!results.some((entry) => entry.name === name) && !toAdd.some((entry) => entry.name === name)) {
      results.push({ name, project: null, duplicateOf: null, error: 'Không tìm thấy trong kết quả scan gần nhất' })
    }
  }

  const itemsToAdd = toAdd.map((entry): ProjectImportItem => ({
    category: entry.item.category as 'event_mmo' | 'airdrop',
    name: entry.item.name,
    website: entry.item.website ?? undefined,
    taskSummary: entry.item.taskSummary || undefined,
    howToJoin: entry.item.howToJoin || undefined,
    startDate: entry.item.startDate ?? undefined,
    endDate: entry.item.endDate ?? undefined,
    costType: entry.item.costType,
    costAmountUsd: entry.item.costType === 'paid' ? entry.item.costAmountUsd ?? undefined : undefined,
    status: 'not_joined',
    verification: entry.item.verification,
    sources: entry.item.sources,
    notes: [entry.item.summary, entry.item.riskLevel !== 'unknown' ? `Rủi ro: ${entry.item.riskLevel}${entry.item.riskReason ? ` — ${entry.item.riskReason}` : ''}` : '', entry.item.potential ? `Tiềm năng: ${entry.item.potential}` : '']
      .filter(Boolean)
      .join('\n')
  }))

  const addResults = itemsToAdd.length > 0 ? addProjects(itemsToAdd, 'scan') : []
  const addedIds: string[] = []

  toAdd.forEach((entry, index) => {
    const added = addResults[index]
    if (!added) {
      results.push({ name: entry.name, project: null, duplicateOf: null, error: 'Không thêm được' })
      return
    }
    if (added.project) {
      addedIds.push(added.project.id)
      results.push({ name: entry.name, project: added.project, duplicateOf: null, error: null })
      return
    }
    results.push({
      name: entry.name,
      project: null,
      duplicateOf: added.duplicateOf,
      error: added.duplicateOf ? null : added.error
    })
  })

  await fetchAndSaveLogos(addedIds)

  return {
    results,
    addedCount: results.filter((result) => result.project !== null).length,
    duplicateCount: results.filter((result) => result.duplicateOf !== null && result.project === null).length,
    failedCount: results.filter((result) => result.error !== null).length
  }
}
