import { expect, it, vi } from 'vitest'
import type { CoreServices } from '../core'
import { createDiffFeature } from '../../ipc/diff'

const service = vi.hoisted(() => ({ getSnapshot: vi.fn(), getFile: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), dispose: vi.fn() }))
vi.mock('./index', () => ({ diffFor: () => service }))

const feature = createDiffFeature({} as CoreServices)
const handlers = feature.handlers

it('rejects anything that is not exactly the documented request before it reaches the service', () => {
  expect(() => handlers.getSnapshot.parse(undefined)).toThrow()
  expect(() => handlers.getSnapshot.parse([])).toThrow()
  expect(() => handlers.getSnapshot.parse({ projectId: 'p', cwd: '/etc' })).toThrow('Unexpected field')
  expect(() => handlers.getSnapshot.parse({ projectId: '' })).toThrow('too short')
  expect(() => handlers.getSnapshot.parse({ projectId: 'x'.repeat(101) })).toThrow('too long')
  expect(() => handlers.getSnapshot.parse({ projectId: 5 })).toThrow('string')
  expect(() => handlers.subscribe.parse({ projectId: 'p', extra: 1 })).toThrow('Unexpected field')
  expect(() => handlers.unsubscribe.parse({ projectId: 'p' })).toThrow()
  expect(() => handlers.unsubscribe.parse({ projectId: 'p', subscriptionId: 'x'.repeat(101) })).toThrow('too long')
  expect(service.getSnapshot).not.toHaveBeenCalled()
})

it('accepts only Project-relative file paths: no absolute path, "..", NUL, empty, trailing slash, overlong or extra keys', () => {
  const ok = { projectId: 'p', path: 'src/a b.ts', oldPath: null }
  expect(handlers.getFile.parse(ok)).toEqual(ok)
  expect(handlers.getFile.parse({ ...ok, oldPath: 'old/name.ts' })).toEqual({ ...ok, oldPath: 'old/name.ts' })
  for (const path of ['/etc/passwd', '../x', 'a/../b', 'a//b', './a', 'a/', '', 'a\0b', 'a/\ud800', 'x'.repeat(1021), `${'d/'.repeat(600)}f`, 5, null, undefined]) {
    expect(() => handlers.getFile.parse({ ...ok, path }), String(path)).toThrow()
    expect(() => handlers.getFile.parse({ ...ok, oldPath: path === null ? 5 : path }), `old ${String(path)}`).toThrow()
  }
  expect(() => handlers.getFile.parse({ projectId: 'p', path: 'a' })).toThrow('oldPath is required')
  expect(() => handlers.getFile.parse({ ...ok, sha: 'a'.repeat(40) })).toThrow('Unexpected field')
  expect(() => handlers.getFile.parse({ ...ok, oldPath: undefined })).toThrow()
})

it('forwards the trusted sender id to subscribe and unsubscribe and nothing else from the request context', async () => {
  const context = { senderId: 71, senderUrl: 'app://studio' }
  await handlers.subscribe.handle(handlers.subscribe.parse({ projectId: 'p' }), context)
  await handlers.unsubscribe.handle(handlers.unsubscribe.parse({ projectId: 'p', subscriptionId: 's' }), context)
  await handlers.getSnapshot.handle({ projectId: 'p' }, context)
  await handlers.getFile.handle({ projectId: 'p', path: 'a', oldPath: null }, context)
  expect(service.subscribe).toHaveBeenCalledWith('p', 71)
  expect(service.unsubscribe).toHaveBeenCalledWith('p', 's', 71)
  expect(service.getSnapshot).toHaveBeenCalledWith('p')
  expect(service.getFile).toHaveBeenCalledWith({ projectId: 'p', path: 'a', oldPath: null })
})

it('disposes the shared service with the feature', async () => {
  await feature.dispose?.()
  expect(service.dispose).toHaveBeenCalled()
})
