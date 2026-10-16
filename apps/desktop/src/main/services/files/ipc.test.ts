import { describe, expect, it, vi } from 'vitest'
import { filesContract } from '@shared/ipc/files'
import { FILES_LIMITS } from '@shared/tools/files'
import { registerFeatureHandlers } from '../../ipc/registry'
import type { CoreServices } from '../core'
import { createFilesFeature } from '../../ipc/files'

const service = vi.hoisted(() => ({
  list: vi.fn(), read: vi.fn(), resolveReference: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), dispose: vi.fn()
}))
vi.mock('./index', () => ({ filesFor: () => service }))

const feature = createFilesFeature({} as CoreServices)
const { handlers } = feature
const context = { senderId: 42, senderUrl: 'app://studio/index.html' }

describe('Files IPC input parsing', () => {
  it('accepts well-formed requests and returns them without extra data', () => {
    expect(handlers.list.parse({ projectId: 'p1', path: '' })).toEqual({ projectId: 'p1', path: '' })
    expect(handlers.list.parse({ projectId: 'p1', path: 'src/déjà vu/-x [1].ts' })).toEqual({ projectId: 'p1', path: 'src/déjà vu/-x [1].ts' })
    expect(handlers.read.parse({ projectId: 'p1', path: 'a.txt' })).toEqual({ projectId: 'p1', path: 'a.txt' })
    expect(handlers.read.parse({ projectId: 'p1', path: 'a.txt', ifVersion: '1:2:3:4' })).toEqual({ projectId: 'p1', path: 'a.txt', ifVersion: '1:2:3:4' })
    expect(handlers.resolveReference.parse({ projectId: 'p1', paths: ['a', 'b/c'] })).toEqual({ projectId: 'p1', paths: ['a', 'b/c'] })
    expect(handlers.subscribe.parse({ projectId: 'p1' })).toEqual({ projectId: 'p1' })
    expect(handlers.unsubscribe.parse({ projectId: 'p1', subscriptionId: 's1' })).toEqual({ projectId: 'p1', subscriptionId: 's1' })
  })

  const hostilePaths: [string, unknown][] = [
    ['absolute', '/etc/passwd'], ['dot-dot', '../secret'], ['embedded dot-dot', 'a/../../b'], ['dot segment', './a'],
    ['trailing slash', 'a/'], ['empty segment', 'a//b'], ['NUL', 'a\0b'], ['lone surrogate', 'a\ud800b'], ['Windows drive', '/C:/x'.slice(1) + '/..'],
    ['too long', 'a/'.repeat(600)], ['segment too long', 'x'.repeat(1021)], ['number', 7], ['null', null], ['array', ['a']], ['object', { toString: () => 'a' }]
  ]
  it.each(hostilePaths)('rejects a %s path in list, read and resolveReference before the service is reached', (_name, path) => {
    expect(() => handlers.list.parse({ projectId: 'p1', path })).toThrow()
    expect(() => handlers.read.parse({ projectId: 'p1', path })).toThrow()
    expect(() => handlers.resolveReference.parse({ projectId: 'p1', paths: [path] })).toThrow()
    expect(() => handlers.resolveReference.parse({ projectId: 'p1', paths: ['ok', path] })).toThrow()
    expect(service.list).not.toHaveBeenCalled()
  })

  it('rejects a path above the length limit without building huge strings first', () => {
    expect(() => handlers.list.parse({ projectId: 'p1', path: 'a'.repeat(FILES_LIMITS.pathBytes + 1) })).toThrow('too long')
    expect(() => handlers.list.parse({ projectId: 'p1', path: 'é'.repeat(600) })).toThrow('too long')
    expect(handlers.list.parse({ projectId: 'p1', path: 'a'.repeat(100) })).toBeTruthy()
  })

  it('rejects unknown keys (no root, cwd, absolute, encoding or options can be smuggled in)', () => {
    for (const extra of ['root', 'cwd', 'absolute', 'encoding', 'maxBytes', 'followSymlinks', '__proto__x']) {
      expect(() => handlers.list.parse({ projectId: 'p1', path: '', [extra]: '/' }), extra).toThrow('Unexpected field')
      expect(() => handlers.read.parse({ projectId: 'p1', path: 'a', [extra]: 1 }), extra).toThrow('Unexpected field')
      expect(() => handlers.resolveReference.parse({ projectId: 'p1', paths: ['a'], [extra]: 1 }), extra).toThrow('Unexpected field')
      expect(() => handlers.subscribe.parse({ projectId: 'p1', [extra]: 1 }), extra).toThrow('Unexpected field')
      expect(() => handlers.unsubscribe.parse({ projectId: 'p1', subscriptionId: 's', [extra]: 1 }), extra).toThrow('Unexpected field')
    }
  })

  it('rejects non-objects and class instances as input', () => {
    for (const raw of [undefined, null, 'p1', 7, ['p1'], new Date(), new (class Evil { projectId = 'p1'; path = '' })()]) {
      expect(() => handlers.list.parse(raw)).toThrow()
      expect(() => handlers.subscribe.parse(raw)).toThrow()
    }
  })

  it('validates projectId: present, non-empty, at most 100 characters, a string', () => {
    for (const projectId of [undefined, '', 'x'.repeat(101), 7, null, {}]) {
      expect(() => handlers.list.parse({ projectId, path: '' }), String(projectId)).toThrow()
      expect(() => handlers.subscribe.parse({ projectId }), String(projectId)).toThrow()
    }
    expect(handlers.subscribe.parse({ projectId: 'x'.repeat(100) })).toBeTruthy()
  })

  it('limits ifVersion to 200 characters and a string', () => {
    expect(handlers.read.parse({ projectId: 'p', path: 'a', ifVersion: 'v'.repeat(200) })).toBeTruthy()
    for (const ifVersion of ['v'.repeat(201), '', 5, null]) expect(() => handlers.read.parse({ projectId: 'p', path: 'a', ifVersion })).toThrow()
  })

  it('requires 1 to 20 paths in an array', () => {
    const paths = (count: number) => Array.from({ length: count }, (_, index) => `f${index}`)
    expect(handlers.resolveReference.parse({ projectId: 'p', paths: paths(1) }).paths).toHaveLength(1)
    expect(handlers.resolveReference.parse({ projectId: 'p', paths: paths(FILES_LIMITS.referencesPerMessage) }).paths).toHaveLength(20)
    for (const value of [paths(0), paths(21), 'a', undefined, { length: 1, 0: 'a' }, new Array(3)]) {
      expect(() => handlers.resolveReference.parse({ projectId: 'p', paths: value })).toThrow()
    }
  })

  it('requires a subscription id of 1 to 100 characters to unsubscribe', () => {
    for (const subscriptionId of [undefined, '', 'x'.repeat(101), 3]) {
      expect(() => handlers.unsubscribe.parse({ projectId: 'p', subscriptionId })).toThrow()
    }
  })
})

describe('Files IPC routing', () => {
  it('routes requests to the service with the trusted sender identity', async () => {
    await handlers.list.handle({ projectId: 'p', path: 'src' }, context)
    await handlers.read.handle({ projectId: 'p', path: 'a', ifVersion: 'v' }, context)
    await handlers.resolveReference.handle({ projectId: 'p', paths: ['a'] }, context)
    await handlers.subscribe.handle({ projectId: 'p' }, context)
    await handlers.unsubscribe.handle({ projectId: 'p', subscriptionId: 's' }, context)
    expect(service.list).toHaveBeenCalledWith('p', 'src')
    expect(service.read).toHaveBeenCalledWith({ projectId: 'p', path: 'a', ifVersion: 'v' })
    expect(service.resolveReference).toHaveBeenCalledWith('p', ['a'])
    expect(service.subscribe).toHaveBeenCalledWith('p', 42)
    expect(service.unsubscribe).toHaveBeenCalledWith('p', 's', 42)
  })

  it('disposes the service with the feature and registers against the contract one to one', async () => {
    const registered: string[] = []
    registerFeatureHandlers({ handle: (channel) => { registered.push(channel) }, removeHandler: () => {} }, [filesContract], [feature], { isTrustedSender: () => true })
    expect(registered.sort()).toEqual(Object.values(filesContract.invoke).map((channel) => channel.channel).sort())
    await feature.dispose?.()
    expect(service.dispose).toHaveBeenCalledTimes(1)
  })
})
