import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { getDeadlineInfo, todayDateOnly } from '@shared/date-utils'
import { formatCost } from '@shared/format'
import type { Project } from '@shared/types'
import { listProjects } from '../db/projectsRepo'

export type ExportFormat = 'json' | 'txt'

export interface ExportOutcome {
  filePath: string
  format: ExportFormat
  count: number
}

const CATEGORY_LABELS = { event_mmo: 'Event MMO', airdrop: 'Airdrop' } as const
const STATUS_LABELS = { not_joined: 'Chưa tham gia', in_progress: 'Đang thực hiện', completed: 'Hoàn thành' } as const
const VERIFICATION_LABELS = { verified: 'Đã xác minh', unverified: 'Chưa xác minh' } as const

export function defaultExportFileName(format: ExportFormat): string {
  return `mmo-manager-projects-${todayDateOnly()}.${format}`
}

export function defaultExportDirectory(): string {
  return app.getPath('downloads')
}

export function buildExportPayload(projects: Project[]): {
  schemaVersion: '1.0'
  projects: Array<Record<string, unknown>>
} {
  return {
    schemaVersion: '1.0',
    projects: projects.map((project) => ({
      category: project.category,
      name: project.name,
      website: project.website,
      socials: project.socials,
      taskSummary: project.taskSummary,
      howToJoin: project.howToJoin,
      startDate: project.startDate,
      endDate: project.endDate,
      costType: project.costType,
      costAmountUsd: project.costAmountUsd,
      status: project.status,
      verification: project.verification,
      sources: project.sources,
      notes: project.notes
    }))
  }
}

function renderProjectBlock(project: Project, index: number): string {
  const lines: string[] = [`${index + 1}. [${CATEGORY_LABELS[project.category]}] ${project.name} (${project.id})`]
  if (project.website) {
    lines.push(`   Website: ${project.website}`)
  }
  const socials = Object.entries(project.socials)
    .flatMap(([key, value]) => (Array.isArray(value) ? value.map((entry) => `${key}: ${entry}`) : value ? [`${key}: ${value}`] : []))
  if (socials.length > 0) {
    lines.push(`   Mạng xã hội: ${socials.join(' | ')}`)
  }
  if (project.taskSummary) {
    lines.push(`   Nhiệm vụ: ${project.taskSummary}`)
  }
  if (project.howToJoin) {
    lines.push(`   Cách tham gia: ${project.howToJoin}`)
  }
  const deadline = getDeadlineInfo(project.endDate)
  const start = project.startDate ? `Bắt đầu: ${project.startDate}` : 'Bắt đầu: chưa rõ'
  const end = project.endDate ? `Kết thúc: ${project.endDate} (${deadline.text})` : 'Kết thúc: chưa rõ'
  lines.push(`   ${start} · ${end}`)
  lines.push(`   Trạng thái: ${STATUS_LABELS[project.status]} · Xác minh: ${VERIFICATION_LABELS[project.verification]}`)
  lines.push(`   Chi phí: ${formatCost(project.costType, project.costAmountUsd).label}`)
  if (project.notes) {
    lines.push(`   Ghi chú: ${project.notes}`)
  }
  return lines.join('\n')
}

export function buildExportText(projects: Project[]): string {
  const header = [
    'MMO Manager — Danh sách dự án',
    `Ngày xuất: ${todayDateOnly()}`,
    `Tổng: ${projects.length} dự án`
  ].join('\n')

  if (projects.length === 0) {
    return `${header}\n\nChưa có dự án nào.`
  }

  return `${header}\n\n${projects.map(renderProjectBlock).join('\n\n')}\n`
}

export function exportProjects(format: ExportFormat, targetPath?: string): ExportOutcome {
  const projects = listProjects()
  const filePath = targetPath ?? join(defaultExportDirectory(), defaultExportFileName(format))

  const content =
    format === 'json' ? `${JSON.stringify(buildExportPayload(projects), null, 2)}\n` : buildExportText(projects)

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')

  return { filePath, format, count: projects.length }
}
