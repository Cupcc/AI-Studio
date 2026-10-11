import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { installSessionIntegration } from './features/session/integration'
import { installProjectViewIntegration } from './features/project-view/integration'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

// Register Session slots and subscriptions once, before Project bootstrap.
const disposeSessionIntegration = installSessionIntegration()
const disposeProjectViewIntegration = installProjectViewIntegration()
if (import.meta.hot) import.meta.hot.dispose(disposeProjectViewIntegration)
if (import.meta.hot) import.meta.hot.dispose(disposeSessionIntegration)

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
