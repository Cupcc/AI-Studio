import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { StudioApi } from '@shared/ipc/contracts'
import { presetWorkbench, PRESET_WORKBENCHES } from '@shared/workbench/presets'
import type { WorkbenchSnapshot, WorkbenchCatalog, WorkbenchChange } from '@shared/workbench/types'
import { useWorkbenches, watchWorkbenches } from './store'

let change: (event: WorkbenchChange) => void
let detach: () => void
let list: StudioApi['workbench']['list'], getSnapshot: StudioApi['workbench']['getSnapshot']
const instance = { id: 'one', projectId: 'p', title: 'New', packageRevision: 'r1', pluginId: 'notes', viewId: 'workbench:one', origin: 'custom', kind: 'instance', icon: 'preview', editable: true } as const
const populated = (): WorkbenchCatalog => [...PRESET_WORKBENCHES, instance]
const presetSnapshot = (revision = 1, projectId = 'p'): WorkbenchSnapshot => ({
  ref: { projectId, viewId: 'architecture' }, revision,
  status: 'ready', error: null, page: null, entry: presetWorkbench('architecture')
})
const webSnapshot = (revision = 1): WorkbenchSnapshot => ({
  ref: { projectId: 'p', viewId: instance.viewId }, revision,
  status: 'error', error: 'Missing entry', page: null, entry: instance
})
beforeEach(() => {
  useWorkbenches.setState({ catalogs: {}, snapshots: {}, errors: {}, snapshotErrors: {}, loading: {}, hosts: {} })
  list = vi.fn(async () => [])
  getSnapshot = vi.fn(async () => presetSnapshot())
  Object.defineProperty(window, 'studio', { configurable: true, value: { workbench: { list, getSnapshot, onChanged: (listener: typeof change) => { change = listener; return () => {} } } } })
  detach = watchWorkbenches()
})
afterEach(() => { detach(); useWorkbenches.getState().close('p'); useWorkbenches.getState().close('other') })
it('re-reads once when catalog changes arrive during a pending load', async () => {
  let resolve!: (catalog: WorkbenchCatalog) => void
  vi.mocked(list).mockImplementationOnce(() => new Promise<WorkbenchCatalog>(done => { resolve = done })).mockResolvedValue(populated())
  const pending = useWorkbenches.getState().loadCatalog('p')
  change({ kind: 'catalog', projectId: 'p' }); change({ kind: 'catalog', projectId: 'p' })
  resolve([]); await pending
  expect(useWorkbenches.getState().catalogs.p).toEqual(populated())
  expect(list).toHaveBeenCalledTimes(2)
})
it('closing invalidates pending catalog reads and queued changes until explicitly reopened', async () => {
  let resolve!: (catalog: WorkbenchCatalog) => void
  vi.mocked(list).mockImplementationOnce(() => new Promise<WorkbenchCatalog>(done => { resolve = done })).mockResolvedValue(populated())
  const pending = useWorkbenches.getState().loadCatalog('p')
  change({ kind: 'catalog', projectId: 'p' })
  useWorkbenches.getState().close('p')
  resolve(populated()); await pending
  change({ kind: 'catalog', projectId: 'p' }); await Promise.resolve()
  expect(useWorkbenches.getState().catalogs.p).toBeUndefined()
  expect(list).toHaveBeenCalledTimes(1)
  await useWorkbenches.getState().loadCatalog('p')
  expect(useWorkbenches.getState().catalogs.p).toEqual(populated())
})
it('loads preset and custom pages through one API and accepts full change snapshots without a fetch loop', async () => {
  await useWorkbenches.getState().loadCatalog('p')
  vi.mocked(getSnapshot).mockResolvedValueOnce(presetSnapshot()).mockResolvedValueOnce(webSnapshot())
  await useWorkbenches.getState().loadSnapshot(presetSnapshot().ref)
  await useWorkbenches.getState().loadSnapshot(webSnapshot().ref)
  change({ kind: 'snapshot', snapshot: presetSnapshot(3) })
  change({ kind: 'snapshot', snapshot: webSnapshot(4) })
  expect(useWorkbenches.getState().snapshots['p:architecture']).toEqual(presetSnapshot(3))
  expect(useWorkbenches.getState().snapshots['p:workbench:one']).toEqual(webSnapshot(4))
  expect(getSnapshot).toHaveBeenCalledTimes(2)
  expect(list).toHaveBeenCalledTimes(1)
})
it('retains a newer watcher snapshot when an older pending read completes', async () => {
  let resolve!: (snapshot: WorkbenchSnapshot) => void
  vi.mocked(getSnapshot).mockImplementationOnce(() => new Promise<WorkbenchSnapshot>(done => { resolve = done }))
  const pending = useWorkbenches.getState().loadSnapshot(presetSnapshot().ref)
  const duplicate = useWorkbenches.getState().loadSnapshot(presetSnapshot().ref)
  change({ kind: 'snapshot', snapshot: presetSnapshot(3) })
  resolve(presetSnapshot(1)); await Promise.all([pending, duplicate])
  expect(useWorkbenches.getState().snapshots['p:architecture']?.revision).toBe(3)
  expect(getSnapshot).toHaveBeenCalledTimes(1)
})
it('keeps the last good snapshot on a failed read and clears errors after recovery', async () => {
  await useWorkbenches.getState().loadSnapshot(presetSnapshot().ref)
  vi.mocked(getSnapshot).mockRejectedValueOnce(new Error('Read failed'))
  await useWorkbenches.getState().loadSnapshot(presetSnapshot().ref)
  expect(useWorkbenches.getState().snapshots['p:architecture']).toEqual(presetSnapshot())
  expect(useWorkbenches.getState().snapshotErrors['p:architecture']).toBe('Read failed')
  change({ kind: 'snapshot', snapshot: presetSnapshot(2) })
  expect(useWorkbenches.getState().snapshotErrors['p:architecture']).toBeNull()
})
it('clears only the closed project and refuses its late snapshots, replies and host state', async () => {
  let resolve!: (snapshot: WorkbenchSnapshot) => void
  vi.mocked(getSnapshot).mockImplementationOnce(() => new Promise<WorkbenchSnapshot>(done => { resolve = done }))
  const pending = useWorkbenches.getState().loadSnapshot(presetSnapshot().ref)
  await useWorkbenches.getState().loadCatalog('other')
  useWorkbenches.getState().acceptSnapshot(presetSnapshot(2, 'other'))
  useWorkbenches.getState().updateHost(presetSnapshot().ref, { pending: true })
  expect(useWorkbenches.getState().hosts['p:architecture']).toMatchObject({ pending: true, saveStatus: '已读取保存状态' })
  useWorkbenches.getState().close('p')
  useWorkbenches.getState().updateHost(presetSnapshot().ref, { pending: false })
  change({ kind: 'snapshot', snapshot: presetSnapshot(8) }); resolve(presetSnapshot(9)); await pending
  expect(useWorkbenches.getState().snapshots['p:architecture']).toBeUndefined()
  expect(useWorkbenches.getState().snapshots['other:architecture']).toBeTruthy()
  expect(useWorkbenches.getState().hosts['p:architecture']).toBeUndefined()
  expect(useWorkbenches.getState().loading['p:architecture']).toBeUndefined()
  await useWorkbenches.getState().loadSnapshot(presetSnapshot().ref)
  expect(useWorkbenches.getState().snapshots['p:architecture']).toEqual(presetSnapshot())
})
