import { afterEach, beforeEach, expect, it, vi } from '../../../apps/desktop/node_modules/vitest/dist/index.js'
import { emptyDraft, flushSessionDrafts, useSessions, watchSessionEvents } from '../../../apps/desktop/src/renderer/src/features/session/store'
import type { SessionSummary, SessionSummaryChange } from '../../../apps/desktop/src/shared/session/types'
const initial = useSessions.getState()
const summary = (activity: 'running' | 'none'): SessionSummary => ({
  id: 'race-session', projectId: 'p', cli: 'codex', nativeSessionId: 'native-race', title: 'Race', titleSource: 'client',
  model: null, originViewId: null, activity, stopping: false, errorUnseen: false, completionUnread: activity === 'none',
  status: activity === 'running' ? 'running' : 'completed_unread', createdAt: 1, updatedAt: activity === 'none' ? 3 : 1,lastUserMessageAt:1,
})
let callback: (change: SessionSummaryChange) => void, off: () => void
beforeEach(() => useSessions.setState(initial, true))
afterEach(async () => { off?.(); await flushSessionDrafts(); vi.unstubAllGlobals() })
it('keeps a terminal summary that arrives before first-send IPC acceptance', async () => {
  let resolveCreate!: (value: SessionSummary) => void
  const api = {
    create: () => new Promise<SessionSummary>(resolve => { resolveCreate = resolve }), saveDraft: async () => {},
    onSummaryChanged: (fn: typeof callback) => { callback = fn; return () => {} },
    onTranscriptChanged: () => () => {}, onProvidersChanged: () => () => {},
  }
  vi.stubGlobal('studio', { session: api })
  off = watchSessionEvents()
  useSessions.setState({ providers: [{ cli: 'codex', status: 'available' } as never], drafts: { 'p:draft': { ...emptyDraft(), cli: 'codex', text: 'Instant turn' } } })
  const pending = useSessions.getState().sendComposer({ projectId: 'p', kind: 'new_chat' })
  callback({session: summary('none'),project:{ projectId:'p', attention:'completed_unread', counts:{running:0,needsInput:0} }})
  resolveCreate(summary('running'))
  await pending
  expect(useSessions.getState().summaries['race-session']!.activity).toBe('none')
  expect(useSessions.getState().projectStates.p!.attention).toBe('completed_unread')
})

it('keeps terminal state and a renamed title when rename IPC returns after a terminal event', async () => {
  let resolveRename!: (value: SessionSummary) => void
  const api = {
    rename: () => new Promise<SessionSummary>(resolve => { resolveRename = resolve }),
    onSummaryChanged: (fn: typeof callback) => { callback = fn; return () => {} },
    onTranscriptChanged: () => () => {}, onProvidersChanged: () => () => {},
  }
  vi.stubGlobal('studio', { session: api })
  off = watchSessionEvents()
  useSessions.setState({ summaries: { 'race-session': summary('running') } })
  const pending = useSessions.getState().rename('race-session', 'Renamed')
  callback({ session: { ...summary('none'), title: 'Renamed', titleSource: 'user' }, project: { projectId: 'p', attention: 'completed_unread', counts: { running: 0, needsInput: 0 } } })
  resolveRename({ ...summary('running'), title: 'Renamed', titleSource: 'user' })
  await pending
  expect(useSessions.getState().summaries['race-session']!.activity).toBe('none')
  expect(useSessions.getState().summaries['race-session']!.title).toBe('Renamed')
})
