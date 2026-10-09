import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioApi } from '@shared/ipc/contracts'
import { defaultUiState } from '@shared/project/ui-state'
import type { ComposerDraft, ProviderSummary, SessionSummary, SessionSummaryChange, TranscriptChange, TranscriptItem } from '@shared/session/types'
import type { SessionApi } from './api'
import { draftId, emptyDraft, flushSessionDrafts, upsertTranscript, useSessions, watchSessionEvents } from './store'
import { createRendererSessionPort } from './integration'
import { SessionHistory, historyRows, visibleHistoryRows } from './SessionHistory'
import { Composer } from '../input/Composer'
import { CliMenu } from '../chat/CliMenu'
import { InputRequestCard } from './Transcript'
import { useProjectShell } from '../project/store'

const initial = useSessions.getState(), shellInitial = useProjectShell.getState()
const project = { id: 'p', name: 'Project', canonicalPath: '/tmp/project', localPath: '/tmp/project', createdAt: '', lastOpenedAt: '' }
const key = { projectId: 'p', kind: 'new_chat' as const }
const summary = (patch: Partial<SessionSummary> = {}): SessionSummary => ({ id: 's', projectId: 'p', cli: 'codex', nativeSessionId: 'native', title: 'Build feature', titleSource: 'client', model: null, originViewId: null, activity: 'none', stopping: false, errorUnseen: false, completionUnread: false, status: null, createdAt: Date.now(), updatedAt: Date.now(), lastUserMessageAt: Date.now(), ...patch })
const providers: ProviderSummary[] = ['codex', 'claude-code'].map((cli) => ({ cli: cli as ProviderSummary['cli'], displayName: cli, status: 'available', reason: null, version: '1', compatibility: 'tested', checkedAt: 0, capabilities: { nativeSessionIdTiming: 'on_create', inputWhileRunning: 'none', questionRequests: true, freeTextAnswers: { questions: true, approvals: false }, nativeTitle: false, runtimeRecovery: true } }))
let api: SessionApi, summaryEvent: (event: SessionSummaryChange) => void, transcriptEvent: (event: TranscriptChange) => void
let disposers: (() => void)[]
beforeEach(() => {
  useSessions.setState(initial, true); useProjectShell.setState(shellInitial, true); disposers = []
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('CSS', { escape: (value: string) => value })
  api = {
    list: vi.fn(async () => []), getConversation: vi.fn(async () => ({ session: summary(), items: [], hasMore: false, nextBeforeSequence: null })), create: vi.fn(async () => summary({ activity: 'running', status: 'running' })), send: vi.fn(async () => {}), answer: vi.fn(async () => {}), replyWithText: vi.fn(async () => {}), stop: vi.fn(async () => {}), retry: vi.fn(async () => {}), rename: vi.fn(async ({ title }) => summary({ title, titleSource: 'user' })), setModel: vi.fn(async () => {}), getProviders: vi.fn(async () => providers), getModels: vi.fn(async () => ({ models: [{ id: 'm1', displayName: 'Model One', isDefault: true }, { id: 'm2', displayName: 'Model Two' }], error: null })), getDefaultCli: vi.fn(async () => 'codex' as const), setDefaultCli: vi.fn(async () => {}), getDraft: vi.fn(async () => emptyDraft()), saveDraft: vi.fn(async () => {}), updateViewing: vi.fn(async () => {}), opened: vi.fn(async () => {}), getProjectState: vi.fn(async () => ({ projectId: 'p', attention: null, counts: { running: 0, needsInput: 0 } })), stopProject: vi.fn(async () => ({ stopped: [], failed: [] })), projectClosed: vi.fn(async () => {}),
    onSummaryChanged: (listener) => { summaryEvent = listener; return () => {} }, onTranscriptChanged: (listener) => { transcriptEvent = listener; return () => {} }, onProvidersChanged: () => () => {}
  }
  Object.defineProperty(window, 'studio', { configurable: true, value: { session: api, project: { updateUiState: async ({ patch }: { patch: object }) => ({ ...defaultUiState(), ...patch }) } } as unknown as StudioApi })
  useProjectShell.setState({ projects: { p: project }, uiStates: { p: { ...defaultUiState(), mainCanvas: { mode: 'draft' } } }, windowState: { tabs: [{ kind: 'project', id: 'project:p', projectId: 'p' }], currentTabId: 'project:p', navCollapsed: false } })
})
afterEach(async () => { cleanup(); await flushSessionDrafts(); await useProjectShell.getState().flush(); disposers.forEach((off) => off()); vi.unstubAllGlobals() })

describe('Session IPC store · FR-SESSION/STATE · AC-02–05', () => {
  it('merges streamed item snapshots by stable id and does not lose events arriving during tail-page loading', async () => {
    disposers.push(watchSessionEvents())
    let resolvePage!: (value: Awaited<ReturnType<SessionApi['getConversation']>>) => void
    vi.mocked(api.getConversation).mockImplementation(() => new Promise((resolve) => { resolvePage = resolve }))
    const request = useSessions.getState().loadConversation('s')
    const item: TranscriptItem = { id: 'a', sessionId: 's', turnId: 't', at: 1, sequence: 2, kind: 'agent_message', nativeItemId: 'native-a', complete: false, text: 'Hello' }
    transcriptEvent({ sessionId: 's', items: [item] })
    transcriptEvent({ sessionId: 's', items: [{ ...item, text: 'Hello world', complete: true }] })
    resolvePage({ session: summary(), items: [{ ...item, text: 'Hel' }], hasMore: true, nextBeforeSequence: 2 }); await request
    expect(useSessions.getState().conversations.s!.items).toEqual([{ ...item, text: 'Hello world', complete: true }])
    expect(upsertTranscript([item], [{ ...item, text: 'Final' }])).toHaveLength(1)
  })
  it('keeps a newer summary while Project bootstrap is in flight and exposes Project attention', async () => {
    disposers.push(watchSessionEvents())
    let resolveList!: (value: SessionSummary[]) => void
    vi.mocked(api.list).mockImplementation(() => new Promise((resolve) => { resolveList = resolve }))
    const load = useSessions.getState().loadProject('p')
    summaryEvent({ session: summary({ status: 'needs_input', activity: 'needs_input' }), project: { projectId: 'p', attention: 'needs_input', counts: { running: 0, needsInput: 1 } } })
    resolveList([summary()]); await load
    expect(useSessions.getState().summaries.s!.activity).toBe('needs_input')
    expect(useSessions.getState().projectStates.p!.attention).toBe('needs_input')
  })
  it('aggregates viewing across Projects, sends viewing before opened, and never opens on foreground changes (S-Q1)', async () => {
    const port = createRendererSessionPort(); disposers.push(() => port.dispose())
    port.setViewing('p', 's'); port.setViewing('background', null); port.setWindowForeground(true); port.userOpenedSession('p', 's')
    await Promise.resolve()
    expect(api.updateViewing).toHaveBeenLastCalledWith({ projectId: 'p', sessionId: 's', foreground: true })
    expect(vi.mocked(api.updateViewing).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.opened).mock.invocationCallOrder[0]!)
    port.setWindowForeground(false); port.setViewing('p', null); await Promise.resolve()
    port.setWindowForeground(true); port.setViewing('p', 's'); await Promise.resolve()
    expect(api.opened).toHaveBeenCalledTimes(1)
    port.userOpenedSession('p', 's'); await Promise.resolve(); expect(api.opened).toHaveBeenCalledTimes(2)
  })
  it('creates a Session only on first send and preserves new text typed while creation is pending', async () => {
    await useSessions.getState().loadProject('p')
    expect(api.create).not.toHaveBeenCalled()
    useSessions.getState().updateDraft(key, { cli: 'codex', text: 'Build a feature' })
    let complete!: (value: SessionSummary) => void
    vi.mocked(api.create).mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    const send = useSessions.getState().sendComposer(key)
    useSessions.getState().updateDraft(key, { text: 'Another thought' })
    complete(summary({ status: 'running', activity: 'running' })); await send
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p', cli: 'codex', text: 'Build a feature' }))
    expect(useSessions.getState().drafts[draftId(key)]!.text).toBe('Another thought')
    expect(useSessions.getState().summaries.s!.status).toBe('running')
  })
  it('rejects unavailable CLI before creation and keeps its draft', async () => {
    useSessions.setState({ providers: [{ ...providers[0]!, status: 'not_logged_in', reason: '请先登录 Codex CLI' }] })
    useSessions.getState().updateDraft(key, { cli: 'codex', text: 'Keep this' })
    expect(await useSessions.getState().sendComposer(key)).toBeNull()
    expect(api.create).not.toHaveBeenCalled(); expect(useSessions.getState().drafts[draftId(key)]!.text).toBe('Keep this')
    expect(useSessions.getState().errors[draftId(key)]).toContain('请先登录')
  })
})

describe('Composer · FR-CHAT/INPUT · AC-02/05', () => {
  async function mount(draft: Partial<ComposerDraft> = {}) {
    useSessions.setState({ providers, drafts: { [draftId(key)]: { ...emptyDraft(), cli: 'codex', ...draft } } })
    render(<Composer draftKey={key} active />); await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model Selector' }).hasAttribute('disabled')).toBe(false))
    return screen.getByRole('textbox', { name: '消息' })
  }
  it('handles IME confirmation and Shift+Enter without submitting; successful Send clears and saves the draft', async () => {
    const input = await mount({ text: '中文输入' })
    fireEvent.compositionStart(input); fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 }); fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(api.create).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(useSessions.getState().drafts[draftId(key)]!.text).toBe(''))
    expect(api.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ draft: expect.objectContaining({ text: '' }) }))
  })
  it('keeps Running input editable, sends no queued messages, and routes nonempty Needs Input text to replyWithText', async () => {
    const sessionKey = { projectId: 'p', kind: 'session' as const, sessionId: 's' }
    useSessions.setState({ summaries: { s: summary({ activity: 'running', status: 'running' }) }, drafts: { [draftId(sessionKey)]: { ...emptyDraft(), text: 'Later' } } })
    render(<Composer draftKey={sessionKey} active />)
    const input = screen.getByRole('textbox', { name: '消息' })
    expect(input.hasAttribute('disabled')).toBe(false); fireEvent.keyDown(input, { key: 'Enter' })
    expect(api.send).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    act(() => useSessions.setState({ summaries: { s: summary({ activity: 'needs_input', status: 'needs_input' }) } }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.replyWithText).toHaveBeenCalledWith({ sessionId: 's', text: 'Later' }))
  })
  it('lets Running Sessions select the next model and falls back from a removed model before sending', async () => {
    const sessionKey = { projectId: 'p', kind: 'session' as const, sessionId: 's' }
    useSessions.setState({ summaries: { s: summary({ activity: 'running', model: 'm1' }) }, drafts: { [draftId(sessionKey)]: { ...emptyDraft(), text: 'Next' } } })
    render(<Composer draftKey={sessionKey} active />)
    const picker = screen.getByRole('combobox', { name: 'Model Selector' })
    await waitFor(() => expect(picker.hasAttribute('disabled')).toBe(false))
    fireEvent.change(picker, { target: { value: 'm2' } }); await waitFor(() => expect(api.setModel).toHaveBeenCalledWith({ sessionId: 's', model: 'm2' }))
    act(() => useSessions.setState({ summaries: { s: summary({ activity: 'none', model: 'removed' }) } }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.setModel).toHaveBeenCalledWith({ sessionId: 's', model: null }))
    await waitFor(() => expect(api.send).toHaveBeenCalledWith(expect.objectContaining({ text: 'Next' })))
  })
  it('shows CLI unavailability reasons and disables selecting that CLI', async () => {
    vi.mocked(api.getProviders).mockResolvedValue([{ ...providers[0]!, status: 'not_logged_in', reason: '请先登录 Codex CLI' }, providers[1]!])
    render(<CliMenu project={project} canvas={{ mode: 'draft' }} active dismiss={() => {}} />)
    await screen.findByText('请先登录 Codex CLI')
    expect(screen.getByRole('button', { name: 'Codex CLI' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Claude Code' }).hasAttribute('disabled')).toBe(false)
  })
})

describe('Session History and native input cards · FR-NAV-003/STATE-002', () => {
  it('virtualizes 2,000 Sessions, anchors dates to user messages, and persists in-place Rename', async () => {
    const list = Array.from({ length: 2000 }, (_, index) => summary({ id: `s${index}`, title: `Session ${index}`, lastUserMessageAt: Date.now() - index * 1_000, updatedAt: Date.now() + index * 1_000 }))
    const rows = historyRows(list)
    expect(rows.filter((row) => row.kind === 'session').slice(0, 2).map((row) => row.id)).toEqual(['s0', 's1'])
    expect(visibleHistoryRows(rows, 40_000, 320).length).toBeLessThan(30)
    useSessions.setState({ summaries: Object.fromEntries(list.map((s) => [s.id, s])), projects: { p: { loaded: true, loading: false, error: null } } })
    render(<SessionHistory project={project} canvas={{ mode: 'draft' }} active />)
    expect(document.querySelectorAll('[data-session-row]').length).toBeLessThan(30)
    fireEvent.click(screen.getByRole('button', { name: '更多操作 Session 0' })); fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Session 标题' })
    expect(document.activeElement).toBe(input); fireEvent.change(input, { target: { value: 'Renamed Session' } }); fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(api.rename).toHaveBeenCalledWith({ sessionId: 's0', title: 'Renamed Session' }))
    expect(api.opened).not.toHaveBeenCalled()
  })
  it('uses native approval option ids and turns answered cards into readonly records', async () => {
    const item: Extract<TranscriptItem, { kind: 'input_request' }> = { id: 'request', sessionId: 's', turnId: 't', sequence: 1, at: 0, kind: 'input_request', request: { kind: 'approval', requestId: 'r', turnId: 't', createdAt: 0, nativeType: 'Bash', subject: 'command', title: 'Allow command?', command: 'pwd', allowsMessage: false, options: [{ id: 'native-yes', label: 'Allow once', intent: 'allow', primary: true }, { id: 'native-no', label: 'Deny', intent: 'deny' }] }, resolution: null }
    useSessions.setState({ summaries: { s: summary({ activity: 'needs_input', status: 'needs_input' }) } })
    const view = render(<InputRequestCard item={item} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' })); await waitFor(() => expect(api.answer).toHaveBeenCalledWith({ sessionId: 's', requestId: 'r', response: { kind: 'approval', optionId: 'native-yes' } }))
    view.rerender(<InputRequestCard item={{ ...item, resolution: { status: 'answered', response: { kind: 'approval', optionId: 'native-yes' } } }} />)
    expect(screen.queryByRole('button', { name: 'Allow once' })).toBeNull(); expect(screen.getByText('已选择：Allow once')).toBeTruthy()
  })
})
