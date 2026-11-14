import { filesContract } from '@shared/ipc/files'
import {
  FILES_LIMITS, FILES_OPERATION_LIMITS, FILES_STAT_LIMIT, FILES_UNSAVED_LIMIT, parseProjectPath,
  type FileEncoding, type FileOpenTarget, type FileReadRequest, type FilesPreferences, type FileWriteRequest, type ProjectPath
} from '@shared/tools/files'
import type { CoreServices } from '../services/core'
import { filesFor } from '../services/files'
import { readFilesPreferences, writeFilesPreferences } from '../services/files/preferences'
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
const ENCODINGS: readonly FileEncoding[] = ['utf-8', 'utf-16le', 'utf-16be']
const PREFERENCES: readonly (keyof FilesPreferences)[] = ['markdownPreview', 'wordWrap']

function writeRequest(raw: unknown): FileWriteRequest {
  const value = record(raw, ['projectId', 'path', 'text', 'expectedVersion', 'encoding', 'bom'])
  // Every UTF-16 code unit takes at least one byte, so this bounds the clone; the encoded size is checked by the writer.
  if (typeof value.text !== 'string' || value.text.length > FILES_LIMITS.readBytes) throw new IpcValidationError(`text must be a string of at most ${FILES_LIMITS.readBytes} characters`)
  const expectedVersion = value.expectedVersion === null ? null : expectString(value.expectedVersion, 'expectedVersion', { minLength: 1, maxLength: IF_VERSION_LIMIT })
  if (!ENCODINGS.includes(value.encoding as FileEncoding)) throw new IpcValidationError('Unknown encoding')
  if (typeof value.bom !== 'boolean') throw new IpcValidationError('bom must be a boolean')
  // UTF-16 is only ever read with a BOM (read.ts), so it is written with one.
  if (value.encoding !== 'utf-8' && !value.bom) throw new IpcValidationError('UTF-16 is written with its BOM')
  const path = projectPath(value.path)
  if (path === '') throw new IpcValidationError('path must name a file')
  return { projectId: projectId(value), path, text: value.text, expectedVersion, encoding: value.encoding as FileEncoding, bom: value.bom }
}

function preferencesPatch(raw: unknown): Partial<FilesPreferences> {
  const value = record(raw, PREFERENCES)
  const patch: Partial<FilesPreferences> = {}
  for (const name of PREFERENCES) {
    if (value[name] === undefined) continue
    if (typeof value[name] !== 'boolean') throw new IpcValidationError(`${name} must be a boolean`)
    patch[name] = value[name] as boolean
  }
  return patch
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
    readImage: {
      parse: (raw) => { const value = record(raw, ['projectId', 'path']); return { projectId: projectId(value), path: projectPath(value.path) } },
      handle: ({ projectId: id, path }) => service.readImage(id, path)
    },
    write: { parse: writeRequest, handle: (request) => service.write(request) },
    setUnsaved: {
      parse: (raw) => {
        const value = record(raw, ['projectId', 'paths'])
        if (!Array.isArray(value.paths) || value.paths.length > FILES_UNSAVED_LIMIT) throw new IpcValidationError(`paths must hold at most ${FILES_UNSAVED_LIMIT} entries`)
        return { projectId: projectId(value), paths: Array.from(value.paths as unknown[], (path, index) => projectPath(path, `paths[${index}]`)) }
      },
      handle: ({ projectId: id, paths }, context) => service.setUnsaved(id, paths, context.senderId)
    },
    preferences: { parse: noInput, handle: () => readFilesPreferences(core.database().db) },
    setPreferences: { parse: preferencesPatch, handle: (patch) => writeFilesPreferences(core.database().db, patch) },
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
