import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveProviderLogo } from '../src/shared/providerLogo'
import { firstLetter, letterColor, LETTER_PALETTE } from '../src/shared/letterColor'

const ROOT = resolve(__dirname, '..')

describe('ProviderLogo (FIX 5b)', () => {
  it('nhận OpenRouter theo host kể cả khi tên bị đổi', () => {
    expect(resolveProviderLogo('Custom Gateway', 'https://openrouter.ai/api/v1')).toBe('openrouter')
    expect(resolveProviderLogo('OpenRouter (Free)', null)).toBe('openrouter')
  })

  it('nhận các provider còn lại theo tên', () => {
    expect(resolveProviderLogo('OpenAI (wusrouter)', 'https://wusrouter.com/v1')).toBe('openai')
    expect(resolveProviderLogo('Claude', null)).toBe('anthropic')
    expect(resolveProviderLogo('Google', 'https://generativelanguage.googleapis.com/v1beta')).toBe('google')
    expect(resolveProviderLogo('OpenCode Zen (Free)', 'https://opencode.ai/inference/openai/v1')).toBe('opencode')
  })

  it('provider lạ trả null để dùng chữ cái đầu', () => {
    expect(resolveProviderLogo('BeatAPI', 'https://direct.beatapi.io/v1')).toBeNull()
    expect(resolveProviderLogo('', null)).toBeNull()
  })

  it('dùng chung bảng màu với ProjectLogo và ổn định theo tên', () => {
    expect(firstLetter('  zoth')).toBe('Z')
    expect(firstLetter('   ')).toBe('?')
    expect(letterColor('Loqua')).toBe(letterColor('Loqua'))
    expect(LETTER_PALETTE).toContain(letterColor('Zoth Community Sale'))
  })

  it('logo là SVG inline, không tải từ mạng', () => {
    const source = readFileSync(join(ROOT, 'src', 'renderer', 'src', 'common', 'ProviderLogo.tsx'), 'utf8')
    expect(source).not.toMatch(/https?:\/\//)
    expect(source).not.toMatch(/<img/)
    expect(source).toContain('<svg')
  })
})
