// Registers all feature handlers. Adding a feature = one line in the list
// below (plus its contract line in src/shared/ipc/contracts.ts).
import { contracts } from '@shared/ipc/contracts'
import type { CoreServices } from '../services/core'
import { createAppFeature } from './app'
import { createProjectViewFeature } from './project-view'
import { createProjectFeature } from './project'
import { isSessionWindowForeground, createSessionFeature, type SessionFeatureOptions } from './session'
import { createSettingsFeature } from './settings'
import { createBrowserFeature } from './browser'
import { createTerminalFeature } from './terminal'
import { createFilesFeature } from './files'
import { createDiffFeature } from './diff'
import { createMenuFeature } from './menu'
import { createSearchFeature } from './search'
import { projectShellFor } from '../services/project'
import { terminalFor } from '../services/terminal'
import { browserFor } from '../services/browser'
import { filesFor } from '../services/files'
import { diffFor } from '../services/diff'
import { searchFor } from '../services/search'
import { registerFeatureHandlers, type FeatureHandlers, type MainIpc } from './registry'

/** Every cleanup is attempted; failures are reported together so one stuck tool cannot skip the others. */
async function attemptAll(message: string, operations: (() => Promise<void>)[]): Promise<void> {
  const results = await Promise.allSettled(operations.map(operation => operation()))
  const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
  if (errors.length) throw new AggregateError(errors, `${message}: ${errors.map(error => error instanceof Error ? error.message : String(error)).join('; ')}`)
}

export function createFeatures(core: CoreServices, sessionOptions: SessionFeatureOptions = {}): FeatureHandlers[] {
  const terminal = terminalFor(core), browser = browserFor(core), files = filesFor(core), diff = diffFor(core), search = searchFor(core), shell = projectShellFor(core)
  shell.toolsChanged = () => browser.syncVisibility()
  shell.setToolPort({
    activeTerminals: projectId => terminal.activeTerminals(projectId).map(item => ({
      kind: 'terminal' as const, id: item.terminalId, projectId: item.projectId, title: item.title
    })),
    closeProject: projectId => attemptAll('Project 工具清理失败', [
      async () => { await terminal.closeProject(projectId); await browser.close(projectId) },
      () => files.closeProject(projectId),
      () => diff.closeProject(projectId),
      () => search.closeProject(projectId)
    ]),
    closeAll: () => attemptAll('工具清理失败', [
      async () => { await terminal.closeAll(); await browser.closeAll() },
      () => files.closeAll(),
      () => diff.closeAll()
    ])
  })
  return [
    createAppFeature(core, sessionOptions.isForeground ?? isSessionWindowForeground),
    createProjectFeature(core),
    createProjectViewFeature(core),
    createSessionFeature(core, { ...sessionOptions, fileReferences: sessionOptions.fileReferences ?? files }),
    createSettingsFeature(core),
    createBrowserFeature(core),
    createTerminalFeature(core),
    createFilesFeature(core),
    createDiffFeature(core),
    createMenuFeature(),
    createSearchFeature(core)
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
  return createFeatureDisposer(features, unregister)
}

/** Successful disposers run once; failures retain their exact service for another quit attempt. */
export function createFeatureDisposer(features: readonly FeatureHandlers[], unregister: () => void): () => Promise<void> {
  let disposal: Promise<void> | undefined
  const completed = new Set<FeatureHandlers>()
  return () => {
    if (disposal) return disposal
    const pending = (async () => {
    const errors: unknown[] = []
    for (const feature of [...features].reverse()) {
      if (completed.has(feature)) continue
      try { await feature.dispose?.(); completed.add(feature) } catch (error) { errors.push(error) }
    }
    if (errors.length) throw new AggregateError(errors, 'Feature cleanup failed')
    unregister()
    })()
    disposal = pending
    void pending.catch(() => { if (disposal === pending) disposal = undefined })
    return pending
  }
}
