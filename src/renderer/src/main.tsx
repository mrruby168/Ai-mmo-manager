import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { RendererApi } from '@shared/types'
import App from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

declare global {
  interface Window {
    api: RendererApi
  }
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Missing #root container')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
