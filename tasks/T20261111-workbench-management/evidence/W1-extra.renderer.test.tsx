import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PRESET_WORKBENCHES } from '../../../apps/desktop/src/shared/workbench/presets'
import type { WorkbenchCatalog } from '../../../apps/desktop/src/shared/workbench/types'
import { defaultUiState } from '../../../apps/desktop/src/shared/project/ui-state'
import { useProjectShell } from '../../../apps/desktop/src/renderer/src/features/project/store'
import { useWorkbenches } from '../../../apps/desktop/src/renderer/src/features/workbench/store'
import { WorkbenchNavigation } from '../../../apps/desktop/src/renderer/src/features/workbench/WorkbenchNavigation'
const original = useProjectShell.getState()
const project = { id: 'p', name: 'Project', localPath: '/p', displayPath: '/p', canonicalPath: '/p', createdAt: '', lastOpenedAt: '' }
let catalog: WorkbenchCatalog
let finish: () => void
function Navigation() { const canvas = useProjectShell(s => s.uiStates.p!.mainCanvas); return <WorkbenchNavigation project={project} canvas={canvas} active /> }
beforeEach(() => {
  catalog = [...PRESET_WORKBENCHES]
  useProjectShell.setState({ projects: { p: project }, uiStates: { p: defaultUiState() } })
  useWorkbenches.setState({ catalogs: {}, snapshots: {}, errors: {}, snapshotErrors: {}, loading: {}, zoom: {} })
  const api = {
    list: vi.fn(async () => catalog), listRemoved: vi.fn(async () => []),
    setVisible: vi.fn(() => new Promise<WorkbenchCatalog>(resolve => { finish = () => { catalog = catalog.filter(e => e.viewId !== 'overview'); resolve(catalog) } })),
    rename: vi.fn(async () => catalog)
  }
  Object.defineProperty(window, 'studio', { configurable: true, value: { workbench: api, project: { updateUiState: vi.fn(async () => defaultUiState()) } } })
})
afterEach(async () => { cleanup(); await useProjectShell.getState().flush(); useProjectShell.setState(original, true); useWorkbenches.getState().close('p') })
it('keeps a newer user selection when remove finishes asynchronously', async () => {
  render(<Navigation />)
  fireEvent.click(await screen.findByRole('button', { name: '管理 Overview' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '移除工作台' }))
  fireEvent.click(screen.getByRole('button', { name: 'Business Flow' }))
  expect(useProjectShell.getState().uiStates.p?.mainCanvas).toMatchObject({ mode: 'view', viewId: 'business-flow' })
  await act(async () => { finish() })
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Overview' })).toBeNull())
  expect(useProjectShell.getState().uiStates.p?.mainCanvas).toMatchObject({ mode: 'view', viewId: 'business-flow' })
})
it('restores a usable keyboard focus after canceling rename', async () => {
  render(<Navigation />)
  const trigger = await screen.findByRole('button', { name: '管理 Architecture' })
  trigger.focus(); fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '工作台名称' }))
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(trigger)
})
