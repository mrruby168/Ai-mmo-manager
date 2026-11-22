import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { RendererApi } from '@shared/types'
import App from './App'
import { ErrorBoundary } from './common/ErrorBoundary'
import { applyTheme, readThemeMode } from './state/theme'
import { ThemeProvider } from './state/ThemeProvider'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/motion.css'

declare global {
  interface Window {
    api: RendererApi
  }
}

applyTheme(readThemeMode())

const container = document.getElementById('root')
if (!container) {
  throw new Error('Missing #root container')
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)
