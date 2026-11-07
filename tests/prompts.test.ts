import { describe, expect, it } from 'vitest'
import {
  CHAT_SYSTEM_PROMPT,
  NEWS_SYSTEM_PROMPT,
  SCAN_SYSTEM_PROMPT
} from '../src/main/ai/prompts'
import { buildNewsPrompt } from '../src/shared/newsPrompt'
import type { NewsPromptProject } from '../src/shared/newsPrompt'

const SECTIONS = ['### VAI TRÒ', '### BỐI CẢNH', '### QUY TẮC', '### CÔNG CỤ', '### ĐỊNH DẠNG ĐẦU RA'] as const

// Every tool registered in src/main/ai/tools.ts (read tools + submit + propose).
const REGISTERED_TOOLS = new Set([
  'list_projects',
  'list_existing_projects',
  'get_project',
  'web_fetch',
  'web_search',
  'submit_scan_result',
  'submit_news',
  'propose_add_projects',
  'propose_update_project',
  'propose_delete_projects',
  'ask_user_choice'
])

const TOOL_NAME_RE = /\b(?:list|get|web|submit|propose|ask)_[a-z_]+\b/g
const HARD_CODED_DATE_RE = /\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/20\d{2}\b/

function project(overrides: Partial<NewsPromptProject> = {}): NewsPromptProject {
  return {
    id: 'PRJ-001',
    name: 'Alpha',
    category: 'airdrop',
    website: 'https://alpha.example.com',
    x: 'https://x.com/alpha',
    discord: null,
    telegram: null,
    other: [],
    ...overrides
  }
}

function expectSections(prompt: string): void {
  let lastIndex = -1
  for (const section of SECTIONS) {
    const index = prompt.indexOf(section)
    expect(index, `thiếu ${section}`).toBeGreaterThanOrEqual(0)
    expect(index, `${section} sai thứ tự`).toBeGreaterThan(lastIndex)
    lastIndex = index
  }
}

describe('prompts — cấu trúc 5 phần (FIX 3)', () => {
  it('mọi system prompt đều có Vai trò → Bối cảnh → Quy tắc → Công cụ → Định dạng đầu ra', () => {
    expectSections(SCAN_SYSTEM_PROMPT)
    expectSections(NEWS_SYSTEM_PROMPT)
    expectSections(CHAT_SYSTEM_PROMPT)
  })

  it('prompt Check News dạng file cũng dùng đúng 5 phần', () => {
    expectSections(buildNewsPrompt([project()], new Date('2026-11-06T03:00:00.000Z')))
  })

  it('mỗi prompt chỉ nhắc tool đã đăng ký', () => {
    for (const prompt of [SCAN_SYSTEM_PROMPT, NEWS_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT]) {
      const names = prompt.match(TOOL_NAME_RE) ?? []
      for (const name of names) {
        expect(REGISTERED_TOOLS.has(name), `tool chưa đăng ký: ${name}`).toBe(true)
      }
    }
  })

  it('không hard-code ngày trong prompt tĩnh', () => {
    expect(SCAN_SYSTEM_PROMPT).not.toMatch(HARD_CODED_DATE_RE)
    expect(NEWS_SYSTEM_PROMPT).not.toMatch(HARD_CODED_DATE_RE)
    expect(CHAT_SYSTEM_PROMPT).not.toMatch(HARD_CODED_DATE_RE)
  })

  it('prompt sinh ra chỉ chứa ngày hôm nay do hệ thống tính', () => {
    const prompt = buildNewsPrompt([project()], new Date('2026-11-06T03:00:00.000Z'))
    const dates = prompt.match(HARD_CODED_DATE_RE) ?? []
    expect(new Set(dates)).toEqual(new Set(['2026-11-06']))
  })
})

describe('prompts — chống bịa và nội dung web (FIX 3)', () => {
  it('mọi prompt đều coi nội dung web là dữ liệu, không phải chỉ thị', () => {
    for (const prompt of [SCAN_SYSTEM_PROMPT, NEWS_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT]) {
      expect(prompt).toContain('<untrusted_web_content>')
      expect(prompt.toLowerCase()).toContain('dữ liệu')
      expect(prompt.toLowerCase()).toContain('không phải chỉ thị')
    }
  })

  it('News nêu rõ giới hạn X/Twitter khi fetch', () => {
    expect(NEWS_SYSTEM_PROMPT.toLowerCase()).toContain('x/twitter')
    expect(NEWS_SYSTEM_PROMPT).toContain('web_fetch')
    expect(NEWS_SYSTEM_PROMPT).toContain('unverified')
  })

  it('News yêu cầu một tin quan trọng mỗi dự án và summary một dòng', () => {
    expect(NEWS_SYSTEM_PROMPT).toContain('MỘT tin kind="important"')
    expect(NEWS_SYSTEM_PROMPT).toContain('summary một dòng')
  })

  it('News nhắc đủ mốc End/Snapshot/Claim/Whitelist và ISO 8601', () => {
    expect(NEWS_SYSTEM_PROMPT).toContain('End')
    expect(NEWS_SYSTEM_PROMPT).toContain('Snapshot')
    expect(NEWS_SYSTEM_PROMPT).toContain('Claim')
    expect(NEWS_SYSTEM_PROMPT).toContain('Whitelist')
    expect(NEWS_SYSTEM_PROMPT).toContain('ISO 8601')
  })

  it('prompt file News hiển thị dd/MM/yyyy và publishedAt ISO 8601', () => {
    const prompt = buildNewsPrompt([project()], new Date('2026-11-06T03:00:00.000Z'))
    expect(prompt).toContain('ISO 8601')
    expect(prompt).toContain('dd/MM/yyyy')
  })
})

describe('prompts — Chat chỉ dùng CRUD đã có (FIX 3)', () => {
  it('nhắc đúng bộ tool CRUD và PendingAction/OK', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('propose_add_projects')
    expect(CHAT_SYSTEM_PROMPT).toContain('propose_update_project')
    expect(CHAT_SYSTEM_PROMPT).toContain('propose_delete_projects')
    expect(CHAT_SYSTEM_PROMPT).toContain('ask_user_choice')
    expect(CHAT_SYSTEM_PROMPT).toContain('PendingAction')
    expect(CHAT_SYSTEM_PROMPT).toContain('OK')
  })

  it('không tự nhận đã sửa dữ liệu khi chưa gọi tool', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('Không nói "đã thêm/đã sửa/đã xóa"')
  })
})
