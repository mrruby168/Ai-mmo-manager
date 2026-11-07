import { describe, expect, it } from 'vitest'
import { COST_TYPES, PROJECT_CATEGORIES, PROJECT_STATUSES, VERIFICATION_STATES } from '../src/shared/constants'
import { getChatTools, getNewsTools, getScanTools } from '../src/main/ai/tools'
import type { AgentTool } from '../src/main/ai/agentRunner'
import { toGoogleTools } from '../src/main/ai/providers/google'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectSchemaIssues(schema: unknown, path: string, issues: string[]): void {
  if (!isRecord(schema)) {
    return
  }
  if (schema.type === 'array') {
    if (!isRecord(schema.items)) {
      issues.push(`${path}: array thiếu items`)
      return
    }
    collectSchemaIssues(schema.items, `${path}[]`, issues)
  }
  if (schema.type === 'object') {
    if (!isRecord(schema.properties)) {
      issues.push(`${path}: object thiếu properties`)
      return
    }
    for (const [key, value] of Object.entries(schema.properties)) {
      collectSchemaIssues(value, `${path}.${key}`, issues)
    }
  }
}

const allTools: AgentTool[] = [...getChatTools(), ...getScanTools(), ...getNewsTools()]

function findTool(name: string): AgentTool {
  const tool = allTools.find((entry) => entry.name === name)
  if (!tool) {
    throw new Error(`missing tool ${name}`)
  }
  return tool
}

describe('tool JSON schemas', () => {
  it('registers at least the chat, scan and news tools', () => {
    const names = allTools.map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'list_projects',
        'get_project',
        'web_fetch',
        'propose_add_projects',
        'propose_update_project',
        'propose_delete_projects',
        'ask_user_choice',
        'submit_scan_result',
        'submit_news'
      ])
    )
  })

  it.each(allTools.map((tool) => [tool.name, tool] as const))(
    'declares every array with items and every object with properties (%s)',
    (_name, tool) => {
      const issues: string[] = []
      collectSchemaIssues(tool.parameters, `${tool.name}.parameters`, issues)
      expect(issues).toEqual([])
    }
  )

  it('describes project items with the same enums as the shared constants', () => {
    const add = findTool('propose_add_projects').parameters as Record<string, unknown>
    const projects = (add.properties as Record<string, unknown>).projects as Record<string, unknown>
    const item = projects.items as Record<string, unknown>
    const properties = item.properties as Record<string, Record<string, unknown>>

    expect(item.required).toEqual(['name'])
    expect(properties.category.enum).toEqual([...PROJECT_CATEGORIES])
    expect(properties.costType.enum).toEqual([...COST_TYPES])
    expect(properties.status.enum).toEqual([...PROJECT_STATUSES])
    expect(properties.verification.enum).toEqual([...VERIFICATION_STATES])
    expect((properties.socials.properties as Record<string, Record<string, unknown>>).other.items).toEqual({
      type: 'string'
    })
    expect((properties.sources as Record<string, unknown>).items).toEqual({ type: 'string' })
  })

  it('describes the fields accepted by the update tool', () => {
    const update = findTool('propose_update_project').parameters as Record<string, unknown>
    const changes = (update.properties as Record<string, unknown>).changes as Record<string, unknown>
    const properties = changes.properties as Record<string, unknown>

    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining([
        'category',
        'name',
        'website',
        'socials',
        'taskSummary',
        'howToJoin',
        'startDate',
        'endDate',
        'costType',
        'costAmountUsd',
        'status',
        'verification',
        'sources',
        'notes'
      ])
    )
  })

  it('omits parameters for Gemini tools that take no arguments', () => {
    const declarations = toGoogleTools(
      [
        { name: 'list_projects', description: 'no args', parameters: { type: 'object', properties: {} } },
        {
          name: 'web_fetch',
          description: 'one arg',
          parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }
        }
      ],
      false
    )[0].functionDeclarations as Array<Record<string, unknown>>

    expect(declarations[0]).not.toHaveProperty('parameters')
    expect(declarations[1]).toHaveProperty('parameters')
  })
})
