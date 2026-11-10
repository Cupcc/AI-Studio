import { expect, it } from 'vitest'
import { parseJsonState, parseManifest, parseTarget } from './schema'

it('accepts JSON values including null-prototype dictionaries and rejects lossy structured-clone values', () => {
  expect(parseJsonState({ list: [null, 1, 'text', false] })).toEqual({ list: [null, 1, 'text', false] })
  const dictionary = Object.create(null); dictionary.name = 'saved'
  expect(parseJsonState(dictionary)).toEqual({ name: 'saved' })
  for (const value of [new Date(), new Map([['a', 1]]), new Set([1]), new Uint8Array([1]), NaN, Infinity, undefined, () => 1]) expect(() => parseJsonState(value)).toThrow()
  const cycle: { child?: unknown } = {}; cycle.child = cycle
  expect(() => parseJsonState(cycle)).toThrow('JSON')
  expect(() => parseJsonState('x'.repeat(1024 * 1024))).toThrow('1 MiB')
})
it('checks protocol versions, capabilities and target identity at boundaries', () => {
  const manifest = { schemaVersion: 1, pluginId: 'notes', version: '1.0.0', sdkVersion: 1, title: 'Notes', entry: 'index.html', capabilities: ['state.read'] }
  expect(parseManifest(manifest)).toEqual(manifest)
  expect(() => parseManifest({ ...manifest, backend: 'main.js' })).toThrow('不支持字段')
  expect(() => parseManifest({ ...manifest, capabilities: ['state.read', 'state.read'] })).toThrow('重复能力')
  expect(parseTarget({ projectId: 'p', kind: 'instance', id: 'i' })).toEqual({ projectId: 'p', kind: 'instance', id: 'i' })
  expect(() => parseTarget({ projectId: 'p', kind: 'instance', id: '../outside' })).toThrow('标识无效')
})
