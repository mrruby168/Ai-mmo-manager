import type { ReactNode } from 'react'

export function ExternalLink({
  url,
  children,
  className
}: {
  url: string
  children: ReactNode
  className?: string
}): React.JSX.Element {
  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>): Promise<void> {
    event.preventDefault()
    await window.api.app.openExternal(url)
  }

  return (
    <a
      href={url}
      className={className}
      data-lock-allow="true"
      rel="noreferrer noopener"
      title={url}
      onClick={(event) => void handleClick(event)}
    >
      {children} <span aria-hidden="true">↗</span>
    </a>
  )
}
