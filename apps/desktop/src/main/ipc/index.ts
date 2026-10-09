// Registers all feature handlers. Adding a feature = one line in the list
// below (plus its contract line in src/shared/ipc/contracts.ts).
import { contracts } from '@shared/ipc/contracts'
import type { CoreServices } from '../services/core'
import { createAppFeature } from './app'
import { createProjectFeature } from './project'
import { createSessionFeature, type SessionFeatureOptions } from './session'
import { registerFeatureHandlers, type FeatureHandlers, type MainIpc } from './registry'

export function createFeatures(core: CoreServices, sessionOptions: SessionFeatureOptions = {}): FeatureHandlers[] {
  return [
    createAppFeature(core),
    createProjectFeature(core),
    createSessionFeature(core, sessionOptions)
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
