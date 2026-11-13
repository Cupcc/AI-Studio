import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultUiState } from '@shared/project/ui-state'
import type { SessionSummary } from '@shared/session/types'
import type { CustomDraftEntry, CustomInstanceEntry, WorkbenchSnapshot } from '@shared/workbench/types'
import { useProjectShell } from '../project/store'
import { draftId, emptyDraft, useSessions } from '../session/store'
import { ConversationHeader } from '../session/Conversation'
import { openWorkbenchDraft } from './actions'
import { applyWorkbenchDraft } from './host'
import { initialHost, useWorkbenches, workbenchKey } from './store'

const project = { id: 'p', name: 'Project', localPath: '/p', displayPath: '/p', canonicalPath: '/p', createdAt: '', lastOpenedAt: '' }
const draft: CustomDraftEntry = { id: 'd', projectId: 'p', source: 'ai', title: '笔记', directory: '.ai-studio/workbench/drafts/d', targetInstanceId: 'i', viewId: 'workbench-draft:d', origin: 'custom', kind: 'draft', icon: 'pencil', editable: true, canDisable: false }
const instance: CustomInstanceEntry = { id: 'i', projectId: 'p', pluginId: 'notes', packageRevision: 'b'.repeat(64), title: '笔记', enabled: true, viewId: 'workbench:i', origin: 'custom', kind: 'instance', icon: 'preview', editable: true, canDisable: true }
const composerKey = { projectId: 'p', kind: 'new_chat' as const, viewId: draft.viewId }
const originalSessions = useSessions.getState(), originalShell = useProjectShell.getState()
const api = { createDraft: vi.fn(async () => draft), applyDraft: vi.fn(async () => instance), list: vi.fn(async () => [instance]) }
const update = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'studio', { configurable: true, value: { workbench: api, project: { updateUiState: vi.fn(async () => defaultUiState()) } } })
  useProjectShell.setState({ projects: { p: project }, uiStates: { p: defaultUiState() } })
  useSessions.setState({ drafts: {}, loadDraft: vi.fn(async () => {}), updateDraft: update })
  useWorkbenches.setState({ catalogs: { p: [draft, instance] }, snapshots: {}, errors: {}, snapshotErrors: {}, loading: {}, hosts: {} })
})
afterEach(async () => {
  cleanup(); await useProjectShell.getState().flush()
  useSessions.setState(originalSessions, true); useProjectShell.setState(originalShell, true); useWorkbenches.getState().close('p')
})

it('fills the edit prompt only into an empty composer, keeping text typed into a reopened draft', async () => {
  useSessions.setState({ drafts: { [draftId(composerKey)]: emptyDraft() } })
  await openWorkbenchDraft('p', 'ai', 'i')
  expect(update).toHaveBeenCalledExactlyOnceWith(composerKey, expect.objectContaining({ text: expect.stringContaining('修改要求'), contextItems: [{ type: 'view', viewId: draft.viewId }] }))
  update.mockClear()
  useSessions.setState({ drafts: { [draftId(composerKey)]: { ...emptyDraft(), text: '把标题改成蓝色' } } })
  await openWorkbenchDraft('p', 'ai', 'i')
  expect(update).not.toHaveBeenCalled()
  expect(useProjectShell.getState().uiStates.p?.mainCanvas).toMatchObject({ mode: 'view', viewId: draft.viewId })
})

it('hands the view over to the instance before the refreshed list drops the applied draft', async () => {
  const ref = { projectId: 'p', viewId: draft.viewId }, revision = 'a'.repeat(64)
  useWorkbenches.setState({
    snapshots: { [workbenchKey(ref)]: { ref, entry: draft, revision: 1, status: 'ready', error: null, page: { packageRevision: revision } } as unknown as WorkbenchSnapshot },
    hosts: { [workbenchKey(ref)]: { ...initialHost, pageStatus: { kind: 'ready' }, connectedRevision: revision } }
  })
  useProjectShell.getState().enterView('p', draft.viewId)
  let viewWhenListed: unknown
  api.list.mockImplementationOnce(async () => { viewWhenListed = useProjectShell.getState().uiStates.p?.mainCanvas; return [instance] })
  await applyWorkbenchDraft(ref)
  expect(api.applyDraft).toHaveBeenCalledExactlyOnceWith({ ref, expectedPackageRevision: revision })
  expect(viewWhenListed).toMatchObject({ mode: 'view', viewId: instance.viewId })
  expect(useWorkbenches.getState().catalogs.p).toEqual([instance])
})

it('offers “在工作台中打开” only while the conversation’s workbench is still in the list', () => {
  const session = { id: 's', projectId: 'p', cli: 'codex', title: '修改笔记', originViewId: draft.viewId, activity: 'none' } as SessionSummary
  useSessions.setState({ summaries: { s: session } })
  const canvas = { mode: 'session', sessionId: 's' } as const
  const view = render(<ConversationHeader project={project} canvas={canvas} active />)
  expect(screen.getByRole('button', { name: '在工作台中打开' }).hasAttribute('disabled')).toBe(false)
  useWorkbenches.setState({ catalogs: { p: [instance] } })
  view.rerender(<ConversationHeader project={project} canvas={canvas} active />)
  const button = screen.getByRole('button', { name: '在工作台中打开' })
  expect(button.hasAttribute('disabled')).toBe(true)
  expect(button.getAttribute('title')).toBe('该工作台已不在列表中')
})
