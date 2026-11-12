import { describe, expect, it } from 'vitest'
import {
  AI_LOG_LEVEL_SYMBOL,
  AI_LOG_LEVEL_TONE,
  AI_LOG_MAX_TEXT_LENGTH,
  formatLogProgress,
  normalizeLogText,
  progressPercent,
  redactSecrets,
  safeUrlForLog
} from '../src/shared/aiLog'

describe('ánh xạ level', () => {
  it('có ký hiệu và nhóm màu cho cả 5 level', () => {
    expect(Object.keys(AI_LOG_LEVEL_SYMBOL).sort()).toEqual(['error', 'online', 'step', 'success', 'warn'])
    expect(AI_LOG_LEVEL_SYMBOL.online).toBe('●')
    expect(AI_LOG_LEVEL_TONE.online).toBe('info')
    expect(AI_LOG_LEVEL_TONE.step).toBe('muted')
    expect(AI_LOG_LEVEL_TONE.success).toBe('success')
    expect(AI_LOG_LEVEL_TONE.warn).toBe('warning')
    expect(AI_LOG_LEVEL_TONE.error).toBe('error')
  })
})

describe('redactSecrets', () => {
  it('xóa API key OpenAI/OpenRouter, Google và header Bearer', () => {
    expect(redactSecrets('key sk-or-v1-abcdefgh12345678 hết hạn')).toBe('key sk-*** hết hạn')
    expect(redactSecrets('Google AIzaSyA1234567890abcdefghijklmnop')).toBe('Google AIza***')
    expect(redactSecrets('Authorization: Bearer abcdefgh12345678')).toBe('Authorization: Bearer ***')
  })

  it('xóa tham số bí mật trong URL nhưng giữ phần còn lại', () => {
    expect(redactSecrets('https://api.example.com/v1?key=sk-secret&page=2')).toContain('key=***')
    expect(redactSecrets('https://api.example.com/v1?key=sk-secret&page=2')).not.toContain('sk-secret')
    expect(redactSecrets('https://x.test/a?token=abcdef&b=1')).toBe('https://x.test/a?token=***&b=1')
    expect(redactSecrets('https://x.test/a?api_key=abc123')).toBe('https://x.test/a?api_key=***')
  })
})

describe('normalizeLogText', () => {
  it('gộp xuống dòng và khoảng trắng thành một dòng', () => {
    expect(normalizeLogText('  Lô 1\n\n  thêm  2 tin\t ')).toBe('Lô 1 thêm 2 tin')
  })

  it('bỏ dòng rỗng', () => {
    expect(normalizeLogText('   \n\t ')).toBe('')
  })

  it('cắt tối đa 200 ký tự kèm dấu ba chấm', () => {
    const text = normalizeLogText('a'.repeat(300))
    expect(text).toHaveLength(AI_LOG_MAX_TEXT_LENGTH)
    expect(text.endsWith('…')).toBe(true)
  })

  it('áp dụng redaction trước khi cắt', () => {
    expect(normalizeLogText('dùng sk-abcdefgh12345678 để gọi')).toBe('dùng sk-*** để gọi')
  })
})

describe('safeUrlForLog', () => {
  it('bỏ query string để không lộ token', () => {
    expect(safeUrlForLog('https://example.com/news/abc?token=secret#top')).toBe('https://example.com/news/abc')
  })

  it('vẫn trả về chuỗi khi URL không hợp lệ', () => {
    expect(safeUrlForLog('not a url?x=1')).toBe('not a url')
  })
})

describe('tiến trình', () => {
  it('tính phần trăm và kẹp trong 0–100', () => {
    expect(progressPercent(0, 10)).toBe(0)
    expect(progressPercent(3, 4)).toBe(75)
    expect(progressPercent(20, 10)).toBe(100)
    expect(progressPercent(5, 0)).toBe(0)
  })

  it('News đếm theo dự án, Scan/Chat theo phần trăm', () => {
    expect(formatLogProgress('news', 9, 12)).toBe('9/12 dự án')
    expect(formatLogProgress('scan', 3, 5)).toBe('60%')
    expect(formatLogProgress('chat', 1, 2)).toBe('50%')
    expect(formatLogProgress('news', 0, 0)).toBe('0/0 dự án')
  })
})
