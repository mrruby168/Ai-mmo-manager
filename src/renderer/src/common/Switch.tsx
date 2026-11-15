export function Switch({
  label,
  checked,
  onChange,
  disabled
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`switch${checked ? ' switch--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__label">{label}</span>
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
    </button>
  )
}
