import type { AiMessage } from './types'
import { AiError } from './types'
import { newsResultSchema } from '@shared/schemas'
import { listProjects } from '../db/projectsRepo'
import { saveNewsBatch } from '../services/newsService'
import { createModelClient } from './providers'
import { getModelConnection, getSelectedModelMeta } from './providerService'
import { getNewsTools, NEWS_RESULT_KIND } from './tools'
import { runAgent } from './agentRunner'
import { runAiTask } from './aiTaskRunner'
import { NEWS_SYSTEM_PROMPT } from './prompts'
import { isSameLocalDay, todayDateOnly } from '@shared/date-utils'
import { broadcastToRenderers } from '../ipc/guard'
import { EVENTS } from '@shared/ipc-channels'
import { buildNewsCheckMessage, parseNewsSubmission, verifyNewsSources } from './newsCheck'
import { mergeSearchTraces } from './searchTrace'
import { assertAiEnabled } from './aiMode'

// Anthropic's built-in web search allows only 5 uses per request, so 5 projects
// per batch leaves no room for retries. Three projects per batch is safer.
const BATCH_SIZE = 3

export interface NewsCheckResult {
  added: number
  rejected: number
  message: string
}

function requireSelection() {
  const meta = getSelectedModelMeta()
  if (!meta) {
    throw new AiError('unsupported', 'Chưa chọn Model, hãy chọn ở Chat Box trước khi Check News')
  }
  if (!meta.supportsTools) {
    throw new AiError('unsupported', 'Model đã chọn không hỗ trợ tool calling, không thể Check News. Hãy chọn Model khác ở Chat Box')
  }
  if (!meta.supportsWebSearch) {
    throw new AiError('unsupported', `Model "${meta.modelLabel}" không hỗ trợ Web Search, không thể Check News. Hãy chọn Model khác ở Chat Box`)
  }
  return getModelConnection(meta.providerId, meta.modelId)
}

export async function runCheckNews(): Promise<NewsCheckResult> {
  assertAiEnabled()
  const connection = requireSelection()

  const incomplete = listProjects().filter((project) => project.status !== 'completed')
  if (incomplete.length === 0) {
    return { added: 0, rejected: 0, message: 'Không có dự án chưa hoàn thành để kiểm tra tin' }
  }

  const client = createModelClient(connection)
  const tools = getNewsTools()

  const batches: typeof incomplete[] = []
  for (let index = 0; index < incomplete.length; index += BATCH_SIZE) {
    batches.push(incomplete.slice(index, index + BATCH_SIZE))
  }

  let added = 0
  let rejected = 0

  return runAiTask('Check News', 'news', async (signal, reporter) => {
    const total = batches.length
    let failedBatches = 0
    let searchUnverifiedBatches = 0

    for (let batchIndex = 0; batchIndex < total; batchIndex += 1) {
      if (signal.aborted) {
        break
      }
      const batch = batches[batchIndex]
      reporter.report(
        'Kiểm tra tin',
        batchIndex / total,
        1,
        `Lô ${batchIndex + 1}/${total} (${batch.length} dự án)`
      )

      const batchJson = JSON.stringify(
        batch.map((project) => ({
          id: project.id,
          name: project.name,
          category: project.category,
          website: project.website,
          socials: project.socials,
          endDate: project.endDate
        })),
        null,
        2
      )

      const messages: AiMessage[] = [
        {
          role: 'user',
          content: `Danh sách dự án (JSON):\n${batchJson}\n\nChỉ tìm tin MỚI TRONG NGÀY HÔM NAY (${todayDateOnly()}). Nộp kết quả qua submit_news. Không tìm thấy tin mới thì submit_news với items rỗng.`
        }
      ]

      let result = await runAgent({
        client,
        system: NEWS_SYSTEM_PROMPT,
        messages,
        tools,
        enableWebSearch: true,
        maxTokens: 4096,
        signal
      })

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
          enableWebSearch: true,
          maxTokens: 4096,
          signal
        })
      }

      if (signal.aborted) {
        break
      }

      if (result.outcome !== 'submit') {
        failedBatches += 1
        continue
      }

      const payload = result.payload as { kind?: string; data?: unknown }
      if (payload.kind !== NEWS_RESULT_KIND) {
        failedBatches += 1
        continue
      }
      const parsed = newsResultSchema.safeParse(payload.data)
      if (!parsed.success) {
        failedBatches += 1
        continue
      }

      const allowedIds = new Set(batch.map((project) => project.id))
      const submission = parseNewsSubmission(parsed.data.items, allowedIds)
      rejected += submission.rejected

      const projectNames = new Map(batch.map((project) => [project.id, project.name]))
      const verified = await verifyNewsSources(submission.items, projectNames)
      rejected += verified.rejected

      if (!mergeSearchTraces(result.webSearch).used) {
        searchUnverifiedBatches += 1
      }

      const now = new Date().toISOString()
      const outcome = saveNewsBatch(verified.items, now, isSameLocalDay, allowedIds)
      added += outcome.added
      rejected += outcome.rejected
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
            searchUnverifiedBatches
          })
    }
  })
}
