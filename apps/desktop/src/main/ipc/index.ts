// Registers all feature handlers. Adding a feature = one line in the list
// below (plus its contract line in src/shared/ipc/contracts.ts).
import { contracts } from '@shared/ipc/contracts'
import type { CoreServices } from '../services/core'
import { createAppFeature } from './app'
import { createProjectViewFeature } from './project-view'
import { createProjectFeature } from './project'
import { createSessionFeature, type SessionFeatureOptions } from './session'
import { createSettingsFeature } from './settings'
import { createBrowserFeature } from './browser'
import { createTerminalFeature } from './terminal'
import { projectShellFor } from '../services/project'
import { terminalFor } from '../services/terminal'
import { browserFor } from '../services/browser'
import { registerFeatureHandlers, type FeatureHandlers, type MainIpc } from './registry'

export function createFeatures(core: CoreServices, sessionOptions: SessionFeatureOptions = {}): FeatureHandlers[] {
  const terminal = terminalFor(core), browser = browserFor(core), shell = projectShellFor(core)
  shell.toolsChanged = () => browser.syncVisibility()
  shell.setToolPort({
    activeTerminals: projectId => terminal.activeTerminals(projectId).map(item => ({
      kind: 'terminal' as const, id: item.terminalId, projectId: item.projectId, title: item.title
    })),
    closeProject: async projectId => { await terminal.closeProject(projectId); await browser.close(projectId) },
    closeAll: async () => { await terminal.closeAll(); await browser.closeAll() }
  })
  return [
    createAppFeature(core),
    createProjectFeature(core),
    createProjectViewFeature(core),
    createSessionFeature(core, sessionOptions),
    createSettingsFeature(core),
    createBrowserFeature(core),
    createTerminalFeature(core)
  ]
}

export function registerIpc(
  ipc: MainIpc,
  core: CoreServices,
  isTrustedSender: (url: string) => boolean,
  sessionOptions: SessionFeatureOptions = {}
): () => Promise<void> {
  const features = createFeatures(core, sessionOptions)
  const unregister = registerFeatureHandlers(ipc, contracts, features, {
    isTrustedSender,
    onError: (channel, error) => {
      console.error(`[ipc] ${channel} failed:`, error instanceof Error ? error.message : error)
    }
  })
  let disposal: Promise<void> | undefined
  return () => disposal ??= (async () => {
    unregister()
    const errors: unknown[] = []
    for (const feature of [...features].reverse()) {
      try { await feature.dispose?.() } catch (error) { errors.push(error) }
    }
    if (errors.length) throw new AggregateError(errors, 'Feature cleanup failed')
  })()
}
