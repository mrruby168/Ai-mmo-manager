import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { computePopupRect, edgeIndex, nextIndex, typeaheadMatch } from '@shared/listbox'
import type { PopupRect } from '@shared/listbox'

export interface ListboxOption {
  value: string
  label: string
  badge?: string | null
  icon?: ReactNode
  /** Mục đã dùng ở ô khác (Model Configuration): vẫn hiện nhưng không chọn được. */
  disabled?: boolean
}

export interface ListboxProps {
  options: ListboxOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  title?: string
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function Listbox({
  options,
  value,
  onChange,
  ariaLabel,
  label,
  placeholder = 'Chọn…',
  disabled = false,
  className,
  title
}: ListboxProps): React.JSX.Element {
  const baseId = useId()
  const listId = `${baseId}-listbox`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const typedRef = useRef('')
  const typedTimer = useRef<number | null>(null)

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [popupRect, setPopupRect] = useState<PopupRect | null>(null)

  const selected = options.find((option) => option.value === value) ?? null

  useEffect(() => {
    if (!open) {
      setPopupRect(null)
      return
    }

    const selectedIndex = options.findIndex((option) => option.value === value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.length > 0 ? 0 : -1)
    // Chỉ chạy khi mở/đổi giá trị; đổi options.length do effect vị trí bên dưới xử lý.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value])

  useEffect(() => {
    if (!open) {
      return
    }

    const update = (): void => {
      const trigger = triggerRef.current
      if (!trigger) {
        return
      }
      const rect = trigger.getBoundingClientRect()
      const estimatedHeight = Math.min(options.length * 34 + 10, 280)
      setPopupRect(
        computePopupRect(
          { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width },
          estimatedHeight,
          { viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }
        )
      )
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open) {
      return
    }
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node | null
      if (!target) {
        return
      }
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open || !popupRef.current) {
      return
    }
    const element = popupRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    element?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  useEffect(() => {
    return () => {
      if (typedTimer.current !== null) {
        window.clearTimeout(typedTimer.current)
      }
    }
  }, [])

  function close(): void {
    setOpen(false)
  }

  function choose(index: number): void {
    const option = options[index]
    if (!option || option.disabled) {
      return
    }
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function runTypeahead(key: string): void {
    typedRef.current += key.toLowerCase()
    if (typedTimer.current !== null) {
      window.clearTimeout(typedTimer.current)
    }
    typedTimer.current = window.setTimeout(() => {
      typedRef.current = ''
    }, 600)
    const index = typeaheadMatch(
      options.map((option) => option.label),
      typedRef.current,
      activeIndex
    )
    if (index >= 0) {
      setActiveIndex(index)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (disabled) {
      return
    }

    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setOpen(true)
      }
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((current) => nextIndex(current, options.length, 1))
        return
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((current) => nextIndex(current, options.length, -1))
        return
      case 'Home':
        event.preventDefault()
        setActiveIndex(edgeIndex(options.length, 'first'))
        return
      case 'End':
        event.preventDefault()
        setActiveIndex(edgeIndex(options.length, 'last'))
        return
      case 'Enter':
        event.preventDefault()
        choose(activeIndex)
        return
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      case 'Tab':
        close()
        return
      default:
        break
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      runTypeahead(event.key)
    }
  }

  return (
    <div className={`listbox${className ? ` ${className}` : ''}`}>
      {label ? <span className="listbox__label">{label}</span> : null}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        className="listbox__trigger"
        title={title ?? selected?.label ?? placeholder}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        {selected?.icon ? <span className="listbox__trigger-icon">{selected.icon}</span> : null}
        <span className={`listbox__trigger-label${selected ? '' : ' listbox__trigger-label--placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.badge ? <span className="listbox__trigger-badge">{selected.badge}</span> : null}
        <span className="listbox__chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>

      {open && popupRect
        ? createPortal(
            <div
              ref={popupRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="listbox__popup"
              style={{
                top: popupRect.top,
                left: popupRect.left,
                width: popupRect.width,
                maxHeight: popupRect.maxHeight
              }}
            >
              {options.length === 0 ? (
                <div className="listbox__empty">Không có lựa chọn</div>
              ) : (
                options.map((option, index) => {
                  const isSelected = option.value === value
                  return (
                    <div
                      key={option.value}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      data-index={index}
                      className={`listbox__option${index === activeIndex ? ' listbox__option--active' : ''}${
                        option.disabled ? ' listbox__option--disabled' : ''
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(index)}
                    >
                      <span className="listbox__check" aria-hidden="true">
                        {isSelected ? '✓' : ''}
                      </span>
                      {option.icon ? <span className="listbox__option-icon">{option.icon}</span> : null}
                      <span className="listbox__option-label" title={option.label}>
                        {option.label}
                      </span>
                      {option.badge ? <span className="listbox__option-badge">{option.badge}</span> : null}
                    </div>
                  )
                })
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
