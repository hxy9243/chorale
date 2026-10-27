import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './index.css'
import './styles/controls.css'
import './chorale-theme.css'
import './styles/workspace-responsive.css'
import './styles/waterfall.css'
import './styles/workspace-split-stack.css'
import './styles/recital.css'
import { applyAppearance, readAppearance } from './utils/appearance'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

applyAppearance(readAppearance())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
