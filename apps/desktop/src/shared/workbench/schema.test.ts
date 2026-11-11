import { expect, it } from 'vitest'
import { parseDraftWorkbenchRef, parseInstanceWorkbenchRef, parseJsonState, parseManifest, parseTarget, parseCustomWorkbenchRef, parseWorkbenchRef } from './schema'
import { PRESET_WORKBENCHES } from './presets'
import { DEFAULT_VIEW_IDS } from '../project/types'
import { VIEW_CATALOG } from '../project-view/types'
import { viewName } from '../project/strings'

it('accepts JSON values including null-prototype dictionaries and rejects lossy structured-clone values', () => {
  expect(parseJsonState({ list: [null, 1, 'text', false] })).toEqual({ list: [null, 1, 'text', false] })
  const dictionary = Object.create(null); dictionary.name = 'saved'
  expect(parseJsonState(dictionary)).toEqual({ name: 'saved' })
  for (const value of [new Date(), new Map([['a', 1]]), new Set([1]), new Uint8Array([1]), NaN, Infinity, undefined, () => 1]) expect(() => parseJsonState(value)).toThrow()
  const cycle: { child?: unknown } = {}; cycle.child = cycle
  expect(() => parseJsonState(cycle)).toThrow('JSON')
  expect(() => parseJsonState('x'.repeat(1024 * 1024))).toThrow('1 MiB')
})
it('resolves preset and custom identities through one boundary and limits mutations to supported targets', () => {
  for (const viewId of ['architecture', 'business-flow', 'workbench:instance-one', 'workbench-draft:draft-one']) {
    expect(parseWorkbenchRef({ projectId: 'project', viewId })).toEqual({ projectId: 'project', viewId })
  }
  for (const ref of [{ projectId: 'project', viewId: 'unknown' }, { projectId: '../outside', viewId: 'overview' }, { projectId: 'project', viewId: 'workbench:../outside' }, { projectId: 'project', viewId: 'overview', arbitrary: true }]) expect(() => parseWorkbenchRef(ref)).toThrow()
  expect(() => parseCustomWorkbenchRef({ projectId: 'project', viewId: 'overview' })).toThrow('自定义工作台')
  expect(parseDraftWorkbenchRef({ projectId: 'project', viewId: 'workbench-draft:one' }).viewId).toBe('workbench-draft:one')
  expect(parseInstanceWorkbenchRef({ projectId: 'project', viewId: 'workbench:one' }).viewId).toBe('workbench:one')
  expect(() => parseDraftWorkbenchRef({ projectId: 'project', viewId: 'workbench:one' })).toThrow('设计草稿')
  expect(() => parseInstanceWorkbenchRef({ projectId: 'project', viewId: 'workbench-draft:one' })).toThrow('实例')
})
it('derives route validation and knowledge metadata from the preset workbench descriptors', () => {
  expect(DEFAULT_VIEW_IDS).toEqual(PRESET_WORKBENCHES.map(entry => entry.viewId))
  expect(VIEW_CATALOG.map(entry => ({ viewId: entry.id, title: entry.title }))).toEqual(PRESET_WORKBENCHES.map(entry => ({ viewId: entry.viewId, title: entry.title })))
  for (const entry of PRESET_WORKBENCHES) expect(viewName(entry.viewId)).toBe(entry.title)
})
it('checks protocol versions, capabilities and target identity at boundaries', () => {
  const manifest = { schemaVersion: 1, pluginId: 'notes', version: '1.0.0', sdkVersion: 1, title: 'Notes', entry: 'index.html', capabilities: ['state.read'] }
  expect(parseManifest(manifest)).toEqual(manifest)
  expect(() => parseManifest({ ...manifest, backend: 'main.js' })).toThrow('不支持字段')
  expect(() => parseManifest({ ...manifest, capabilities: ['state.read', 'state.read'] })).toThrow('重复能力')
  expect(parseTarget({ projectId: 'p', kind: 'instance', id: 'i' })).toEqual({ projectId: 'p', kind: 'instance', id: 'i' })
  expect(() => parseTarget({ projectId: 'p', kind: 'instance', id: '../outside' })).toThrow('标识无效')
  const resources = { ...manifest, capabilities: ['state.read', 'project.knowledge.read', 'project.sessions.read', 'session.open'], knowledgeViewId: 'architecture' }
  expect(parseManifest(resources)).toEqual(resources)
  expect(() => parseManifest({ ...manifest, knowledgeViewId: 'architecture' })).toThrow('一起声明')
  expect(() => parseManifest({ ...manifest, capabilities: ['project.knowledge.read'] })).toThrow('一起声明')
  expect(() => parseManifest({ ...resources, knowledgeViewId: 'unknown' })).toThrow('knowledgeViewId')
})
