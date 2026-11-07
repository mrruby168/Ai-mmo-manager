import { describe, expect, it } from 'vitest'
import {
  MILESTONE_LABEL,
  buildDeadlineRows,
  buildHeadline,
  extractMilestoneFromText,
  formatDmy,
  oneLine,
  selectTopImportantPerProject
} from '../src/shared/newsView'
import type { DeadlineProject, ImportantNewsItem } from '../src/shared/newsView'

const TODAY = '2026-11-07'

function news(overrides: Partial<ImportantNewsItem> = {}): ImportantNewsItem {
  return {
    id: 1,
    projectId: 'PRJ-001',
    summary: 'Tin mới',
    verification: 'verified',
    publishedAt: '2026-11-07T08:00:00.000Z',
    milestoneKind: null,
    milestoneDate: null,
    ...overrides
  }
}

function project(overrides: Partial<DeadlineProject> = {}): DeadlineProject {
  return {
    id: 'PRJ-001',
    name: 'Alpha',
    category: 'airdrop',
    status: 'in_progress',
    endDate: null,
    verification: 'unverified',
    logoPath: null,
    ...overrides
  }
}

describe('newsView — định dạng và tiêu đề (FIX 1)', () => {
  it('formatDmy đổi ngày ISO sang dd/mm/yyyy', () => {
    expect(formatDmy('2026-11-08')).toBe('08/11/2026')
    expect(formatDmy('2026-11-08T10:00:00.000Z')).toBe('08/11/2026')
  })

  it('có nhãn cho mọi loại mốc', () => {
    expect(MILESTONE_LABEL.end).toBe('End')
    expect(MILESTONE_LABEL.snapshot).toBe('Snapshot')
    expect(MILESTONE_LABEL.claim).toBe('Claim')
    expect(MILESTONE_LABEL.whitelist).toBe('Whitelist')
    expect(MILESTONE_LABEL.tge).toBe('TGE')
    expect(MILESTONE_LABEL.listing).toBe('Listing')
    expect(MILESTONE_LABEL.other).toBe('Mốc khác')
  })

  it('buildHeadline ưu tiên mốc đã lưu, rồi đoán từ summary, cuối cùng rút gọn summary', () => {
    expect(buildHeadline(news({ milestoneKind: 'end', milestoneDate: '2026-11-08' }))).toBe('End 08/11/2026')
    expect(buildHeadline(news({ summary: 'Snapshot diễn ra 2026-11-10' }))).toBe('Snapshot 10/11/2026')
    expect(buildHeadline(news({ summary: 'x'.repeat(120) }))).toBe(`${'x'.repeat(59)}…`)
  })
})

describe('newsView — đoán mốc từ câu (FIX 1)', () => {
  it('bắt từ khóa tiếng Anh và nhiều định dạng ngày', () => {
    expect(extractMilestoneFromText('End 08/11/2026', 2026)).toEqual({ kind: 'end', date: '2026-11-08' })
    expect(extractMilestoneFromText('Snapshot: 2026-11-10', 2026)).toEqual({
      kind: 'snapshot',
      date: '2026-11-10'
    })
    expect(extractMilestoneFromText('Claim opens Nov 8', 2026)).toEqual({ kind: 'claim', date: '2026-11-08' })
    expect(extractMilestoneFromText('TGE 8/11', 2026)).toEqual({ kind: 'tge', date: '2026-11-08' })
  })

  it('bắt từ khóa tiếng Việt, WL và chọn từ khóa xuất hiện sớm nhất', () => {
    expect(extractMilestoneFromText('Kết thúc ngày 8 tháng 11', 2026)).toEqual({
      kind: 'end',
      date: '2026-11-08'
    })
    expect(extractMilestoneFromText('WL mở 08/11/2026', 2026)).toEqual({
      kind: 'whitelist',
      date: '2026-11-08'
    })
    expect(extractMilestoneFromText('Whitelist ends Nov 8', 2026)).toEqual({
      kind: 'whitelist',
      date: '2026-11-08'
    })
  })

  it('trả null khi không có mốc, hoặc mốc không kèm ngày', () => {
    expect(extractMilestoneFromText('Dự án ra mắt tuần này', 2026)).toBeNull()
    expect(extractMilestoneFromText('Claim sẽ mở', 2026)).toEqual({ kind: 'claim', date: null })
    expect(extractMilestoneFromText('End 31/02/2026', 2026)).toEqual({ kind: 'end', date: null })
  })
})

describe('newsView — chọn một tin quan trọng mỗi dự án (FIX 1)', () => {
  it('chỉ giữ một tin mỗi dự án', () => {
    const picked = selectTopImportantPerProject(
      [news({ id: 1 }), news({ id: 2, summary: 'Tin khác' }), news({ id: 3, projectId: 'PRJ-002' })],
      TODAY
    )

    expect(picked.map((item) => item.projectId).sort()).toEqual(['PRJ-001', 'PRJ-002'])
  })

  it('verified thắng tin chưa xác minh dù mốc của tin kia gần hơn', () => {
    const picked = selectTopImportantPerProject(
      [
        news({ id: 1, verification: 'unverified', milestoneKind: 'end', milestoneDate: '2026-11-08' }),
        news({ id: 2, verification: 'verified', milestoneKind: 'end', milestoneDate: '2026-11-20' })
      ],
      TODAY
    )

    expect(picked[0].id).toBe(2)
  })

  it('mốc tương lai gần nhất đứng trước mốc xa hơn', () => {
    const picked = selectTopImportantPerProject(
      [
        news({ id: 1, milestoneKind: 'claim', milestoneDate: '2026-11-20' }),
        news({ id: 2, milestoneKind: 'end', milestoneDate: '2026-11-09' })
      ],
      TODAY
    )

    expect(picked[0].id).toBe(2)
  })

  it('không có ngày thì xét thứ tự loại mốc end < snapshot < claim', () => {
    const picked = selectTopImportantPerProject(
      [
        news({ id: 1, milestoneKind: 'claim' }),
        news({ id: 2, milestoneKind: 'snapshot' }),
        news({ id: 3, milestoneKind: 'end' })
      ],
      TODAY
    )

    expect(picked[0].id).toBe(3)
  })

  it('mốc tương lai đứng trước mốc đã qua', () => {
    const picked = selectTopImportantPerProject(
      [
        news({ id: 1, milestoneKind: 'end', milestoneDate: '2026-11-06' }),
        news({ id: 2, milestoneKind: 'claim', milestoneDate: '2026-12-01' })
      ],
      TODAY
    )

    expect(picked[0].id).toBe(2)
  })

  it('cùng hạng thì lấy tin mới xuất bản hơn', () => {
    const picked = selectTopImportantPerProject(
      [
        news({ id: 1, publishedAt: '2026-11-07T07:00:00.000Z' }),
        news({ id: 2, publishedAt: '2026-11-07T09:00:00.000Z' })
      ],
      TODAY
    )

    expect(picked[0].id).toBe(2)
  })
})

describe('newsView — gộp dòng deadline (FIX 1)', () => {
  it('một dự án có End và Snapshot thì ra hai dòng', () => {
    const rows = buildDeadlineRows(
      [project({ endDate: '2026-11-10' })],
      [{ projectId: 'PRJ-001', verification: 'verified', milestoneKind: 'snapshot', milestoneDate: '2026-11-09' }],
      TODAY
    )

    expect(rows.map((row) => row.kind).sort()).toEqual(['end', 'snapshot'])
  })

  it('trùng (project, kind, date) thì gộp một dòng và ưu tiên verified', () => {
    const rows = buildDeadlineRows(
      [project()],
      [
        { projectId: 'PRJ-001', verification: 'unverified', milestoneKind: 'claim', milestoneDate: '2026-11-10' },
        { projectId: 'PRJ-001', verification: 'verified', milestoneKind: 'claim', milestoneDate: '2026-11-10' }
      ],
      TODAY
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].verification).toBe('verified')
  })

  it('mốc End verified thắng project.endDate', () => {
    const rows = buildDeadlineRows(
      [project({ endDate: '2026-11-10' })],
      [{ projectId: 'PRJ-001', verification: 'verified', milestoneKind: 'end', milestoneDate: '2026-11-12' }],
      TODAY
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-11-12')
  })

  it('mốc End unverified không ghi đè, hiện thành dòng riêng', () => {
    const rows = buildDeadlineRows(
      [project({ endDate: '2026-11-10' })],
      [{ projectId: 'PRJ-001', verification: 'unverified', milestoneKind: 'end', milestoneDate: '2026-11-12' }],
      TODAY
    )

    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.date === '2026-11-10')?.verification).toBe('unverified')
    expect(rows.find((row) => row.date === '2026-11-12')?.kind).toBe('end')
  })

  it('dự án completed bỏ endDate nhưng vẫn hiện mốc Claim từ tin', () => {
    const rows = buildDeadlineRows(
      [project({ status: 'completed', endDate: '2026-11-10' })],
      [{ projectId: 'PRJ-001', verification: 'verified', milestoneKind: 'claim', milestoneDate: '2026-11-09' }],
      TODAY
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('claim')
  })

  it('giữ mốc đã qua và bỏ mốc xa hơn 14 ngày', () => {
    const rows = buildDeadlineRows(
      [project({ endDate: '2026-12-01' })],
      [{ projectId: 'PRJ-001', verification: 'verified', milestoneKind: 'claim', milestoneDate: '2026-11-01' }],
      TODAY
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].daysRemaining).toBeLessThan(0)
  })

  it('oneLine gộp khoảng trắng và cắt đúng giới hạn', () => {
    expect(oneLine('  a   b\n c  ', 20)).toBe('a b c')
    expect(oneLine('abcdef', 4)).toBe('abc…')
    expect(oneLine('abcdef', 0)).toBe('')
  })
})
