import { buildNewsPrompt } from '@shared/newsPrompt'
import type { NewsPromptProject } from '@shared/newsPrompt'
import { listProjects } from '../db/projectsRepo'

/**
 * Reads the same project set as AI Check News (everything not completed) and
 * builds the offline prompt. It never calls a provider or the network.
 */
export function buildCheckNewsPrompt(now: Date = new Date()): { prompt: string; projectCount: number } {
  const incomplete = listProjects().filter((project) => project.status !== 'completed')
  const projects: NewsPromptProject[] = incomplete.map((project) => ({
    id: project.id,
    name: project.name,
    category: project.category,
    website: project.website,
    x: project.socials.x ?? null,
    discord: project.socials.discord ?? null,
    telegram: project.socials.telegram ?? null,
    other: project.socials.other ?? []
  }))
  return { prompt: buildNewsPrompt(projects, now), projectCount: projects.length }
}
