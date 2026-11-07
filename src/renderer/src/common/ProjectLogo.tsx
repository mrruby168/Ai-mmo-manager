import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import { firstLetter, letterColor } from '@shared/letterColor'

type LogoSize = 'row' | 'detail' | 'news'

const SIZES: Record<LogoSize, number> = {
  row: 40,
  detail: 72,
  news: 24
}

export function ProjectLogo({
  projectId,
  name,
  hasLogo,
  size = 'row'
}: {
  projectId: string
  name: string
  hasLogo: boolean
  size?: LogoSize
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const { dataVersion } = useApp()
  const dimension = SIZES[size]

  useEffect(() => {
    setFailed(false)
  }, [projectId, hasLogo, dataVersion])

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
      <img src={`mmo-logo://logo/${projectId}?v=${dataVersion}`} alt={`Logo ${name}`} onError={() => setFailed(true)} />
    </span>
  )
}
