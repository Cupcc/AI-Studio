import { diffContract } from '@shared/ipc/diff'
import { parseProjectPath, type ProjectPath } from '@shared/tools/files'
import type { CoreServices } from '../services/core'
import { diffFor } from '../services/diff'
import { defineHandlers, IpcValidationError } from './registry'
import { expectOnlyKeys, expectRecord, expectString } from './validate'

function project(value: Record<string, unknown>): string {
  return expectString(value.projectId, 'projectId', { minLength: 1, maxLength: 100 })
}

/** A file path of a change: a valid ProjectPath that is not the Project root. */
function filePath(value: unknown, field: string): ProjectPath {
  try {
    const path = parseProjectPath(value)
    if (path === '') throw new Error('invalid path: empty')
    return path
  } catch (error) {
    throw new IpcValidationError(`${field}: ${error instanceof Error ? error.message : 'invalid path'}`)
  }
}

function record(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  const value = expectRecord(raw)
  expectOnlyKeys(value, keys)
  return value
}

export function createDiffFeature(core: CoreServices) {
  const service = diffFor(core)
  return defineHandlers(diffContract, {
    getSnapshot: {
      parse: (raw) => ({ projectId: project(record(raw, ['projectId'])) }),
      handle: ({ projectId }) => service.getSnapshot(projectId)
    },
    getFile: {
      parse: (raw) => {
        const value = record(raw, ['projectId', 'path', 'oldPath'])
        // `oldPath` is part of the request shape: null for a change that has no rename / copy source.
        if (!('oldPath' in value)) throw new IpcValidationError('oldPath is required (null when there is none)')
        return {
          projectId: project(value), path: filePath(value.path, 'path'),
          oldPath: value.oldPath === null ? null : filePath(value.oldPath, 'oldPath')
        }
      },
      handle: (request) => service.getFile(request)
    },
    subscribe: {
      parse: (raw) => ({ projectId: project(record(raw, ['projectId'])) }),
      handle: ({ projectId }, context) => service.subscribe(projectId, context.senderId)
    },
    unsubscribe: {
      parse: (raw) => {
        const value = record(raw, ['projectId', 'subscriptionId'])
        return { projectId: project(value), subscriptionId: expectString(value.subscriptionId, 'subscriptionId', { minLength: 1, maxLength: 100 }) }
      },
      handle: ({ projectId, subscriptionId }, context) => service.unsubscribe(projectId, subscriptionId, context.senderId)
    }
  }, () => service.dispose())
}
