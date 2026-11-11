import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultUiState } from '@shared/project/ui-state'
import { useProjectShell } from '../project/store'
import { draftId, emptyDraft, useSessions } from '../session/store'
import { appendWorkbenchDraft, openWorkbenchSession } from './conversation'
import type { SessionSummary } from '@shared/session/types'

const target = { projectId: 'p', viewId: 'workbench:one' as const }
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

it('can fill a new unsent bound workbench draft while leaving the visible Session text intact', async () => {
  const newKey = { projectId: 'p', kind: 'new_chat' as const, viewId: 'workbench:one' as const }
  const selectConversation = vi.fn()
  useSessions.setState({ drafts: { ...useSessions.getState().drafts, [draftId(newKey)]: { ...emptyDraft(), text: 'old draft' } } })
  useProjectShell.setState({ setViewConversation: selectConversation })
  await appendWorkbenchDraft(target, 'Generate Knowledge', () => true, 'new')
  expect(update).toHaveBeenCalledExactlyOnceWith(newKey, { text: 'Generate Knowledge', contextItems: [{ type: 'view', viewId: 'workbench:one' }] })
  expect(selectConversation).toHaveBeenCalledExactlyOnceWith('p', { kind: 'draft' })
  expect(useSessions.getState().drafts[draftId(sessionKey)]?.text).toBe('我的原文')
})

it('opens only a Session belonging to the mounted page Project and rejects stale pages', async () => {
  const session: SessionSummary = { id: 's', projectId: 'p', cli: 'codex', nativeSessionId: null, title: 'Session', titleSource: 'client', model: null, originViewId: null, activity: 'none', stopping: false, errorUnseen: false, completionUnread: false, status: null, createdAt: 1, updatedAt: 1, lastUserMessageAt: 1 }
  useSessions.setState({ summaries: { s: session, foreign: { ...session, id: 'foreign', projectId: 'other' } } })
  const select = vi.fn(); useProjectShell.setState({ setViewConversation: select })
  await openWorkbenchSession(target, 's', () => true)
  expect(select).toHaveBeenCalledExactlyOnceWith('p', { kind: 'session', sessionId: 's' })
  await expect(openWorkbenchSession(target, 'foreign', () => true)).rejects.toThrow('当前 Project')
  await expect(openWorkbenchSession(target, 's', () => false)).rejects.toThrow('页面已切换')
  expect(select).toHaveBeenCalledTimes(1)
})
