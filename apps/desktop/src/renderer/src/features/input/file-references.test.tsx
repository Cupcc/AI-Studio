import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioApi } from '@shared/ipc/contracts'
import type { MainCanvas } from '@shared/project/types'
import { defaultUiState } from '@shared/project/ui-state'
import type { ComposerDraft, ContextItem, ProviderSummary, SessionSummary } from '@shared/session/types'
import { FILES_LIMITS } from '@shared/tools/files'
import { SessionConversation } from '../session/Conversation'
import { draftId, emptyDraft, FILE_REPLY_BLOCKED, flushSessionDrafts, useSessions } from '../session/store'
import type { SessionApi } from '../session/api'
import { useProjectShell } from '../project/store'
import { addFileReference, displayedDraftKey } from './add-file-reference'
import { Composer } from './Composer'

const sessionsInitial = useSessions.getState(), shellInitial = useProjectShell.getState()
const project = { id: 'p', name: 'Project', canonicalPath: '/tmp/project', localPath: '/tmp/project', displayPath: '/tmp/project', createdAt: '', lastOpenedAt: '' }
const summary = (patch: Partial<SessionSummary> = {}): SessionSummary => ({ id: 's', projectId: 'p', cli: 'codex', nativeSessionId: 'native', title: 'Build feature', titleSource: 'client', model: null, originViewId: null, activity: 'none', stopping: false, errorUnseen: false, completionUnread: false, status: null, createdAt: 1, updatedAt: 1, lastUserMessageAt: 1, ...patch })
const providers: ProviderSummary[] = (['codex', 'claude-code'] as const).map(cli => ({ cli, displayName: cli, status: 'available', reason: null, version: '1', compatibility: 'tested', checkedAt: 0, capabilities: { nativeSessionIdTiming: 'on_create', inputWhileRunning: cli === 'codex' ? 'steer' : 'none', questionRequests: true, freeTextAnswers: { questions: true, approvals: false }, nativeTitle: false, runtimeRecovery: true } }))
const file = (path: string): ContextItem => ({ type: 'file', path })
const draftKey = { projectId: 'p', kind: 'new_chat' as const }
const sessionKey = { projectId: 'p', kind: 'session' as const, sessionId: 's' }
const viewDraftKey = { projectId: 'p', kind: 'new_chat' as const, viewId: 'architecture' }
let api: SessionApi
let stored: Record<string, ComposerDraft>

function show(mainCanvas: MainCanvas, patch: Partial<ReturnType<typeof defaultUiState>> = {}) {
  useProjectShell.setState({ uiStates: { p: { ...defaultUiState(), mainCanvas, ...patch } } })
}
const keyOf = (key: { projectId: string; kind: 'new_chat' | 'session'; sessionId?: string; viewId?: string }) => key.kind === 'session' ? `session:${key.sessionId}` : key.viewId ? `view:${key.viewId}` : 'new'

beforeEach(() => {
  useSessions.setState(sessionsInitial, true); useProjectShell.setState(shellInitial, true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  stored = {}
  api = {
    list: vi.fn(async () => []), getConversation: vi.fn(async () => ({ session: summary(), items: [], hasMore: false, nextBeforeSequence: null })),
    create: vi.fn(async () => summary({ activity: 'running', status: 'running' })), send: vi.fn(async () => {}), replyWithText: vi.fn(async () => {}),
    getSkills: vi.fn(async () => ({ skills: [], error: null })), stop: vi.fn(async () => {}), setModel: vi.fn(async () => {}), getProviders: vi.fn(async () => providers),
    getModels: vi.fn(async () => ({ models: [{ id: 'm1', displayName: 'Model One', isDefault: true }], error: null })),
    getDefaultCli: vi.fn(async () => 'codex' as const),
    getDraft: vi.fn(async (key) => structuredClone(stored[keyOf(key)] ?? emptyDraft())),
    saveDraft: vi.fn(async ({ key, draft }) => { stored[keyOf(key)] = structuredClone(draft) }),
    getProjectState: vi.fn(async () => ({ projectId: 'p', attention: null, counts: { running: 0, needsInput: 0 } })),
    opened: vi.fn(async () => {}), updateViewing: vi.fn(async () => {}),
    onSummaryChanged: () => () => {}, onTranscriptChanged: () => () => {}, onProvidersChanged: () => () => {}
  } as unknown as SessionApi
  Object.defineProperty(window, 'studio', { configurable: true, value: { session: api, project: { updateUiState: async ({ patch }: { patch: object }) => ({ ...defaultUiState(), ...patch }) } } as unknown as StudioApi })
  useProjectShell.setState({ projects: { p: project }, windowState: { tabs: [{ kind: 'project', id: 'project:p', projectId: 'p' }], currentTabId: 'project:p', navCollapsed: false } })
  show({ mode: 'draft' })
})
afterEach(async () => { cleanup(); await flushSessionDrafts(); await useProjectShell.getState().flush(); vi.unstubAllGlobals() })
const draftOf = (key: Parameters<typeof draftId>[0]) => useSessions.getState().drafts[draftId(key)]

describe('addFileReference · Tools §4.1, FR-INPUT-001', () => {
  it('derives the displayed draft or Session from the main canvas, including both View conversations', () => {
    expect(displayedDraftKey('p', { mode: 'draft' })).toEqual(draftKey)
    expect(displayedDraftKey('p', { mode: 'session', sessionId: 's' })).toEqual(sessionKey)
    expect(displayedDraftKey('p', { mode: 'view', viewId: 'architecture', conversation: { kind: 'draft' } })).toEqual(viewDraftKey)
    expect(displayedDraftKey('p', { mode: 'view', viewId: 'architecture', conversation: { kind: 'session', sessionId: 's' } })).toEqual(sessionKey)
  })

  it.each([
    ['the new-chat draft', { mode: 'draft' } as MainCanvas, draftKey],
    ['the open Session', { mode: 'session', sessionId: 's' } as MainCanvas, sessionKey],
    ['the View draft, not the plain draft', { mode: 'view', viewId: 'architecture', conversation: { kind: 'draft' } } as MainCanvas, viewDraftKey],
    ['the Session shown in a View', { mode: 'view', viewId: 'architecture', conversation: { kind: 'session', sessionId: 's' } } as MainCanvas, sessionKey]
  ])('adds the tag to %s only', async (_name, canvas, key) => {
    show(canvas)
    expect(await addFileReference({ projectId: 'p', canvas, path: 'src/a.ts' })).toEqual({ status: 'added' })
    expect(draftOf(key)!.contextItems).toContainEqual(file('src/a.ts'))
    for (const other of [draftKey, sessionKey, viewDraftKey]) if (draftId(other) !== draftId(key)) expect(draftOf(other)).toBeUndefined()
    await flushSessionDrafts()
    expect(api.saveDraft).toHaveBeenCalledWith({ key, draft: expect.objectContaining({ contextItems: expect.arrayContaining([file('src/a.ts')]) }) })
  })

  it('loads the stored draft before editing, so the stored text and CLI are not overwritten by an empty draft', async () => {
    stored.new = { cli: 'claude-code', model: 'm1', text: 'unsent thought', contextItems: [] }
    expect(draftOf(draftKey)).toBeUndefined()
    expect(await addFileReference({ projectId: 'p', canvas: { mode: 'draft' }, path: 'docs/my file.md' })).toEqual({ status: 'added' })
    expect(draftOf(draftKey)).toEqual({ cli: 'claude-code', model: 'm1', text: 'unsent thought', contextItems: [file('docs/my file.md')] })
    await flushSessionDrafts()
    expect(stored.new).toEqual({ cli: 'claude-code', model: 'm1', text: 'unsent thought', contextItems: [file('docs/my file.md')] })
    expect(vi.mocked(api.getDraft).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.saveDraft).mock.invocationCallOrder[0]!)
  })

  it('keeps the existing View tag and appends file tags after it, in click order', async () => {
    const canvas: MainCanvas = { mode: 'view', viewId: 'architecture', conversation: { kind: 'draft' } }
    show(canvas)
    stored['view:architecture'] = { cli: 'codex', model: null, text: '', contextItems: [{ type: 'view', viewId: 'architecture' }] }
    await addFileReference({ projectId: 'p', canvas, path: 'b.ts' }); await addFileReference({ projectId: 'p', canvas, path: 'a.ts' })
    expect(draftOf(viewDraftKey)!.contextItems).toEqual([{ type: 'view', viewId: 'architecture' }, file('b.ts'), file('a.ts')])
  })

  it('rejects, without writing anywhere, when the user switches conversation while the draft loads', async () => {
    let release!: () => void
    vi.mocked(api.getDraft).mockImplementation(() => new Promise(resolve => { release = () => resolve(emptyDraft()) }))
    const adding = addFileReference({ projectId: 'p', canvas: { mode: 'draft' }, path: 'src/a.ts' })
    act(() => show({ mode: 'session', sessionId: 's' }))
    release()
    expect(await adding).toEqual({ status: 'rejected', reason: 'conversation_changed' })
    // The draft the user left stays untouched; nothing was saved for either conversation.
    expect(draftOf(draftKey)?.contextItems ?? []).toEqual([])
    expect(draftOf(sessionKey)).toBeUndefined()
    expect(api.saveDraft).not.toHaveBeenCalled()
  })

  it.each([
    ['another View', { mode: 'view', viewId: 'progress', conversation: { kind: 'draft' } } as MainCanvas],
    ['the View conversation turning into a Session', { mode: 'view', viewId: 'architecture', conversation: { kind: 'session', sessionId: 's' } } as MainCanvas],
    ['Session Mode', { mode: 'draft' } as MainCanvas]
  ])('rejects when the View draft is replaced by %s mid-await', async (_name, next) => {
    const canvas: MainCanvas = { mode: 'view', viewId: 'architecture', conversation: { kind: 'draft' } }
    show(canvas)
    let release!: () => void
    vi.mocked(api.getDraft).mockImplementation(() => new Promise(resolve => { release = () => resolve(emptyDraft()) }))
    const adding = addFileReference({ projectId: 'p', canvas, path: 'src/a.ts' })
    act(() => show(next)); release()
    expect(await adding).toEqual({ status: 'rejected', reason: 'conversation_changed' })
    expect(api.saveDraft).not.toHaveBeenCalled()
  })

  it('rejects at once when the caller\'s canvas is already not the displayed one', async () => {
    show({ mode: 'session', sessionId: 's' })
    expect(await addFileReference({ projectId: 'p', canvas: { mode: 'draft' }, path: 'a.ts' })).toEqual({ status: 'rejected', reason: 'conversation_changed' })
    expect(api.getDraft).not.toHaveBeenCalled()
    useProjectShell.setState({ uiStates: {} })
    expect(await addFileReference({ projectId: 'p', canvas: { mode: 'draft' }, path: 'a.ts' })).toEqual({ status: 'rejected', reason: 'conversation_changed' })
  })

  it('de-duplicates by path and reports it', async () => {
    const canvas: MainCanvas = { mode: 'draft' }
    expect(await addFileReference({ projectId: 'p', canvas, path: 'a.ts' })).toEqual({ status: 'added' })
    expect(await addFileReference({ projectId: 'p', canvas, path: 'a.ts' })).toEqual({ status: 'duplicate' })
    expect(await addFileReference({ projectId: 'p', canvas, path: 'A.ts' })).toEqual({ status: 'added' })
    expect(draftOf(draftKey)!.contextItems).toEqual([file('a.ts'), file('A.ts')])
  })

  it(`allows ${FILES_LIMITS.referencesPerMessage} file tags, then rejects the next; a duplicate at the limit is still a duplicate; View tags do not count`, async () => {
    const canvas: MainCanvas = { mode: 'draft' }
    stored.new = { cli: 'codex', model: null, text: '', contextItems: [{ type: 'view', viewId: 'overview' }] }
    for (let index = 0; index < FILES_LIMITS.referencesPerMessage; index++) expect(await addFileReference({ projectId: 'p', canvas, path: `f${index}.ts` })).toEqual({ status: 'added' })
    expect(await addFileReference({ projectId: 'p', canvas, path: 'extra.ts' })).toEqual({ status: 'rejected', reason: 'limit' })
    expect(await addFileReference({ projectId: 'p', canvas, path: 'f3.ts' })).toEqual({ status: 'duplicate' })
    expect(draftOf(draftKey)!.contextItems).toHaveLength(FILES_LIMITS.referencesPerMessage + 1)
  })

  it.each(['', '/etc/passwd', '../x', 'a/../b', 'a//b', 'dir/', 'a\u0000b', 'tab\tname', 'new\nline'])('rejects the path %j without touching a draft', async path => {
    expect(await addFileReference({ projectId: 'p', canvas: { mode: 'draft' }, path })).toEqual({ status: 'rejected', reason: 'invalid_path' })
    expect(api.getDraft).not.toHaveBeenCalled(); expect(api.saveDraft).not.toHaveBeenCalled()
  })

  it('reports draft_unavailable when the draft cannot be loaded and never writes an empty one', async () => {
    show({ mode: 'session', sessionId: 's' })
    vi.mocked(api.getDraft).mockRejectedValue(new Error('未知 Session'))
    expect(await addFileReference({ projectId: 'p', canvas: { mode: 'session', sessionId: 's' }, path: 'a.ts' })).toEqual({ status: 'rejected', reason: 'draft_unavailable' })
    expect(api.saveDraft).not.toHaveBeenCalled()
  })

  it('two quick adds of the same file add it once', async () => {
    const canvas: MainCanvas = { mode: 'draft' }
    const results = await Promise.all([addFileReference({ projectId: 'p', canvas, path: 'a.ts' }), addFileReference({ projectId: 'p', canvas, path: 'a.ts' })])
    expect(results.map(result => result.status).sort()).toEqual(['added', 'duplicate'])
    expect(draftOf(draftKey)!.contextItems).toEqual([file('a.ts')])
  })
})

describe('Composer: + menu, tags and Needs Input · I-Q4, FR-INPUT-001', () => {
  const mount = async (key: Parameters<typeof draftId>[0], draft: Partial<ComposerDraft> = {}, extra: Partial<ReturnType<typeof useSessions.getState>> = {}) => {
    useSessions.setState({ providers, drafts: { [draftId(key)]: { ...emptyDraft(), cli: 'codex', ...draft } }, ...extra })
    render(<Composer draftKey={key} active />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Model Selector' }).hasAttribute('disabled')).toBe(false))
  }
  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Context / Attachment' }))

  it('enables "从 Files 添加文件" with its sub-note; only a click selects the Files tool (Session Mode)', async () => {
    await mount(draftKey)
    expect(useProjectShell.getState().uiStates.p).toMatchObject({ sidebarOpen: false, lastTool: null })
    openMenu()
    const item = screen.getByRole('button', { name: '从 Files 添加文件' })
    expect(item.hasAttribute('disabled')).toBe(false)
    expect(item.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByText('在 Files 中选择文件后点击「添加到对话」').id).toBe(item.getAttribute('aria-describedby'))
    expect(screen.queryByText('暂不支持添加附件')).toBeNull()
    // Opening the menu, or waiting, never moves the layout.
    expect(useProjectShell.getState().uiStates.p).toMatchObject({ sidebarOpen: false, lastTool: null })
    fireEvent.click(item)
    expect(useProjectShell.getState().uiStates.p).toMatchObject({ sidebarOpen: true, lastTool: 'files' })
    expect(screen.queryByRole('button', { name: '从 Files 添加文件' })).toBeNull()
    expect(api.saveDraft).not.toHaveBeenCalled()
    expect(draftOf(draftKey)!.contextItems).toEqual([])
  })

  it('selects Files in the right area of a Project View too', async () => {
    show({ mode: 'view', viewId: 'architecture', conversation: { kind: 'draft' } })
    await mount(viewDraftKey)
    openMenu(); fireEvent.click(screen.getByRole('button', { name: '从 Files 添加文件' }))
    expect(useProjectShell.getState().uiStates.p).toMatchObject({ viewRightArea: 'files', lastTool: 'files' })
  })

  it('shows each file tag by its file name with the full path as title, and removes tags one at a time', async () => {
    await mount(draftKey, { contextItems: [file('src/deep/a.ts'), file('docs/my file.md'), file('other/a.ts')] })
    const tags = document.querySelectorAll<HTMLElement>('.composer__tag')
    expect([...tags].map(tag => tag.querySelector('.composer__tag-name')!.textContent)).toEqual(['a.ts', 'my file.md', 'a.ts'])
    expect([...tags].map(tag => tag.title)).toEqual(['src/deep/a.ts', 'docs/my file.md', 'other/a.ts'])
    fireEvent.click(screen.getByRole('button', { name: '移除上下文 docs/my file.md' }))
    expect(draftOf(draftKey)!.contextItems).toEqual([file('src/deep/a.ts'), file('other/a.ts')])
    await flushSessionDrafts()
    expect(stored.new!.contextItems).toEqual([file('src/deep/a.ts'), file('other/a.ts')])
  })

  it('sends the file tags with the message and clears them only after it was accepted', async () => {
    await mount(draftKey, { text: 'look at these', contextItems: [file('src/a.ts'), file('docs/my file.md')] })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ text: 'look at these', contextItems: [file('src/a.ts'), file('docs/my file.md')] })))
    await waitFor(() => expect(draftOf(draftKey)!.contextItems).toEqual([]))
  })

  it.each(['create', 'send'] as const)('keeps the text and every tag when %s refuses a file, and shows why', async method => {
    const reason = '文件引用失败，消息未发送：src/a.ts（文件已不存在）'
    vi.mocked(api[method]).mockRejectedValue(new Error(reason))
    const key = method === 'create' ? draftKey : sessionKey
    if (method === 'send') useSessions.setState({ summaries: { s: summary() } })
    await mount(key, { text: 'keep me', contextItems: [file('src/a.ts'), file('b.ts')] })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect((await screen.findByRole('alert')).textContent).toContain(reason)
    expect(draftOf(key)).toMatchObject({ text: 'keep me', contextItems: [file('src/a.ts'), file('b.ts')] })
    expect(document.querySelectorAll('.composer__tag')).toHaveLength(2)
    // Nothing was cleared in storage either.
    await flushSessionDrafts()
    expect(api.saveDraft).not.toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({ text: '' }) }))
  })

  it('blocks a Needs Input reply that carries file tags: no call, input and tags kept, the reason shown, Send disabled', async () => {
    await mount(sessionKey, { text: 'answer', contextItems: [file('src/a.ts')] }, { summaries: { s: summary({ activity: 'needs_input', status: 'needs_input' }) } })
    expect(screen.getByRole('status').textContent).toBe(FILE_REPLY_BLOCKED)
    expect(FILE_REPLY_BLOCKED).toBe('回复 Agent 时不能附带文件、图片或 Skill，请先移除标签或等待本轮结束')
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send.hasAttribute('disabled')).toBe(true)
    fireEvent.click(send); fireEvent.keyDown(screen.getByRole('textbox', { name: '回复 Agent' }), { key: 'Enter' })
    expect(api.replyWithText).not.toHaveBeenCalled(); expect(api.send).not.toHaveBeenCalled()
    expect(draftOf(sessionKey)).toMatchObject({ text: 'answer', contextItems: [file('src/a.ts')] })
    // Removing the tag lifts the block and the reply goes out as before; the notice disappears with it.
    fireEvent.click(screen.getByRole('button', { name: '移除上下文 src/a.ts' }))
    expect(screen.queryByText(FILE_REPLY_BLOCKED)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.replyWithText).toHaveBeenCalledWith({ sessionId: 's', text: 'answer' }))
  })

  it('also blocks at the store when sendComposer is called directly, and leaves the draft as it was', async () => {
    useSessions.setState({ providers, summaries: { s: summary({ activity: 'needs_input', status: 'needs_input' }) } })
    useSessions.getState().updateDraft(sessionKey, { cli: 'codex', text: 'answer', contextItems: [file('src/a.ts')] })
    expect(await useSessions.getState().sendComposer(sessionKey)).toBeNull()
    expect(api.replyWithText).not.toHaveBeenCalled()
    expect(useSessions.getState().errors[draftId(sessionKey)]).toBe(FILE_REPLY_BLOCKED)
    expect(draftOf(sessionKey)).toMatchObject({ text: 'answer', contextItems: [file('src/a.ts')] })
  })

  it('does not block ordinary Needs Input replies, nor file tags once the turn is Running or idle', async () => {
    await mount(sessionKey, { text: 'plain answer' }, { summaries: { s: summary({ activity: 'needs_input', status: 'needs_input' }) } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.replyWithText).toHaveBeenCalledWith({ sessionId: 's', text: 'plain answer' }))
    act(() => useSessions.setState({ summaries: { s: summary({ activity: 'none' }) } }))
    useSessions.getState().updateDraft(sessionKey, { text: 'later', contextItems: [file('a.ts')] })
    expect(screen.queryByText(FILE_REPLY_BLOCKED)).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.send).toHaveBeenCalledWith({ sessionId: 's', text: 'later', contextItems: [file('a.ts')] }))
  })

  it('Session conversation mounts the same Composer, so the + menu and tags work there', async () => {
    useSessions.setState({ providers, summaries: { s: summary() }, drafts: { [draftId(sessionKey)]: { ...emptyDraft(), cli: 'codex', contextItems: [file('x/y.ts')] } } })
    show({ mode: 'session', sessionId: 's' })
    render(<SessionConversation projectId="p" sessionId="s" active />)
    const composer = document.querySelector<HTMLElement>('.composer')!
    expect(within(composer).getByText('y.ts')).toBeTruthy()
    fireEvent.click(within(composer).getByRole('button', { name: 'Context / Attachment' }))
    expect(within(composer).getByRole('button', { name: '从 Files 添加文件' }).hasAttribute('disabled')).toBe(false)
  })
})
