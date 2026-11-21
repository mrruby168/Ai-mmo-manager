import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import { firstLetter, letterColor } from '@shared/letterColor'

export type LogoSize = 'row' | 'detail' | 'news'

export function logoSrc(projectId: string, version: string | number, size: LogoSize): string {
  const thumb = size === 'detail' ? '' : '&s=thumb'
  return `mmo-logo://logo/${projectId}?v=${version}${thumb}`
}

const SIZES: Record<LogoSize, number> = {
  row: 40,
  detail: 72,
  news: 24
}

export function ProjectLogo({
  projectId,
  name,
  hasLogo,
  size = 'row',
  version
}: {
  projectId: string
  name: string
  hasLogo: boolean
  size?: LogoSize
  version?: string | number
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const { dataVersion } = useApp()
  const dimension = SIZES[size]
  const effectiveVersion = version ?? dataVersion

  useEffect(() => {
    setFailed(false)
  }, [projectId, hasLogo, dataVersion, effectiveVersion])

  const palette = useMemo(() => letterColor(name), [name])

  const style = {
    width: dimension,
    height: dimension,
    fontSize: Math.max(12, Math.round(dimension * 0.42)),
    background: palette.background,
    color: palette.color
  }

  if (!hasLogo || failed) {
    return (
      <span className="project-logo" style={style} aria-hidden="true">
        {firstLetter(name)}
      </span>
    )
  }

  return (
    <span className="project-logo" style={style}>
      <img
        src={logoSrc(projectId, effectiveVersion, size)}
        alt={`Logo ${name}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  )
}
