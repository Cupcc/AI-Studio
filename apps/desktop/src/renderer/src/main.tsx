import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { installSessionIntegration } from './features/session/integration'
import './styles/tokens.css'
import './styles/base.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

// Register Session slots and subscriptions once, before Project bootstrap.
const disposeSessionIntegration = installSessionIntegration()
if (import.meta.hot) import.meta.hot.dispose(disposeSessionIntegration)

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
