import type { AiMessage } from './types'
import { AiError } from './types'
import type { Project, ScanItem, ScanLatest } from '@shared/types'
import { scanResultSchema } from '@shared/schemas'
import type { ProjectImportItem } from '@shared/schemas'
import { normalizeDomainKey, normalizeNameKey } from '@shared/normalize'
import { saveScanLatest, getScanLatest } from '../db/scanRepo'
import { findProjectByDomainKey, findProjectByNameKey } from '../db/projectsRepo'
import { addProjects, getProject, setProjectLogo } from '../services/projectService'
import { fetchLogoForProject } from '../services/logoService'
import { logError } from '../services/logger'
import { createModelClient } from './providers'
import { getModelConnection, getTaskModelMeta } from './providerService'
import { getScanTools, SCAN_RESULT_KIND } from './tools'
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

const MAX_CANDIDATES = 20
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
  seed: CandidateSeed
  duplicateOf: string | null
}

function splitTextLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
    .filter((line) => line.length >= 3 && line.length <= 160 && !/^\{|^\[/.test(line))
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
  for (const candidate of candidates) {
    if (candidate.duplicateOf) {
      continue
    }
    const byNameMmo = findProjectByNameKey('event_mmo', normalizeNameKey(candidate.name))
    const byNameAirdrop = findProjectByNameKey('airdrop', normalizeNameKey(candidate.name))
    const existing = byNameMmo ?? byNameAirdrop
    if (existing) {
      candidate.duplicateOf = existing.id
      continue
    }
    const domainKey = candidate.domainKey ?? normalizeDomainKey(candidate.website)
    if (domainKey) {
      const byDomain = findProjectByDomainKey(domainKey)
      if (byDomain) {
        candidate.duplicateOf = byDomain.id
      }
    }
  }
}

async function extractCandidates(text: string): Promise<{ candidates: Candidate[]; rejected: number }> {
  let rejected = 0
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { candidates: [], rejected: 0 }
  }

  let jsonCandidates: Candidate[] | null = null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    const array = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { projects?: unknown }).projects)
        ? ((parsed as { projects: unknown[] }).projects as unknown[])
        : null
    if (array) {
      jsonCandidates = []
      for (const entry of array) {
        if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
          const item = entry as Record<string, unknown>
          const name = String(item.name).trim()
          const website = typeof item.website === 'string' ? item.website.trim() : null
          if (name.length > 0) {
            jsonCandidates.push({
              name,
              website,
              domainKey: normalizeDomainKey(website),
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
    }
  } catch {
    jsonCandidates = null
  }

  if (jsonCandidates) {
    const { kept, rejected: deduped } = dedupeCandidates(jsonCandidates)
    return { candidates: kept.slice(0, MAX_CANDIDATES), rejected: rejected + deduped }
  }

  const lines = splitTextLines(trimmed)
  const { kept, rejected: deduped } = dedupeCandidates(
    lines.map((name) => ({
      name,
      website: null,
      domainKey: null,
      seed: {},
      duplicateOf: null
    }))
  )

  if (kept.length > MAX_CANDIDATES) {
    rejected += kept.length - MAX_CANDIDATES
    return { candidates: kept.slice(0, MAX_CANDIDATES), rejected }
  }

  if (kept.length > 0) {
    return { candidates: kept, rejected: rejected + deduped }
  }

  const connection = requireSelection()
  const client = createModelClient(connection)
  const response = await client.complete({
    system:
      'Bạn là trợ lý trích xuất. Trong nội dung dưới đây, liệt kê tên các dự án Event MMO/Airdrop mà người dùng đề cập. ' +
      'Chỉ trả lại danh sách tên, mỗi tên một dòng, không đánh số, không giải thích, không bịa. Tối đa 20 tên.',
    messages: [{ role: 'user', content: trimmed.slice(0, 20_000) }],
    tools: [],
    enableWebSearch: false,
    signal: AbortSignal.timeout(45_000),
    maxTokens: 1024
  })

  const extractionLines = splitTextLines(response.text)
  const candidates = dedupeCandidates(
    extractionLines.map((name) => ({ name, website: null, domainKey: null, seed: {}, duplicateOf: null }))
  ).kept.slice(0, MAX_CANDIDATES)
  return { candidates, rejected: rejected + deduped }
}

/** Row for a candidate that already exists in the app: no web research is paid for it. */
function duplicateItem(candidate: Candidate): ScanItem {
  const existing = candidate.duplicateOf ? getProject(candidate.duplicateOf) : null
  return {
    name: candidate.name,
    category: existing?.category ?? 'insufficient',
    website: existing?.website ?? candidate.website,
    summary: 'Đã có trong app, bỏ qua tra cứu web để tiết kiệm chi phí',
    taskSummary: existing?.taskSummary ?? '',
    howToJoin: existing?.howToJoin ?? '',
    startDate: existing?.startDate ?? null,
    endDate: existing?.endDate ?? null,
    costType: existing?.costType ?? 'unverified',
    costAmountUsd: existing?.costAmountUsd ?? null,
    riskLevel: 'unknown',
    riskReason: null,
    potential: null,
    verification: existing?.verification ?? 'unverified',
    sources: existing?.sources ?? [],
    duplicateOf: candidate.duplicateOf
  }
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

function requireSelection() {
  const meta = getTaskModelMeta('scan')
  if (!meta) {
    throw new AiError('unsupported', 'Chưa chọn Model cho Scan. Chọn Model ở khung của tab Scan (hoặc Chat Box làm mặc định)')
  }
  if (!meta.supportsTools) {
    throw new AiError('unsupported', 'Model đã chọn không hỗ trợ tool calling, không thể Scan. Hãy chọn Model khác ở khung Model của tab Scan')
  }
  if (!meta.supportsWebSearch) {
    throw new AiError('unsupported', `Model "${meta.modelLabel}" không hỗ trợ Web Search, không thể Scan. Hãy chọn Model khác ở khung Model của tab Scan`)
  }
  return getModelConnection(meta.providerId, meta.modelId)
}

export async function runScan(input: ScanInput): Promise<ScanResult> {
  assertAiEnabled()
  return runAiTask('Scan Project', 'scan', async (signal, reporter) => {
    reporter.report('Đọc dữ liệu', 0, 4, 'Đang đọc nội dung...')
    const { candidates, rejected } = await extractCandidates(input.text)

    if (candidates.length === 0) {
      reporter.report('Tổng hợp', 4, 4, 'Không tìm thấy dự án nào')
      return { items: [], rejected, message: 'Không tìm thấy dự án nào trong nội dung đã dán' }
    }

    markDuplicates(candidates)
    reporter.report('Kiểm tra trùng', 1, 4, `Đã phát hiện ${candidates.length} ứng viên, ${candidates.filter((c) => c.duplicateOf).length} trùng với app`)

    const connection = requireSelection()
    const client = createModelClient(connection)

    // Cost control 1: candidates already in the app are not researched again.
    const items: ScanItem[] = []
    const duplicates = candidates.filter((candidate) => candidate.duplicateOf)
    items.push(...duplicates.map(duplicateItem))

    // Cost control 2: a candidate researched within the TTL (same name + domain)
    // is reused from the cache; failed lookups are never cached.
    const nowMs = Date.now()
    const pending = candidates.filter((candidate) => !candidate.duplicateOf)
    const cacheEntries = getScanCacheEntries(pending.map((candidate) => scanCacheKey(candidate.name, candidate.website)))
    const toResearch: Candidate[] = []
    let reusedCount = 0
    for (const candidate of pending) {
      const entry = cacheEntries.get(scanCacheKey(candidate.name, candidate.website))
      if (entry && entry.item.category !== 'insufficient' && isCacheFresh(entry.createdAt, nowMs, COST_LIMITS.scanCacheTtlMs)) {
        items.push({ ...entry.item, name: candidate.name, duplicateOf: null })
        reusedCount += 1
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
    const total = batches.length

    const runBatchAgent = async (messages: AiMessage[]): Promise<AgentResult | null> => {
      try {
        return await runAgent({
          client,
          system: SCAN_SYSTEM_PROMPT,
          messages,
          tools: getScanTools({ costControl: {} }),
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

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      if (signal.aborted) {
        break
      }

      const batch = batches[batchIndex]
      if (budget.exhausted()) {
        // Hard search cap reached: keep the rest as "insufficient" so nothing is silently lost.
        skippedByBudget += batch.length
        items.push(
          ...batch.map((candidate): ScanItem => ({
            ...duplicateItem(candidate),
            category: 'insufficient',
            summary: `Chưa tra cứu: đạt giới hạn ${budget.max} lượt tìm kiếm mỗi phiên, hãy Scan lại phần này`,
            taskSummary: '',
            howToJoin: '',
            costType: 'unverified',
            verification: 'unverified',
            sources: [],
            duplicateOf: null
          }))
        )
        continue
      }
      reporter.report(
        'Tra cứu web',
        2 + batchIndex / Math.max(total, 1),
        4,
        `Lô ${batchIndex + 1}/${total}: ${batch.map((candidate) => candidate.name).join(', ')}`
      )

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

        if (result && result.outcome === 'submit') {
          const payload = result.payload as { kind?: string; data?: unknown }
          if (payload.kind === SCAN_RESULT_KIND) {
            const parsed = scanResultSchema.safeParse(payload.data)
            if (parsed.success) {
              for (const rawItem of parsed.data.items) {
                const duplicateOf = rawItem.duplicateOf ?? batch.find((candidate) => candidate.name === rawItem.name)?.duplicateOf ?? null
                const item: ScanItem = {
                  ...rawItem,
                  website: rawItem.website ?? null,
                  startDate: rawItem.startDate ?? null,
                  endDate: rawItem.endDate ?? null,
                  riskReason: rawItem.riskReason ?? null,
                  potential: rawItem.potential ?? null,
                  costAmountUsd: rawItem.costAmountUsd ?? null,
                  duplicateOf
                }
                items.push(item)
              }
              const stamp = new Date().toISOString()
              putScanCacheEntries(
                parsed.data.items.flatMap((rawItem) => {
                  const source = batch.find((candidate) => candidate.name === rawItem.name)
                  const stored = items.find((item) => item.name === rawItem.name)
                  return source && stored && stored.category !== 'insufficient'
                    ? [{ key: scanCacheKey(source.name, source.website), item: stored }]
                    : []
                }),
                stamp
              )
              saveScanLatest(items, stamp)
              continue
            }
          }
        }

        // Model không nộp kết quả hợp lệ → đánh dấu cả lô là không đủ bằng chứng.
        const fallback = batch.map((candidate): ScanItem => ({
          name: candidate.name,
          category: 'insufficient',
          website: candidate.website,
          summary: 'AI không trả về kết quả hợp lệ cho dự án này',
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
          duplicateOf: candidate.duplicateOf
        }))
        items.push(...fallback)
        saveScanLatest(items, new Date().toISOString())
      } catch (error) {
        if (signal.aborted) {
          saveScanLatest(items, new Date().toISOString())
          reporter.report('Đã hủy', 4, 4, `Đã hủy, giữ kết quả ${items.length} dự án`)
          return {
            items,
            rejected,
            message: `Đã hủy, giữ kết quả ${items.length} dự án đã phân tích`
          }
        }
        throw error
      }
    }

    saveScanLatest(items, new Date().toISOString())
    logInfo(
      `Scan: ${candidates.length} ứng viên, ${duplicates.length} trùng app, ${reusedCount} từ cache, ` +
        `${toResearch.length - skippedByBudget} tra cứu, ${usageTotal.calls} lượt gọi model, ` +
        `input=${usageTotal.inputTokens} output=${usageTotal.outputTokens} token, tìm kiếm=${budget.used()}/${budget.max}`
    )
    reporter.report('Tổng hợp', 4, 4, `Hoàn tất ${items.length} dự án`)
    const notes: string[] = []
    if (duplicates.length > 0) {
      notes.push(`${duplicates.length} dự án trùng app (không tra cứu)`)
    }
    if (reusedCount > 0) {
      notes.push(`${reusedCount} lấy từ cache`)
    }
    if (skippedByBudget > 0) {
      notes.push(`${skippedByBudget} chưa tra cứu do đạt giới hạn ${budget.max} lượt tìm kiếm, hãy Scan lại`)
    }
    return {
      items,
      rejected,
      message: `Đã phân tích ${items.length} dự án từ ${candidates.length} ứng viên${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`
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
        socialsX: project.socials.x ?? null
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
