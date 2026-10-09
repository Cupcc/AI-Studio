// Registers all feature handlers. Adding a feature = one line in the list
// below (plus its contract line in src/shared/ipc/contracts.ts).
import { contracts } from '@shared/ipc/contracts'
import type { CoreServices } from '../services/core'
import { createAppFeature } from './app'
import { registerFeatureHandlers, type FeatureHandlers, type MainIpc } from './registry'

export function createFeatures(core: CoreServices): FeatureHandlers[] {
  return [
    createAppFeature(core)
  ]
}

export function registerIpc(
  ipc: MainIpc,
  core: CoreServices,
  isTrustedSender: (url: string) => boolean
): () => Promise<void> {
  const features = createFeatures(core)
  const unregister = registerFeatureHandlers(ipc, contracts, features, {
    isTrustedSender,
    onError: (channel, error) => {
      console.error(`[ipc] ${channel} failed:`, error instanceof Error ? error.message : error)
    }
  })
  return async () => {
    unregister()
    for (const feature of features) await feature.dispose?.()
  }
}
