// Handlers for the `updates` feature (specs/settings/spec.md "关于与更新").
import { updatesContract, type SetAutomaticRequest } from '@shared/ipc/updates'
import type { CoreServices } from '../services/core'
import { updatesFor, type UpdateService } from '../services/updates'
import { defineHandlers, IpcValidationError } from './registry'
import { expectOnlyKeys, expectRecord, noInput } from './validate'

function parseSetAutomatic(raw: unknown): SetAutomaticRequest {
  const input = expectRecord(raw)
  expectOnlyKeys(input, ['enabled'])
  if (typeof input.enabled !== 'boolean') throw new IpcValidationError('enabled must be a boolean')
  return { enabled: input.enabled }
}

export function createUpdatesFeature(core: Pick<CoreServices, 'database' | 'broadcast'>, service: UpdateService = updatesFor(core)) {
  const unsubscribe = service.subscribe(state => core.broadcast(updatesContract.events.stateChanged, state))
  return defineHandlers(updatesContract, {
    getState: { parse: noInput, handle: () => service.state() },
    check: { parse: noInput, handle: () => service.check() },
    restartToUpdate: { parse: noInput, handle: () => service.restartToUpdate() },
    setAutomatic: { parse: parseSetAutomatic, handle: ({ enabled }) => service.setAutomatic(enabled) }
  }, async () => { unsubscribe(); service.dispose() })
}
