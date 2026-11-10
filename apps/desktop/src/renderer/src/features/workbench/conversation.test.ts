import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultUiState } from '@shared/project/ui-state'
import { useProjectShell } from '../project/store'
import { draftId, emptyDraft, useSessions } from '../session/store'
import { appendWorkbenchDraft } from './conversation'

const target = { projectId: 'p', kind: 'instance' as const, id: 'one' }
const sessionKey = { projectId: 'p', kind: 'session' as const, sessionId: 's' }
const originalSessions = useSessions.getState(), originalShell = useProjectShell.getState()
const update = vi.fn()
beforeEach(() => {
  useProjectShell.setState({ uiStates: { p: { ...defaultUiState(), mainCanvas: { mode: 'view', viewId: 'workbench:one', conversation: { kind: 'session', sessionId: 's' } } } } })
  useSessions.setState({ drafts: { [draftId(sessionKey)]: { ...emptyDraft(), text: '我的原文' } }, loadDraft: vi.fn(async () => {}), updateDraft: update })
  update.mockClear()
})
afterEach(() => { useSessions.setState(originalSessions, true); useProjectShell.setState(originalShell, true) })
it('appends to the visible Session composer and preserves existing text', async () => {
  await appendWorkbenchDraft(target, '页面建议', () => true)
  expect(update).toHaveBeenCalledExactlyOnceWith(sessionKey, { text: '我的原文\n页面建议' })
})
it('rejects late completion after switching conversation or unloading page', async () => {
  let release!: () => void
  useSessions.setState({ loadDraft: () => new Promise<void>(resolve => { release = resolve }) })
  const pending = appendWorkbenchDraft(target, '页面建议', () => true)
  useProjectShell.setState({ uiStates: { p: { ...defaultUiState(), mainCanvas: { mode: 'view', viewId: 'workbench:one', conversation: { kind: 'draft' } } } } })
  release()
  await expect(pending).rejects.toThrow('对话已切换')
  expect(update).not.toHaveBeenCalled()
})
it('rejects an unloaded page even when the view ID is unchanged', async () => {
  await expect(appendWorkbenchDraft(target, '迟到建议', () => false)).rejects.toThrow('对话已切换')
  expect(update).not.toHaveBeenCalled()
})
