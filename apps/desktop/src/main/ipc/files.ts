import { filesContract } from '@shared/ipc/files'
import { FILES_LIMITS, parseProjectPath, type FileReadRequest, type ProjectPath } from '@shared/tools/files'
import type { CoreServices } from '../services/core'
import { filesFor } from '../services/files'
import { defineHandlers, IpcValidationError } from './registry'
import { expectOnlyKeys, expectRecord, expectString } from './validate'

const IF_VERSION_LIMIT = 200

function record(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  const value = expectRecord(raw)
  expectOnlyKeys(value, keys)
  return value
}

function projectId(raw: Record<string, unknown>): string {
  return expectString(raw.projectId, 'projectId', { minLength: 1, maxLength: 100 })
}

/** Renderer input is only ever a Project-relative path; the shared parser rejects everything else. */
function projectPath(value: unknown, field = 'path'): ProjectPath {
  // The character limit is cheap and bounds the byte-length check inside parseProjectPath.
  const text = expectString(value, field, { maxLength: FILES_LIMITS.pathBytes })
  try { return parseProjectPath(text) } catch (error) {
    throw new IpcValidationError(error instanceof Error ? error.message : 'invalid path')
  }
}

export function createFilesFeature(core: CoreServices) {
  const service = filesFor(core)
  return defineHandlers(filesContract, {
    list: {
      parse: (raw) => { const value = record(raw, ['projectId', 'path']); return { projectId: projectId(value), path: projectPath(value.path) } },
      handle: ({ projectId: id, path }) => service.list(id, path)
    },
    read: {
      parse: (raw): FileReadRequest => {
        const value = record(raw, ['projectId', 'path', 'ifVersion'])
        const ifVersion = value.ifVersion === undefined ? undefined : expectString(value.ifVersion, 'ifVersion', { minLength: 1, maxLength: IF_VERSION_LIMIT })
        return { projectId: projectId(value), path: projectPath(value.path), ...(ifVersion === undefined ? {} : { ifVersion }) }
      },
      handle: (request) => service.read(request)
    },
    resolveReference: {
      parse: (raw) => {
        const value = record(raw, ['projectId', 'paths'])
        if (!Array.isArray(value.paths) || value.paths.length < 1 || value.paths.length > FILES_LIMITS.referencesPerMessage) {
          throw new IpcValidationError(`paths must hold 1 to ${FILES_LIMITS.referencesPerMessage} entries`)
        }
        // Array.from visits the holes of a sparse array (structured clone keeps them): each hole is rejected as a non-string.
        const paths = Array.from(value.paths as unknown[], (path, index) => projectPath(path, `paths[${index}]`))
        return { projectId: projectId(value), paths }
      },
      handle: ({ projectId: id, paths }) => service.resolveReference(id, paths)
    },
    subscribe: {
      parse: (raw) => ({ projectId: projectId(record(raw, ['projectId'])) }),
      handle: ({ projectId: id }, context) => service.subscribe(id, context.senderId)
    },
    unsubscribe: {
      parse: (raw) => {
        const value = record(raw, ['projectId', 'subscriptionId'])
        return { projectId: projectId(value), subscriptionId: expectString(value.subscriptionId, 'subscriptionId', { minLength: 1, maxLength: 100 }) }
      },
      handle: ({ projectId: id, subscriptionId }, context) => service.unsubscribe(id, subscriptionId, context.senderId)
    }
  }, () => service.dispose())
}
