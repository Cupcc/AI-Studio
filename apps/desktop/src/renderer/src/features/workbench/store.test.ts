import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { StudioApi } from '@shared/ipc/contracts'
import type { WorkbenchCatalog, WorkbenchTarget } from '@shared/workbench/types'
import { useWorkbenches, watchWorkbenches } from './store'

let change: (event: { projectId: string; target: WorkbenchTarget }) => void
let detach: () => void
let list: StudioApi['workbench']['list']
const empty = (): WorkbenchCatalog => ({ instances: [], drafts: [] })
const populated = (): WorkbenchCatalog => ({ instances: [{ id: 'one', projectId: 'p', title: 'New', packageRevision: 'r1', enabled: true, pluginId: 'notes' }], drafts: [] })
beforeEach(() => {
  useWorkbenches.setState({ catalogs: {}, errors: {} })
  list = vi.fn(async () => empty())
  Object.defineProperty(window, 'studio', { configurable: true, value: { workbench: { list, onChanged: (listener: typeof change) => { change = listener; return () => {} } } } })
  detach = watchWorkbenches()
})
afterEach(() => { detach(); useWorkbenches.getState().close('p') })
it('re-reads once when changes arrive during a pending catalog load', async () => {
  let resolve!: (catalog: WorkbenchCatalog) => void
  vi.mocked(list).mockImplementationOnce(() => new Promise<WorkbenchCatalog>(done => { resolve = done })).mockResolvedValue(populated())
  const pending = useWorkbenches.getState().load('p')
  change({ projectId: 'p', target: { projectId: 'p', kind: 'instance', id: 'one' } })
  change({ projectId: 'p', target: { projectId: 'p', kind: 'instance', id: 'one' } })
  resolve(empty()); await pending
  expect(useWorkbenches.getState().catalogs.p?.instances).toHaveLength(1)
  expect(list).toHaveBeenCalledTimes(2)
})
it('closing invalidates pending reads and queued changes until explicitly reopened', async () => {
  let resolve!: (catalog: WorkbenchCatalog) => void
  vi.mocked(list).mockImplementationOnce(() => new Promise<WorkbenchCatalog>(done => { resolve = done })).mockResolvedValue(populated())
  const pending = useWorkbenches.getState().load('p')
  change({ projectId: 'p', target: { projectId: 'p', kind: 'instance', id: 'one' } })
  useWorkbenches.getState().close('p')
  resolve(populated()); await pending
  change({ projectId: 'p', target: { projectId: 'p', kind: 'instance', id: 'one' } })
  await Promise.resolve()
  expect(useWorkbenches.getState().catalogs.p).toBeUndefined()
  expect(list).toHaveBeenCalledTimes(1)
  await useWorkbenches.getState().load('p')
  expect(useWorkbenches.getState().catalogs.p?.instances).toHaveLength(1)
})
