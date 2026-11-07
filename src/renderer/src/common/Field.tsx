import { useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from 'react'

interface FieldProps {
  label: string
  htmlFor?: string
  error?: string | null
  hint?: ReactNode
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, error, hint, children, className }: FieldProps): React.JSX.Element {
  return (
    <div className={`field${error ? ' field--error' : ''}${className ? ` ${className}` : ''}`}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <span className="field__error">{error}</span> : null}
      {!error && hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  const { className, ...rest } = props
  return <input {...rest} className={`field__control${className ? ` ${className}` : ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  const { className, ...rest } = props
  return <textarea {...rest} className={`field__control${className ? ` ${className}` : ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  const { className, children, ...rest } = props
  return (
    <select {...rest} className={`field__control${className ? ` ${className}` : ''}`}>
      {children}
    </select>
  )
}

interface CheckboxFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  hint?: string
}

export function CheckboxField({ label, checked, onChange, disabled, hint }: CheckboxFieldProps): React.JSX.Element {
  const id = useId()
  return (
    <div className="field field--checkbox">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label className="field__label" htmlFor={id}>
        {label}
        {hint ? <span className="field__hint"> {hint}</span> : null}
      </label>
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="search-input">
      <span className="search-input__icon" aria-hidden="true">
        ⌕
      </span>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field__control"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button type="button" className="search-input__clear" aria-label="Xóa tìm kiếm" onClick={() => onChange('')}>
          ✕
        </button>
      ) : null}
    </div>
  )
}
