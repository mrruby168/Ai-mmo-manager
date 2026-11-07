import type { ProviderLogoKind } from '@shared/providerLogo'
import { resolveProviderLogo } from '@shared/providerLogo'
import { firstLetter, letterColor } from '@shared/letterColor'

function LogoMark({ kind, size }: { kind: ProviderLogoKind; size: number }): React.JSX.Element {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false
  }

  switch (kind) {
    case 'openai':
      return (
        <svg {...common}>
          <path d="M12 3.2l6.2 3.6v7.2L12 17.6l-6.2-3.6V6.8L12 3.2z" />
          <path d="M12 10.4l3.4 2v3.4" />
          <path d="M12 13.6l-3.4 2" />
        </svg>
      )
    case 'anthropic':
      return (
        <svg {...common}>
          <path d="M6.5 18.5L13 5.5" />
          <path d="M11.2 18.5l6.3-13" />
        </svg>
      )
    case 'google':
      return (
        <svg {...common}>
          <path d="M20 12.3a8 8 0 1 1-2.6-5.9" />
          <path d="M12 12h8" />
        </svg>
      )
    case 'opencode':
      return (
        <svg {...common}>
          <rect x="3.2" y="4.5" width="17.6" height="15" rx="3" />
          <path d="M7.5 9.5l3 2.5-3 2.5" />
          <path d="M13 14.5h3.5" />
        </svg>
      )
    case 'openrouter':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="18" cy="18" r="2.2" />
          <path d="M8.2 7.2l7.6 9.6" />
          <path d="M8 18h3.4l2.2-2.4" />
        </svg>
      )
  }
}

export function ProviderLogo({
  name,
  baseUrl,
  size = 20
}: {
  name: string
  baseUrl?: string | null
  size?: number
}): React.JSX.Element {
  const kind = resolveProviderLogo(name, baseUrl)

  if (!kind) {
    const palette = letterColor(name)
    return (
      <span
        className="provider-logo provider-logo--letter"
        style={{
          width: size,
          height: size,
          background: palette.background,
          color: palette.color,
          fontSize: Math.max(10, Math.round(size * 0.55))
        }}
        aria-hidden="true"
      >
        {firstLetter(name)}
      </span>
    )
  }

  return (
    <span className="provider-logo" style={{ width: size, height: size }} aria-hidden="true">
      <LogoMark kind={kind} size={size - 4} />
    </span>
  )
}
