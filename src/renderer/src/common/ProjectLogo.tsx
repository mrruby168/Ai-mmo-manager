import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'

type LogoSize = 'row' | 'detail' | 'news'

const SIZES: Record<LogoSize, number> = {
  row: 40,
  detail: 72,
  news: 24
}

const LETTER_PALETTE = [
  { background: '#1E3A5F', color: '#DCEBFF' },
  { background: '#14453F', color: '#D7FFF6' },
  { background: '#3B2A5C', color: '#EEE4FF' },
  { background: '#1F3B57', color: '#E1F1FF' },
  { background: '#25402F', color: '#E4FFEA' },
  { background: '#4A2C2A', color: '#FFE9E6' },
  { background: '#22324F', color: '#E6EDF7' },
  { background: '#2E3A24', color: '#F0FFD9' }
]

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

function firstLetter(name: string): string {
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : '?'
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

  const palette = useMemo(() => LETTER_PALETTE[hashString(name) % LETTER_PALETTE.length], [name])

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
