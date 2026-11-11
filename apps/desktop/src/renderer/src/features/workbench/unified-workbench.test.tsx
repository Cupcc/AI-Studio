import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { StudioApi } from '@shared/ipc/contracts'
import { defaultUiState } from '@shared/project/ui-state'
import { DEFAULT_DEFINITIONS, catalogEntry } from '@shared/project-view/defaults'
import { presetWorkbench, PRESET_WORKBENCHES } from '@shared/workbench/presets'
import type { WorkbenchSnapshot, WorkbenchChange, WorkbenchCatalog } from '@shared/workbench/types'
import { useProjectShell } from '../project/store'
import { WorkbenchNavigation } from './WorkbenchNavigation'
import { WorkbenchPreview } from './WorkbenchPreview'
import { pageWithEnvironment } from './WorkbenchPage'
import { useWorkbenches, watchWorkbenches } from './store'

const project = { id: 'p', name: 'Project', localPath: '/p', displayPath: '/p', canonicalPath: '/p', createdAt: '', lastOpenedAt: '' }
const custom = { id: 'one', projectId: 'p', pluginId: 'notes', packageRevision: 'r1', title: '随手记', enabled: true, viewId: 'workbench:one', origin: 'custom', kind: 'instance', icon: 'preview', editable: true, canDisable: true } as const
const draft = { id: 'draft', projectId: 'p', source: 'template', title: '新工作台', directory: '/p/draft', targetInstanceId: null, viewId: 'workbench-draft:draft', origin: 'custom', kind: 'draft', icon: 'pencil', editable: true, canDisable: false } as const
const catalog: WorkbenchCatalog = [...PRESET_WORKBENCHES, custom, draft]
const originalShell = useProjectShell.getState()
let api: StudioApi['workbench'], change: (event: WorkbenchChange) => void, detach: () => void
const presetSnapshot = (): WorkbenchSnapshot => ({
  ref: { projectId: 'p', viewId: 'architecture' }, status: 'ready', revision: 1, error: null,
  entry: presetWorkbench('architecture'),
  page: {
    target: { projectId: 'p', kind: 'instance', id: 'architecture' },
    manifest: { schemaVersion: 1, sdkVersion: 1, pluginId: 'studio-architecture', version: '1.0.0', title: 'Architecture', entry: 'index.html', capabilities: ['state.read', 'project.knowledge.read'] },
    packageRevision: 'r1', stateRevision: 0, state: {}, pageUrl: 'app://workbench/architecture/index.html', enabled: true,
    resources: { knowledge: { projectId: 'p', viewId: 'architecture', revision: 1, status: 'ready', error: null,
      snapshot: { projectId: 'p', viewId: 'architecture', catalog: catalogEntry('architecture'), revision: 1, updatedAt: 1,
        knowledge: { schemaVersion: 1, viewId: 'architecture', data: { summary: '当前架构信息' } },
        definition: DEFAULT_DEFINITIONS.get('architecture')! }
    } }
  }
})
beforeEach(() => {
  useProjectShell.setState({ projects: { p: project }, uiStates: { p: defaultUiState() } })
  useWorkbenches.setState({ catalogs: {}, snapshots: {}, errors: {}, snapshotErrors: {}, loading: {}, zoom: {} })
  api = {
    startAgent: vi.fn(), listAgents: vi.fn(), getAgent: vi.fn(), stopAgent: vi.fn(),
    list: vi.fn(async () => catalog), getSnapshot: vi.fn(async () => presetSnapshot()), getContext: vi.fn(),
    listRemoved: vi.fn(async () => []), rename: vi.fn(), move: vi.fn(), setVisible: vi.fn(), deleteDraft: vi.fn(), createDraft: vi.fn(), applyDraft: vi.fn(), updateState: vi.fn(), setEnabled: vi.fn(),
    onChanged: vi.fn(listener => { change = listener; return () => {} })
  }
  Object.defineProperty(window, 'studio', { configurable: true, value: { workbench: api, project: { updateUiState: vi.fn(async () => defaultUiState()) } } })
  detach = watchWorkbenches()
})
afterEach(async () => { cleanup(); detach(); await useProjectShell.getState().flush(); useProjectShell.setState(originalShell, true); useWorkbenches.getState().close('p') })
it('shows presets, custom instances and drafts in one navigable workbench list', async () => {
  function Navigation() {
    const canvas = useProjectShell(s => s.uiStates.p!.mainCanvas)
    return <WorkbenchNavigation project={project} canvas={canvas} active />
  }
  render(<Navigation />)
  const region = screen.getByRole('region', { name: '工作台' })
  await within(region).findByRole('button', { name: 'Business Flow' })
  expect(within(region).getByRole('button', { name: '随手记' })).toBeTruthy()
  const overview = within(region).getByRole('button', { name: 'Overview' })
  overview.focus()
  fireEvent.keyDown(overview, { key: 'End' })
  const draftButton = within(region).getByRole('button', { name: '草稿：新工作台' })
  expect(document.activeElement).toBe(draftButton)
  fireEvent.keyDown(draftButton, { key: 'ArrowUp' })
  const customButton = within(region).getByRole('button', { name: '随手记' })
  expect(document.activeElement).toBe(customButton)
  fireEvent.click(customButton)
  expect(within(region).getByRole('button', { name: '随手记', current: 'page' })).toBeTruthy()
  expect(useProjectShell.getState().uiStates.p?.mainCanvas).toMatchObject({ mode: 'view', viewId: custom.viewId })
  expect(screen.queryByText('PROJECT VIEWS')).toBeNull()
})
it('loads a preset as an ordinary iframe and updates its Knowledge resource without remounting', async () => {
  render(<WorkbenchPreview project={project} canvas={defaultUiState().mainCanvas} active viewId="architecture" />)
  await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy())
  const iframe = document.querySelector('iframe')!, post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  expect(api.getSnapshot).toHaveBeenCalledExactlyOnceWith({ projectId: 'p', viewId: 'architecture' })
  fireEvent.click(screen.getByRole('button', { name: '放大 Preview' }))
  expect(screen.getByRole('button', { name: '重置 Preview 缩放' }).textContent).toBe('110%')
  const snapshot = presetSnapshot()
  if (!snapshot.page?.resources?.knowledge) throw new Error('fixture requires Knowledge resource')
  snapshot.revision = 2
  snapshot.page.resources.knowledge = { ...snapshot.page.resources.knowledge, revision: 2, status: 'error', error: 'Knowledge JSON 无效' }
  act(() => change({ kind: 'snapshot', snapshot }))
  await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'snapshot', snapshot: expect.objectContaining({ resources: expect.objectContaining({ knowledge: expect.objectContaining({ error: 'Knowledge JSON 无效' }) }) }) }), '*'))
  expect(document.querySelector('iframe')).toBe(iframe)
  expect(screen.queryByRole('button', { name: '编辑工作台' })).toBeNull()
  expect(api.getSnapshot).toHaveBeenCalledTimes(1)
})

it('only attaches declared domain resources to any ordinary page', () => {
  const snapshot = presetSnapshot()
  if (!snapshot.page) throw new Error('fixture requires page')
  const appearance = { dark: true, variables: { '--color-text': '#fff' } }
  const unrestricted = pageWithEnvironment({ ...snapshot.page, manifest: { ...snapshot.page.manifest, capabilities: ['state.read'] } }, [], appearance)
  expect(unrestricted.resources?.knowledge).toBeUndefined()
  expect(unrestricted.resources?.sessions).toBeUndefined()
  expect(unrestricted.appearance).toEqual(appearance)
  const entitled = pageWithEnvironment({ ...snapshot.page, manifest: { ...snapshot.page.manifest, capabilities: ['state.read', 'project.knowledge.read', 'project.sessions.read'] } }, [], appearance)
  expect(entitled.resources?.knowledge).toBe(snapshot.page.resources?.knowledge)
  expect(entitled.resources?.sessions).toEqual([])
})
