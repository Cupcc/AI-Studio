import overview from './resources/overview.view.json'
import progress from './resources/progress.view.json'
import architecture from './resources/architecture.view.json'
import agentTeam from './resources/agent-team.view.json'
import businessFlow from './resources/business-flow.view.json'
import { parseDefinition } from './schema'
import { VIEW_CATALOG } from './types'

// Versioned JSON resources are bundled by Vite; project copies never define validation.
export const DEFAULT_DEFINITIONS = new Map(
  [overview, progress, architecture, agentTeam, businessFlow].map(doc => [doc.viewId, parseDefinition(doc, doc.viewId)])
)
export function catalogEntry(viewId: string) {
  const entry = VIEW_CATALOG.find(entry => entry.id === viewId)
  if (!entry) throw new Error('Unknown View')
  return entry
}
