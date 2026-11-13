import { describe, expect, it } from 'vitest'
import {
  SCAN_MAX_PROJECTS,
  capProjects,
  classifyScanText,
  handleKey,
  parseExtractionOutput,
  parseNameList
} from '../src/shared/scanText'

describe('classifyScanText', () => {
  it('nhận JSON', () => {
    expect(classifyScanText('[{"name":"A"}]')).toBe('json')
    expect(classifyScanText('  {"projects":[]}')).toBe('json')
  })

  it('danh sách tên ngắn mỗi dòng là list', () => {
    expect(classifyScanText('Grass\nBlast\n- Nillion\n1. Monad')).toBe('list')
  })

  it('bài viết nhiều câu là article', () => {
    const article =
      'Hôm nay mình chia sẻ 3 dự án airdrop đáng làm.\nGrass là dự án DePIN cho phép chia sẻ băng thông, cộng đồng rất mạnh.\nBlast đang có đợt điểm mới.'
    expect(classifyScanText(article)).toBe('article')
  })

  it('quá nhiều dòng coi là article', () => {
    const many = Array.from({ length: 60 }, (_, i) => `Dự án ${i}`).join('\n')
    expect(classifyScanText(many)).toBe('article')
  })
})

describe('parseNameList', () => {
  it('bỏ ký hiệu đầu dòng và dòng rỗng', () => {
    expect(parseNameList('- Grass\n\n2) Blast\n• Monad  Labs\n')).toEqual(['Grass', 'Blast', 'Monad Labs'])
  })
})

describe('parseExtractionOutput', () => {
  it('đọc JSON thuần', () => {
    const out = parseExtractionOutput('{"projects":[{"name":"Grass","website":"https://getgrass.io","xHandle":"getgrass_io"},{"name":"Blast","website":null,"xHandle":null}]}')
    expect(out).toEqual([
      { name: 'Grass', website: 'https://getgrass.io', xHandle: 'getgrass_io' },
      { name: 'Blast', website: null, xHandle: null }
    ])
  })

  it('đọc JSON trong code fence và lời dẫn', () => {
    const raw = 'Đây là kết quả:\n```json\n{"projects":[{"name":"Monad"}]}\n```'
    expect(parseExtractionOutput(raw)).toEqual([{ name: 'Monad', website: null, xHandle: null }])
  })

  it('nhận mảng chuỗi và bỏ "null"', () => {
    expect(parseExtractionOutput('["Grass","Blast"]').map((p) => p.name)).toEqual(['Grass', 'Blast'])
    expect(parseExtractionOutput('{"projects":[{"name":"A","website":"null"}]}')[0].website).toBeNull()
  })

  it('không phải JSON thì mỗi dòng là một tên', () => {
    expect(parseExtractionOutput('Grass\n- Blast').map((p) => p.name)).toEqual(['Grass', 'Blast'])
  })

  it('rỗng thì trả mảng rỗng', () => {
    expect(parseExtractionOutput('   ')).toEqual([])
  })
})

describe('handleKey', () => {
  it('chuẩn hóa handle, @handle và URL', () => {
    expect(handleKey('@GetGrass_io')).toBe('getgrass_io')
    expect(handleKey('https://x.com/GetGrass_io')).toBe('getgrass_io')
    expect(handleKey('https://twitter.com/getgrass_io/status/123')).toBe('getgrass_io')
    expect(handleKey('khong hop le!')).toBeNull()
    expect(handleKey(null)).toBeNull()
  })
})

describe('capProjects', () => {
  it('giữ tối đa N và báo số bị bỏ', () => {
    const list = Array.from({ length: SCAN_MAX_PROJECTS + 5 }, (_, i) => i)
    const { kept, dropped } = capProjects(list)
    expect(kept).toHaveLength(SCAN_MAX_PROJECTS)
    expect(dropped).toBe(5)
    expect(capProjects([1, 2]).dropped).toBe(0)
  })
})
