import { terminalContract } from '@shared/ipc/terminal'
import type { TerminalAttachment, TerminalRef } from '@shared/tools/terminal'
import type { CoreServices } from '../services/core'
import { terminalFor } from '../services/terminal'
import { terminalDimensions, TERMINAL_INPUT_LIMIT } from '../services/terminal/service'
import { defineHandlers, IpcValidationError } from './registry'
import { expectOnlyKeys, expectRecord, expectString } from './validate'

function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new IpcValidationError(`${field} must be a nonnegative integer`)
  return value
}

function project(raw: Record<string, unknown>): { projectId: string } {
  return { projectId: expectString(raw.projectId, 'projectId', { minLength: 1, maxLength: 100 }) }
}

function reference(raw: Record<string, unknown>): TerminalRef {
  const generation = integer(raw.generation, 'generation')
  if (!generation) throw new IpcValidationError('generation must be positive')
  return { ...project(raw), terminalId: expectString(raw.terminalId, 'terminalId', { minLength: 1, maxLength: 100 }), generation }
}

function attachment(raw: Record<string, unknown>): TerminalAttachment {
  return { ...reference(raw), attachmentId: expectString(raw.attachmentId, 'attachmentId', { minLength: 1, maxLength: 100 }) }
}

function dimensions(raw: Record<string, unknown>): { cols: number; rows: number } {
  const cols = integer(raw.cols, 'cols'), rows = integer(raw.rows, 'rows')
  terminalDimensions(cols, rows)
  return { cols, rows }
}

function record(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  const value = expectRecord(raw)
  expectOnlyKeys(value, keys)
  return value
}

const refKeys = ['projectId', 'terminalId', 'generation']
const attachmentKeys = [...refKeys, 'attachmentId']

export function createTerminalFeature(core: CoreServices) {
  const service = terminalFor(core)
  return defineHandlers(terminalContract, {
    list: { parse: (raw) => project(record(raw, ['projectId'])), handle: ({ projectId }) => service.list(projectId) },
    create: { parse: (raw) => { const value = record(raw, ['projectId', 'cols', 'rows']); return { ...project(value), ...dimensions(value) } }, handle: (request) => service.create(request) },
    attach: { parse: (raw) => reference(record(raw, refKeys)), handle: (request, ctx) => service.attach(request, ctx.senderId) },
    detach: { parse: (raw) => attachment(record(raw, attachmentKeys)), handle: (request, ctx) => service.detach(request, ctx.senderId) },
    ack: { parse: (raw) => { const value = record(raw, [...attachmentKeys, 'sequence']); return { ...attachment(value), sequence: integer(value.sequence, 'sequence') } }, handle: (request, ctx) => service.ack(request, ctx.senderId) },
    input: { parse: (raw) => { const value = record(raw, [...refKeys, 'data']); return { ...reference(value), data: expectString(value.data, 'data', { minLength: 1, maxLength: TERMINAL_INPUT_LIMIT }) } }, handle: (request) => service.input(request, request.data) },
    resize: { parse: (raw) => { const value = record(raw, [...refKeys, 'cols', 'rows']); return { ...reference(value), ...dimensions(value) } }, handle: (request) => service.resize(request, request.cols, request.rows) },
    close: { parse: (raw) => { const value = record(raw, [...refKeys, 'confirmed']); if (typeof value.confirmed !== 'boolean') throw new IpcValidationError('confirmed must be boolean'); return { ...reference(value), confirmed: value.confirmed } }, handle: (request) => service.close(request, request.confirmed) }
  }, () => service.dispose())
}
