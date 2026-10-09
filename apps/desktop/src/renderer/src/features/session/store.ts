import { create } from 'zustand'
import type { ComposerDraft, DraftKey, InputResponse, ModelCatalogResult, ProviderSummary, SessionCli, SessionProjectState, SessionSummary, TranscriptItem } from '@shared/session/types'
import { projectSessionState } from '@shared/session/presentation'
import { sessionApi } from './api'

export const emptyDraft = (): ComposerDraft => ({ cli: null, model: null, text: '', contextItems: [] })
export const draftId = (key: DraftKey): string => key.kind === 'new_chat' ? `${key.projectId}:draft` : `${key.projectId}:session:${key.sessionId}`
export const cliName = (cli: SessionCli | null): string => cli === 'codex' ? 'Codex CLI' : cli === 'claude-code' ? 'Claude Code' : '选择 CLI'

export interface ConversationState {
  items: TranscriptItem[]
  loaded: boolean
  loading: boolean
  hasMore: boolean
  before: number | null
  error: string | null
}
const emptyConversation = (): ConversationState => ({ items: [], loaded: false, loading: false, hasMore: false, before: null, error: null })
export function upsertTranscript(previous: readonly TranscriptItem[], incoming: readonly TranscriptItem[]): TranscriptItem[] {
  const byId = new Map(previous.map((item) => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence)
}

interface SessionStore {
  summaries: Record<string, SessionSummary>
  projects: Record<string, { loaded: boolean; loading: boolean; error: string | null }>
  projectStates: Record<string, SessionProjectState>
  providers: ProviderSummary[]
  providersError: string | null
  defaultCli: Record<string, SessionCli | null>
  conversations: Record<string, ConversationState>
  drafts: Record<string, ComposerDraft>
  draftLoading: Record<string, boolean>
  catalogs: Record<string, ModelCatalogResult>
  pending: Record<string, boolean>
  errors: Record<string, string | null>
  opened: Record<string, number>
  loadProject(projectId: string): Promise<void>
  loadProviders(): Promise<void>
  loadConversation(sessionId: string, older?: boolean): Promise<void>
  loadDraft(key: DraftKey): Promise<void>
  updateDraft(key: DraftKey, patch: Partial<ComposerDraft>): void
  startDraft(projectId: string, cli?: SessionCli): void
  setDefaultCli(projectId: string, cli: SessionCli): Promise<void>
  loadModels(projectId: string, cli: SessionCli): Promise<void>
  sendComposer(key: DraftKey, originViewId?: string | null): Promise<SessionSummary | null>
  answer(sessionId: string, requestId: string, response: InputResponse): Promise<boolean>
  stop(sessionId: string): Promise<boolean>
  retry(sessionId: string): Promise<boolean>
  rename(sessionId: string, title: string): Promise<boolean>
  setModel(sessionId: string, model: string | null): Promise<boolean>
  userOpened(projectId: string, sessionId: string): void
  closeProject(projectId: string): void
}

const loads = new Map<string, Promise<void>>()
const draftWrites = new Set<Promise<unknown>>()
const summaryVersions = new Map<string, number>()
const transcriptVersions = new Map<string, Map<string, number>>()
let revision = 0
function acceptSummary(summary: SessionSummary): void {
  summaryVersions.set(summary.id, ++revision)
  useSessions.setState((s) => ({ summaries: { ...s.summaries, [summary.id]: summary }, projectStates: { ...s.projectStates, [summary.projectId]: projectSessionState(summary.projectId, [...Object.values(s.summaries).filter((v) => v.id !== summary.id), summary]) } }))
}
function writeDraft(key: DraftKey, draft: ComposerDraft): void {
  // Dispatch in edit order. Main's synchronous draft storage preserves IPC order.
  const pending = sessionApi().saveDraft({ key, draft }).catch((error) => {
    useSessions.setState((s) => ({ errors: { ...s.errors, [draftId(key)]: `输入保存失败：${String(error)}` } }))
  })
  draftWrites.add(pending)
  void pending.finally(() => draftWrites.delete(pending))
}
export async function flushSessionDrafts(): Promise<void> { await Promise.all([...draftWrites]) }
async function once(key: string, work: () => Promise<void>): Promise<void> {
  const current = loads.get(key)
  if (current) return current
  const promise = work().finally(() => loads.delete(key))
  loads.set(key, promise)
  return promise
}
async function operation(key: string, work: () => Promise<void>): Promise<boolean> {
  if (useSessions.getState().pending[key]) return false
  useSessions.setState((s) => ({ pending: { ...s.pending, [key]: true }, errors: { ...s.errors, [key]: null } }))
  try { await work(); return true }
  catch (error) { useSessions.setState((s) => ({ errors: { ...s.errors, [key]: String(error) } })); return false }
  finally { useSessions.setState((s) => ({ pending: { ...s.pending, [key]: false } })) }
}

export const useSessions = create<SessionStore>()((set, get) => ({
  summaries: {}, projects: {}, projectStates: {}, providers: [], providersError: null, defaultCli: {}, conversations: {}, drafts: {}, draftLoading: {}, catalogs: {}, pending: {}, errors: {}, opened: {},
  async loadProject(projectId) {
    if (get().projects[projectId]?.loaded) return
    return once(`project:${projectId}`, async () => {
      set((s) => ({ projects: { ...s.projects, [projectId]: { loaded: false, loading: true, error: null } } }))
      const startedAt = revision
      try {
        const [sessions, state, cli] = await Promise.all([sessionApi().list({ projectId }), sessionApi().getProjectState({ projectId }), sessionApi().getDefaultCli({ projectId })])
        set((s) => {
          const summaries = { ...s.summaries }
          for (const summary of sessions) if ((summaryVersions.get(summary.id) ?? 0) <= startedAt) summaries[summary.id] = summary
          return { summaries, projectStates: { ...s.projectStates, [projectId]: Object.values(summaries).some((v) => (summaryVersions.get(v.id) ?? 0) > startedAt && v.projectId === projectId) ? projectSessionState(projectId, Object.values(summaries)) : state }, defaultCli: { ...s.defaultCli, [projectId]: cli }, projects: { ...s.projects, [projectId]: { loaded: true, loading: false, error: null } } }
        })
        await Promise.all([get().loadProviders(), get().loadDraft({ projectId, kind: 'new_chat' })])
      } catch (error) { set((s) => ({ projects: { ...s.projects, [projectId]: { loaded: false, loading: false, error: String(error) } } })) }
    })
  },
  async loadProviders() {
    return once('providers', async () => {
      try { set({ providers: await sessionApi().getProviders(), providersError: null }) }
      catch (error) { set({ providersError: String(error) }) }
    })
  },
  async loadConversation(sessionId, older = false) {
    const existing = get().conversations[sessionId] ?? emptyConversation()
    if (existing.loading || (older ? !existing.hasMore : existing.loaded)) return
    set((s) => ({ conversations: { ...s.conversations, [sessionId]: { ...existing, loading: true, error: null } } }))
    const startedAt = revision
    try {
      const page = await sessionApi().getConversation({ sessionId, ...(older && existing.before !== null ? { beforeSequence: existing.before } : {}) })
      if ((summaryVersions.get(sessionId) ?? 0) <= startedAt) acceptSummary(page.session)
      set((s) => {
        const current = s.conversations[sessionId] ?? emptyConversation()
        const versions = transcriptVersions.get(sessionId)
        const incoming = page.items.filter((item) => (versions?.get(item.id) ?? 0) <= startedAt)
        return { conversations: { ...s.conversations, [sessionId]: { items: upsertTranscript(current.items, incoming), loaded: true, loading: false, hasMore: page.hasMore, before: page.nextBeforeSequence, error: null } } }
      })
    } catch (error) { set((s) => ({ conversations: { ...s.conversations, [sessionId]: { ...(s.conversations[sessionId] ?? existing), loading: false, error: String(error) } } })) }
  },
  async loadDraft(key) {
    const id = draftId(key)
    if (get().drafts[id]) return
    return once(`draft:${id}`, async () => {
      set((s) => ({ draftLoading: { ...s.draftLoading, [id]: true } }))
      try {
        const saved = await sessionApi().getDraft(key)
        set((s) => ({ drafts: { ...s.drafts, [id]: s.drafts[id] ?? { ...saved, cli: saved.cli ?? (key.kind === 'new_chat' ? s.defaultCli[key.projectId] ?? null : s.summaries[key.sessionId]?.cli ?? null) } } }))
      } catch (error) { set((s) => ({ errors: { ...s.errors, [id]: `输入加载失败：${String(error)}` } })) }
      finally { set((s) => ({ draftLoading: { ...s.draftLoading, [id]: false } })) }
    })
  },
  updateDraft(key, patch) {
    const id = draftId(key), draft = { ...(get().drafts[id] ?? emptyDraft()), ...patch }
    set((s) => ({ drafts: { ...s.drafts, [id]: draft } }))
    writeDraft(key, draft)
  },
  startDraft(projectId, cli) {
    void get().loadDraft({ projectId, kind: 'new_chat' }).then(() => {
      const key: DraftKey = { projectId, kind: 'new_chat' }, current = get().drafts[draftId(key)] ?? emptyDraft()
      const selected = cli ?? current.cli ?? get().defaultCli[projectId] ?? get().providers.find((p) => p.status === 'available')?.cli ?? null
      get().updateDraft(key, { cli: selected, ...(selected !== current.cli ? { model: null } : {}) })
    })
  },
  async setDefaultCli(projectId, cli) {
    await operation(`default:${projectId}`, async () => { await sessionApi().setDefaultCli({ projectId, cli }); set((s) => ({ defaultCli: { ...s.defaultCli, [projectId]: cli } })) })
  },
  async loadModels(projectId, cli) {
    const id = `${projectId}:${cli}`
    if (get().catalogs[id]) return
    return once(`models:${id}`, async () => {
      try { const catalog = await sessionApi().getModels({ projectId, cli }); set((s) => ({ catalogs: { ...s.catalogs, [id]: catalog } })) }
      catch (error) { set((s) => ({ catalogs: { ...s.catalogs, [id]: { models: [], error: String(error) } } })) }
    })
  },
  async sendComposer(key, originViewId = null) {
    const id = draftId(key), draft = get().drafts[id]
    if (!draft?.text.trim()) return null
    let result: SessionSummary | null = null
    const ok = await operation(id, async () => {
      if (key.kind === 'new_chat') {
        const provider = get().providers.find((p) => p.cli === draft.cli)
        if (!draft.cli || provider?.status !== 'available') throw new Error(provider?.reason ?? '请选择已安装并已登录的 CLI')
        result = await sessionApi().create({ projectId: key.projectId, cli: draft.cli, model: draft.model, text: draft.text, contextItems: draft.contextItems, originViewId })
        acceptSummary(result)
      } else {
        const session = get().summaries[key.sessionId]
        if (session?.stopping || session?.activity === 'running') throw new Error('当前一轮仍在运行，输入已保留')
        if (session?.activity === 'needs_input') await sessionApi().replyWithText({ sessionId: key.sessionId, text: draft.text })
        else await sessionApi().send({ sessionId: key.sessionId, text: draft.text, contextItems: draft.contextItems })
        result = get().summaries[key.sessionId] ?? null
      }
      // Do not erase text typed while the request was being accepted.
      if (get().drafts[id] === draft) get().updateDraft(key, { text: '', contextItems: [] })
    })
    return ok ? result : null
  },
  answer: (sessionId, requestId, response) => operation(`answer:${requestId}`, () => sessionApi().answer({ sessionId, requestId, response })),
  stop: (sessionId) => operation(`stop:${sessionId}`, () => sessionApi().stop({ sessionId })),
  retry: (sessionId) => operation(`retry:${sessionId}`, () => sessionApi().retry({ sessionId })),
  rename: (sessionId, title) => operation(`rename:${sessionId}`, async () => acceptSummary(await sessionApi().rename({ sessionId, title }))),
  setModel: (sessionId, model) => operation(`model:${sessionId}`, async () => {
    await sessionApi().setModel({ sessionId, model })
    const summary = get().summaries[sessionId]
    if (summary) acceptSummary({ ...summary, model })
  }),
  userOpened(projectId, sessionId) {
    set((s) => ({ opened: { ...s.opened, [sessionId]: (s.opened[sessionId] ?? 0) + 1 } }))
    void sessionApi().opened({ projectId, sessionId }).catch((error) => set((s) => ({ errors: { ...s.errors, [`open:${sessionId}`]: String(error) } })))
  },
  closeProject(projectId) {
    set((s) => ({ drafts: Object.fromEntries(Object.entries(s.drafts).filter(([id]) => !id.startsWith(`${projectId}:`))), projects: { ...s.projects, [projectId]: { loaded: false, loading: false, error: null } } }))
  }
}))

export function watchSessionEvents(): () => void {
  const api = sessionApi()
  const unsubscribe = [
    api.onSummaryChanged(({ session, project }) => { acceptSummary(session); useSessions.setState((s) => ({ projectStates: { ...s.projectStates, [project.projectId]: project } })) }),
    api.onTranscriptChanged(({ sessionId, items }) => {
      const versions = transcriptVersions.get(sessionId) ?? new Map<string, number>()
      for (const item of items) versions.set(item.id, ++revision)
      transcriptVersions.set(sessionId, versions)
      useSessions.setState((s) => ({ conversations: { ...s.conversations, [sessionId]: { ...(s.conversations[sessionId] ?? emptyConversation()), items: upsertTranscript(s.conversations[sessionId]?.items ?? [], items) } } }))
    }),
    api.onProvidersChanged((providers) => useSessions.setState({ providers, providersError: null }))
  ]
  return () => unsubscribe.forEach((off) => off())
}
