import { describe, expect, it } from 'vitest'
import { computePopupRect, edgeIndex, nextIndex, typeaheadMatch } from '../src/shared/listbox'

describe('Listbox — điều hướng bàn phím (FIX 5b)', () => {
  it('đi vòng khi tới đầu/cuối và trả -1 cho danh sách rỗng', () => {
    expect(nextIndex(0, 3, 1)).toBe(1)
    expect(nextIndex(2, 3, 1)).toBe(0)
    expect(nextIndex(0, 3, -1)).toBe(2)
    expect(nextIndex(-1, 3, 1)).toBe(0)
    expect(nextIndex(-1, 3, -1)).toBe(2)
    expect(nextIndex(0, 0, 1)).toBe(-1)
  })

  it('Home/End về đúng hai đầu', () => {
    expect(edgeIndex(5, 'first')).toBe(0)
    expect(edgeIndex(5, 'last')).toBe(4)
    expect(edgeIndex(0, 'first')).toBe(-1)
  })

  it('gõ chữ nhảy tới mục khớp và xoay vòng khi bấm lặp', () => {
    const labels = ['Gemini 3.5 Flash', 'Gemini 3.8 Flash', 'GPT-5.6 Terra']
    expect(typeaheadMatch(labels, 'g', -1)).toBe(0)
    expect(typeaheadMatch(labels, 'g', 0)).toBe(1)
    expect(typeaheadMatch(labels, 'gpt', -1)).toBe(2)
    expect(typeaheadMatch(labels, 'zzz', -1)).toBe(-1)
    expect(typeaheadMatch(labels, '', -1)).toBe(-1)
  })
})

describe('Listbox — vị trí popup (FIX 5b)', () => {
  const viewport = { viewportWidth: 1000, viewportHeight: 800 }

  it('mở xuống khi còn đủ chỗ', () => {
    const rect = computePopupRect({ left: 100, top: 100, bottom: 140, width: 240 }, 200, viewport)
    expect(rect.placement).toBe('below')
    expect(rect.top).toBe(144)
    expect(rect.maxHeight).toBe(200)
  })

  it('lật lên khi phía dưới không đủ chỗ', () => {
    const rect = computePopupRect({ left: 100, top: 700, bottom: 740, width: 240 }, 200, viewport)
    expect(rect.placement).toBe('above')
    expect(rect.top).toBe(496)
    expect(rect.maxHeight).toBe(200)
  })

  it('kẹp trong viewport và giới hạn cao 280px', () => {
    const rect = computePopupRect({ left: -20, top: 100, bottom: 140, width: 300 }, 900, viewport)
    expect(rect.left).toBe(8)
    expect(rect.maxHeight).toBe(280)
    expect(rect.width).toBe(300)
  })

  it('kẹp lề phải', () => {
    const rect = computePopupRect({ left: 900, top: 100, bottom: 140, width: 300 }, 120, viewport)
    expect(rect.left).toBe(692)
  })
})
