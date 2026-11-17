import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../state/ThemeProvider'
import type { ThemeMode } from '../state/theme'

const OPTIONS: { mode: ThemeMode; label: string; icon: React.JSX.Element }[] = [
  { mode: 'light', label: 'Sáng', icon: <Sun size={16} strokeWidth={1.75} /> },
  { mode: 'dark', label: 'Tối', icon: <Moon size={16} strokeWidth={1.75} /> },
  { mode: 'system', label: 'Theo hệ thống', icon: <Monitor size={16} strokeWidth={1.75} /> }
]

export function ThemeToggle(): React.JSX.Element {
  const { mode, setMode } = useTheme()
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Giao diện sáng hoặc tối">
      {OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          role="radio"
          aria-checked={mode === option.mode}
          aria-label={option.label}
          title={option.label}
          className={`theme-toggle__item${mode === option.mode ? ' theme-toggle__item--active' : ''}`}
          onClick={() => setMode(option.mode)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  )
}
