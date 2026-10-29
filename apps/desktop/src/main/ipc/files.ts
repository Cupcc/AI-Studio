import { filesContract } from '@shared/ipc/files'
import { FILES_LIMITS, FILES_OPERATION_LIMITS, FILES_STAT_LIMIT, parseProjectPath, type FileOpenTarget, type FileReadRequest, type ProjectPath } from '@shared/tools/files'
import type { CoreServices } from '../services/core'
import { filesFor } from '../services/files'
import { defineHandlers, IpcValidationError } from './registry'
import { expectOnlyKeys, expectRecord, expectString, noInput } from './validate'

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

function projectPaths(value: unknown): ProjectPath[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > FILES_OPERATION_LIMITS.pathsPerOperation) {
    throw new IpcValidationError(`paths must hold 1 to ${FILES_OPERATION_LIMITS.pathsPerOperation} entries`)
  }
  return Array.from(value as unknown[], (path, index) => projectPath(path, `paths[${index}]`))
}

/** A new name; checked again (separators, `.git`, control characters) by the operation itself. */
function newName(value: unknown, allowNested = false): string {
  const name = expectString(value, 'name', { minLength: 1, maxLength: allowNested ? FILES_LIMITS.pathBytes : 255 })
  if (!allowNested && name.includes('/')) throw new IpcValidationError('name must not contain "/"')
  return name
}

const OPEN_TARGETS: readonly FileOpenTarget[] = ['default', 'finder', 'vscode', 'cursor']

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
    readImage: {
      parse: (raw) => { const value = record(raw, ['projectId', 'path']); return { projectId: projectId(value), path: projectPath(value.path) } },
      handle: ({ projectId: id, path }) => service.readImage(id, path)
    },
    create: {
      parse: (raw) => {
        const value = record(raw, ['projectId', 'parent', 'name', 'kind'])
        if (value.kind !== 'file' && value.kind !== 'directory') throw new IpcValidationError('kind must be file or directory')
        return { projectId: projectId(value), parent: projectPath(value.parent, 'parent'), name: newName(value.name, true), kind: value.kind as 'file' | 'directory' }
      },
      handle: ({ projectId: id, parent, name, kind }) => service.create(id, parent, name, kind)
    },
    rename: {
      parse: (raw) => { const value = record(raw, ['projectId', 'path', 'name']); return { projectId: projectId(value), path: projectPath(value.path), name: newName(value.name) } },
      handle: ({ projectId: id, path, name }) => service.rename(id, path, name)
    },
    move: {
      parse: (raw) => { const value = record(raw, ['projectId', 'paths', 'target']); return { projectId: projectId(value), paths: projectPaths(value.paths), target: projectPath(value.target, 'target') } },
      handle: ({ projectId: id, paths, target }) => service.move(id, paths, target)
    },
    copy: {
      parse: (raw) => { const value = record(raw, ['projectId', 'paths', 'target']); return { projectId: projectId(value), paths: projectPaths(value.paths), target: projectPath(value.target, 'target') } },
      handle: ({ projectId: id, paths, target }) => service.copy(id, paths, target)
    },
    trash: {
      parse: (raw) => { const value = record(raw, ['projectId', 'paths']); return { projectId: projectId(value), paths: projectPaths(value.paths) } },
      handle: ({ projectId: id, paths }) => service.trash(id, paths)
    },
    open: {
      parse: (raw) => {
        const value = record(raw, ['projectId', 'path', 'target', 'line'])
        if (!OPEN_TARGETS.includes(value.target as FileOpenTarget)) throw new IpcValidationError('Unknown open target')
        if (value.line !== undefined && (typeof value.line !== 'number' || !Number.isSafeInteger(value.line) || value.line < 1)) throw new IpcValidationError('line must be a positive integer')
        return { projectId: projectId(value), path: projectPath(value.path), target: value.target as FileOpenTarget, ...(value.line === undefined ? {} : { line: value.line as number }) }
      },
      handle: (request) => service.open(request)
    },
    editors: { parse: noInput, handle: () => service.editors() },
    stat: {
      parse: (raw) => {
        const value = record(raw, ['projectId', 'paths'])
        if (!Array.isArray(value.paths) || value.paths.length < 1 || value.paths.length > FILES_STAT_LIMIT) throw new IpcValidationError(`paths must hold 1 to ${FILES_STAT_LIMIT} entries`)
        return { projectId: projectId(value), paths: Array.from(value.paths as unknown[], (path, index) => projectPath(path, `paths[${index}]`)) }
      },
      handle: ({ projectId: id, paths }) => service.stat(id, paths)
    },
    index: {
      parse: (raw) => ({ projectId: projectId(record(raw, ['projectId'])) }),
      handle: ({ projectId: id }) => service.index(id)
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
