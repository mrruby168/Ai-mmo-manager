import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

describe('logo cache (P1)', () => {
  it('protocol mmo-logo không còn no-store và không gọi getProject', () => {
    const main = read('src/main/index.ts')
    expect(main).not.toContain('no-store')
    expect(main).toContain('getProjectLogoPath')
    expect(main).toContain('max-age=31536000')
  })

  it('ProjectLogo dùng lazy, async decode và khoá theo version', () => {
    const logo = read('src/renderer/src/common/ProjectLogo.tsx')
    expect(logo).toContain('loading="lazy"')
    expect(logo).toContain('decoding="async"')
    expect(logo).toContain('version ?? dataVersion')
  })
})
