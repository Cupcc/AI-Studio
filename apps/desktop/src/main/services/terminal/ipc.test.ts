import { expect, it, vi } from 'vitest'
import type { CoreServices } from '../core'
import { createTerminalFeature } from '../../ipc/terminal'

const service = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), attach: vi.fn(), detach: vi.fn(), ack: vi.fn(),
  input: vi.fn(), resize: vi.fn(), close: vi.fn(), dispose: vi.fn()
}))
vi.mock('./index', () => ({ terminalFor: () => service }))

const feature = createTerminalFeature({} as CoreServices)
const ref = { projectId: 'project', terminalId: 'terminal', generation: 1 }

it('rejects arbitrary shell/process/path fields and unsafe dimensions before reaching the service', () => {
  for (const request of [
    { projectId: 'project', cols: 80, rows: 24, shell: '/tmp/arbitrary' },
    { projectId: 'project', cols: 80, rows: 24, cwd: '/outside/project' },
    { projectId: 'project', cols: 1e9, rows: 24 },
    { projectId: 'project', cols: 80.5, rows: 24 },
    { projectId: 'project', cols: 80, rows: 0 }
  ]) expect(() => feature.handlers.create.parse(request)).toThrow()
  expect(() => feature.handlers.close.parse({ ...ref, confirmed: true, pid: 123 })).toThrow('Unexpected field')
  expect(() => feature.handlers.input.parse({ ...ref, data: 'x', projectId: '' })).toThrow('too short')
  expect(() => feature.handlers.attach.parse({ ...ref, generation: 0 })).toThrow('positive')
  expect(service.create).not.toHaveBeenCalled()
})

it('routes attachment operations with trusted sender identity and validates ACKs', async () => {
  const request = { ...ref, attachmentId: 'attachment', sequence: 4 }
  const context = { senderId: 71, senderUrl: 'app://studio' }
  await feature.handlers.attach.handle(ref, context)
  await feature.handlers.ack.handle(feature.handlers.ack.parse(request), context)
  await feature.handlers.detach.handle({ ...ref, attachmentId: 'attachment' }, context)
  expect(service.attach).toHaveBeenCalledWith(ref, 71)
  expect(service.ack).toHaveBeenCalledWith(request, 71)
  expect(service.detach).toHaveBeenCalledWith({ ...ref, attachmentId: 'attachment' }, 71)
  expect(() => feature.handlers.ack.parse({ ...request, sequence: NaN })).toThrow('integer')
  expect(() => feature.handlers.ack.parse({ ...request, sequence: -1 })).toThrow('integer')
})
