import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { installSessionIntegration } from './features/session/integration'
import { installProjectViewIntegration } from './features/project-view/integration'
import { installSettingsIntegration } from './features/settings/integration'
import { installToolsIntegration } from './features/tools/integration'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

// Register Session slots and subscriptions once, before Project bootstrap.
const disposeSessionIntegration = installSessionIntegration()
const disposeProjectViewIntegration = installProjectViewIntegration()
const disposeToolsIntegration = installToolsIntegration()
if (import.meta.hot) import.meta.hot.dispose(disposeToolsIntegration)
if (import.meta.hot) import.meta.hot.dispose(disposeProjectViewIntegration)
if (import.meta.hot) import.meta.hot.dispose(disposeSessionIntegration)
const settings = installSettingsIntegration()
if (import.meta.hot) import.meta.hot.dispose(settings.dispose)

// Render once the saved appearance is on <html>, so the first frame never shows the other theme (FR-SET-002).
void settings.ready.then(() => createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
))
