import { randomUUID } from 'node:crypto'
import { toErrorInfo, type AdapterEvent, type AdapterErrorInfo, type AgentProvider, type AgentSession, type InputRequest, type InputResolution, type InputResponse, type ItemSnapshot, type ProviderEnvironment } from '@ai-studio/agent-adapter'
import { initialSessionTitle, projectSessionState, sessionStatus, sortSessions } from '@shared/session/presentation'
import type { ComposerDraft, ConversationPage, CreateSessionRequest, DraftKey, ModelCatalogResult, ProviderSummary, SessionCli, SessionMessage, SessionProjectState, SessionSummary, SessionSummaryChange, SessionViewing, StopProjectSessionsResult, TranscriptChange, TranscriptItem } from '@shared/session/types'
import { SESSION_CLIS } from '@shared/session/types'
import { SESSION_MESSAGE_MAX_LENGTH, TRANSCRIPT_PAGE_SIZE } from '@shared/ipc/session'
import type { ProjectService } from '../project/project-service'
import type { MainSessionPort } from '../project/session-port'
import { SessionStore } from './store'
import { VIEW_CATALOG, type ViewContext } from '@shared/project-view/types'

type RequestItem = Extract<TranscriptItem, { kind: 'input_request' }>
type ItemBody = TranscriptItem extends infer T ? T extends TranscriptItem ? Omit<T, 'id' | 'sessionId' | 'turnId' | 'sequence' | 'at'> : never : never
interface ActiveTurn {
  id: string
  at: number
  model: string | null
  adapterId?: string
  message: SessionMessage
  viewContext?: ViewContext
  pending: Map<string, RequestItem>
  items: Map<string, TranscriptItem>
  answering: boolean
  startup?: Promise<void>
  stop?: Promise<void>
  sending?: boolean
}
interface Entry {
  summary: SessionSummary
  sequence: number
  generation: number
  runtime?: AgentSession
  unsubscribe?: () => void
  retiring?: Promise<void>
  retiredRuntime?: AgentSession
  retirementPending?: boolean
  turn?: ActiveTurn
  secrets: Set<string>
  secretComposer?: boolean
  replyEvents?: { generation: number; events: AdapterEvent[] }
}

export interface SessionServiceOptions {
  store: SessionStore
  projects: ProjectService
  providers: readonly AgentProvider[]
  environment(): Promise<ProviderEnvironment>
  summaryChanged?(change: SessionSummaryChange): void
  transcriptChanged?(change: TranscriptChange): void
  providersChanged?(providers: ProviderSummary[]): void
  buildViewContext?(projectId: string, viewId: string): ViewContext
  turnEnded?(projectId: string): void
  /** Queried at event time, so stale renderer focus reports cannot mark work read. */
  isForeground?(senderId: number): boolean
  now?: () => number
  newId?: () => string
  /** Trusted cross-feature gate spans tool cleanup as well as Session Stop. */
  canOperate?(projectId: string): boolean
}

/** Owns application turns; Adapter owns native turns, requests and process cleanup. */
export class SessionService implements MainSessionPort {
  private readonly entries = new Map<string, Entry>()
  private readonly providers = new Map<SessionCli, AgentProvider>()
  private readonly viewing = new Map<number, SessionViewing>()
  private readonly closing = new Map<string, number>()
  private readonly closed = new Set<string>()
  private readonly dirty = new Map<string, TranscriptItem>()
  private readonly changed = new Map<string, TranscriptItem>()
  private readonly volatileDrafts = new Map<string, ComposerDraft>()
  private readonly catalogs = new Map<string, ModelCatalogResult>()
  private providerSummaries: ProviderSummary[] = []
  private availability?: Promise<ProviderSummary[]>
  private readonly background = new Set<Promise<unknown>>()
  private readonly discoveryAbort = new AbortController()
  private availabilityAt = 0
  private broadcastTimer?: ReturnType<typeof setTimeout>
  private checkpointTimer?: ReturnType<typeof setTimeout>
  private disposed = false
  private quitting = false
  private readonly now: () => number
  private readonly newId: () => string

  constructor(private readonly options: SessionServiceOptions) {
    this.now = options.now ?? Date.now
    this.newId = options.newId ?? randomUUID
    for (const provider of options.providers) {
      if (!SESSION_CLIS.includes(provider.id as SessionCli)) throw new Error(`Unsupported provider: ${provider.id}`)
      if (this.providers.has(provider.id as SessionCli)) throw new Error(`Duplicate provider: ${provider.id}`)
      this.providers.set(provider.id as SessionCli, provider)
    }
    for (const summary of options.store.summaries()) {
      const entry: Entry = { summary: { ...summary, stopping: false }, sequence: options.store.nextSequence(summary.id), generation: 0, secrets: new Set() }
      this.entries.set(summary.id, entry)
      if (summary.activity !== 'none') this.recoverInterrupted(entry)
    }
  }

  private recoverInterrupted(entry: Entry): void {
    const turn = this.options.store.lastTurn(entry.summary.id)
    entry.turn = {
      id: turn?.id ?? this.newId(), at: turn?.started_at ?? this.now(), model: turn?.model ?? null,
      message: turn ? JSON.parse(turn.message) : { text: '' },
      pending: new Map(), items: new Map(), answering: false
    }
    for (const item of this.options.store.unresolved(entry.summary.id)) {
      if (item.kind === 'input_request') entry.turn.pending.set(item.request.requestId, item)
    }
    this.finish(entry, 'failed', { code: 'runtime_crashed', message: '应用退出时本轮未完成', retryable: true })
  }

  private entry(id: string): Entry {
    const entry = this.entries.get(id)
    if (!entry) throw new Error('未知 Session')
    return entry
  }

  private project(id: string) {
    const project = this.options.projects.getProject(id)
    if (!project) throw new Error('未知 Project')
    return project
  }

  private provider(cli: SessionCli): AgentProvider {
    const provider = this.providers.get(cli)
    if (!provider) throw new Error('CLI 未配置')
    return provider
  }

  private ensureCanSubmit(entry: Entry): void {
    if (this.disposed || this.quitting || this.closing.has(entry.summary.projectId) || this.closed.has(entry.summary.projectId) || this.options.canOperate?.(entry.summary.projectId) === false) throw new Error('Project 正在关闭')
    if (entry.turn || entry.summary.stopping) throw new Error('当前一轮尚未结束')
  }

  private validateMessage(message: SessionMessage): void {
    if (!message.text.trim()) throw new Error('请输入消息')
    if (message.text.length > SESSION_MESSAGE_MAX_LENGTH) throw new Error('消息过长')
  }

  list(projectId: string): SessionSummary[] {
    this.project(projectId)
    this.closed.delete(projectId)
    return sortSessions([...this.entries.values()].filter(e => e.summary.projectId === projectId).map(e => ({ ...e.summary })))
  }

  getConversation(sessionId: string, before = Number.MAX_SAFE_INTEGER, limit = TRANSCRIPT_PAGE_SIZE): ConversationPage {
    const entry = this.entry(sessionId)
    this.flushDisk()
    const bounded = Math.max(1, Math.min(500, limit))
    const items = this.options.store.items(sessionId, before, bounded + 1)
    const hasMore = items.length > bounded
    if (hasMore) items.shift()
    return { session: { ...entry.summary }, items, hasMore, nextBeforeSequence: hasMore ? items[0]!.sequence : null }
  }

  async create(request: CreateSessionRequest): Promise<SessionSummary> {
    this.validateMessage(request)
    this.project(request.projectId)
    const available = (await this.getProviders()).find(p => p.cli === request.cli)
    if (available?.status !== 'available') throw new Error(available?.reason ?? 'CLI 不可用')
    const attach = !!request.originViewId && request.viewContextAttached === true && VIEW_CATALOG.some(view => view.id === request.originViewId)
    const viewContext = attach ? this.options.buildViewContext?.(request.projectId, request.originViewId!) : undefined
    const at = this.now()
    const summary: SessionSummary = {
      id: this.newId(), projectId: request.projectId, cli: request.cli, nativeSessionId: null,
      title: initialSessionTitle(request.text), titleSource: 'client', model: request.model ?? null,
      originViewId: request.originViewId ?? null, activity: 'none', stopping: false,
      viewContextAttached: !!viewContext, viewContextPaths: viewContext?.paths ?? [],
      errorUnseen: false, completionUnread: false, status: null, createdAt: at, updatedAt: at, lastUserMessageAt: at
    }
    const entry: Entry = { summary, sequence: 1, generation: 0, secrets: new Set() }
    this.ensureCanSubmit(entry)
    this.entries.set(summary.id, entry)
    try {
      this.options.store.transaction(() => {
        this.options.store.saveSummary(summary)
        this.begin(entry, request, viewContext)
        this.options.store.deleteDraft({ projectId: request.projectId, kind: 'new_chat', ...(request.originViewId ? { viewId: request.originViewId } : {}) })
      })
    } catch (error) {
      this.entries.delete(summary.id)
      throw error
    }
    return { ...summary }
  }

  send(sessionId: string, message: SessionMessage): void | Promise<void> {
    const entry = this.entry(sessionId)
    this.validateMessage(message)
    if (this.disposed || this.quitting || this.closing.has(entry.summary.projectId) || this.closed.has(entry.summary.projectId) || this.options.canOperate?.(entry.summary.projectId) === false) throw new Error('Project 正在关闭')
    if (entry.turn && entry.summary.activity === 'running' && !entry.summary.stopping) {
      const capability = this.provider(entry.summary.cli).capabilities.inputWhileRunning
      if (capability === 'none') throw new Error('当前 CLI 不支持运行中发送')
      if (entry.turn.sending) throw new Error('输入正在提交')
      entry.turn.sending = true
      const task = this.sendWhileRunning(entry, message)
      this.background.add(task)
      return task.finally(() => this.background.delete(task))
    }
    this.ensureCanSubmit(entry)
    this.options.store.transaction(() => this.begin(entry, message))
  }

  private async sendWhileRunning(entry: Entry, message: SessionMessage): Promise<void> {
    const turn = entry.turn
    if (!turn) throw new Error('CLI 运行时尚未就绪')
    try {
      await turn.startup
      const runtime = entry.runtime
      if (!runtime || entry.turn !== turn || entry.summary.stopping || runtime.state !== 'running') throw new Error('当前一轮已结束或正在停止，输入已保留')
      const result = await runtime.sendUserInput({ text: message.text })
      if (result.turnId !== turn.adapterId) throw new Error('CLI 返回了不同的回合，输入已保留')
      this.options.store.transaction(() => {
        // Native completion/Stop can arrive before the steering acknowledgement.
        this.append(entry, { kind: 'user_message', text: message.text, contextItems: message.contextItems ?? [] }, turn.id)
        entry.summary.lastUserMessageAt = this.now()
        // Renderer clears its exact submitted snapshot after this acknowledgement
        // and persists that change. Equal text can belong to a newly edited draft.
        this.publish(entry)
      })
    } finally { turn.sending = false }
  }

  private begin(entry: Entry, message: SessionMessage, viewContext?: ViewContext): void {
    const at = this.now()
    const turn: ActiveTurn = {
      id: this.newId(), at, model: entry.summary.model,
      message: { text: message.text, contextItems: message.contextItems ?? [] },
      viewContext,
      pending: new Map(), items: new Map(), answering: false
    }
    entry.turn = turn
    Object.assign(entry.summary, { activity: 'running', stopping: false, errorUnseen: false, completionUnread: false, lastUserMessageAt: at })
    this.options.store.startTurn(turn.id, entry.summary.id, at, turn.model, this.scrub(entry, turn.message))
    this.append(entry, { kind: 'user_message', text: message.text, contextItems: message.contextItems ?? [], viewContextAttached: !!viewContext, viewContextPaths: viewContext?.paths ?? [] })
    this.clearComposer(entry)
    this.publish(entry)
    // Always defer startup past acceptance; stop/close may arrive before environment/runtime exists.
    turn.startup = Promise.resolve().then(() => this.start(entry, turn))
  }

  private async start(entry: Entry, turn: ActiveTurn): Promise<void> {
    try {
      // A failed release retains its exact handle; retry cleanup before creating
      // another Runtime, rather than awaiting a permanently rejected promise.
      if (entry.retiredRuntime && !entry.retirementPending) this.retire(entry)
      await entry.retiring
      if (entry.turn !== turn) return
      if (entry.summary.stopping) return
      let runtime = entry.runtime
      if (!runtime || runtime.state === 'closed') {
        const environment = await this.options.environment()
        if (entry.turn !== turn || entry.summary.stopping) return
        const project = this.project(entry.summary.projectId)
        const provider = this.provider(entry.summary.cli)
        const common = { cwd: project.canonicalPath, environment, ...(turn.model ? { overrides: { model: turn.model } } : {}) }
        const generation = ++entry.generation
        runtime = entry.summary.nativeSessionId
          ? await provider.resumeSession({ ...common, nativeSessionId: entry.summary.nativeSessionId })
          : await provider.createSession(common)
        if (entry.turn !== turn || this.disposed || generation !== entry.generation) {
          await runtime.dispose()
          return
        }
        entry.runtime = runtime
        const bound = runtime
        entry.unsubscribe = runtime.subscribe(event => {
          if (entry.generation === generation && entry.runtime === bound) this.onEvent(entry, event)
        })
        if (runtime.nativeSessionId) this.bindNativeId(entry, runtime.nativeSessionId)
      }
      if (entry.turn !== turn || entry.summary.stopping) return
      const catalog = this.catalogs.get(`${entry.summary.projectId}:${entry.summary.cli}`)
      if (turn.model && catalog && !catalog.error && !catalog.models.some(model => model.id === turn.model)) {
        turn.model = null
        entry.summary.model = null
        this.append(entry, { kind: 'tool_activity', item: { itemId: this.newId(), kind: 'other', status: 'completed', activity: { verb: 'other', label: '已选模型不可用，本轮使用 CLI 默认模型' } } })
        this.publish(entry)
      }
      await runtime.setModel(turn.model)
      if (entry.turn !== turn || entry.summary.stopping) return
      const result = await runtime.sendUserInput({ text: turn.viewContext ? `${turn.viewContext.text}\n\n${turn.message.text}` : turn.message.text })
      // turn.started is synchronous; a whole turn can finish before this Promise resolves.
      if (entry.turn === turn && !turn.adapterId) {
        turn.adapterId = result.turnId
        this.options.store.bindTurn(turn.id, result.turnId)
      }
    } catch (error) {
      if (entry.turn === turn) this.finish(entry, 'failed', toErrorInfo(error))
    }
  }

  private bindNativeId(entry: Entry, id: string): void {
    if (entry.summary.nativeSessionId && entry.summary.nativeSessionId !== id) {
      this.finish(entry, 'failed', { code: 'resume_failed', message: 'CLI 返回不同的原生会话 ID；恢复已中止' })
      this.retire(entry)
      return
    }
    if (!entry.summary.nativeSessionId) {
      entry.summary.nativeSessionId = id
      try { this.publish(entry) } catch (error) {
        entry.summary.nativeSessionId = null
        this.finish(entry, 'failed', { code: 'resume_failed', message: '原生会话已被另一个 Session 绑定' })
        this.retire(entry)
      }
    }
  }

  private onEvent(entry: Entry, event: AdapterEvent): void {
    if (this.disposed) return
    if (entry.replyEvents?.generation === entry.generation) {
      entry.replyEvents.events.push(event)
      return
    }
    if (event.type === 'session.native_id') { this.bindNativeId(entry, event.nativeSessionId); return }
    if (event.type === 'session.title') {
      if (entry.summary.titleSource !== 'user' && event.title.trim()) {
        entry.summary.title = event.title.trim()
        entry.summary.titleSource = 'native'
        this.publish(entry)
      }
      return
    }
    if (event.type === 'session.closed') {
      if (entry.turn && !entry.summary.stopping) this.finish(entry, 'failed', event.error ?? { code: 'runtime_crashed', message: 'CLI 运行时已退出' })
      this.retire(entry)
      return
    }
    if (event.type === 'runtime.exited') {
      if (entry.summary.stopping || event.expected) return // Adapter may replace its runtime while preserving the native session.
      const turn = entry.turn
      const generation = entry.generation
      // Adapter follows runtime.exited with the normalized terminal + native diagnostic.
      // Prefer that error; retain a fallback if a Provider fails to issue its terminal.
      queueMicrotask(() => {
        if (this.disposed || entry.generation !== generation) return
        if (turn && entry.turn === turn) this.finish(entry, 'failed', {
          code: 'runtime_crashed', message: 'CLI 进程意外退出',
          native: { source: 'runtime', detail: { code: event.code, signal: event.signal, stderrTail: event.stderrTail } }
        })
        this.retire(entry)
      })
      return
    }
    if (event.type === 'session.error') {
      if (entry.turn && !entry.summary.stopping) this.finish(entry, 'failed', event.error)
      return // Stop emits both session.error and one terminal; terminal owns its Error card.
    }
    const turn = entry.turn
    if (!turn || !('turnId' in event)) return
    if (event.type === 'turn.started') {
      if (!turn.adapterId) {
        turn.adapterId = event.turnId
        this.options.store.bindTurn(turn.id, event.turnId)
      }
      return
    }
    if (turn.adapterId !== event.turnId) return
    switch (event.type) {
      case 'turn.completed':
        if (event.stop?.cleanup === 'failed') {
          this.finish(entry, 'failed', event.stop.cleanupReport?.error ?? { code: 'stop_cleanup_failed', message: '停止后的清理或恢复失败', native: { source: 'stop', detail: event.stop } })
        } else this.finish(entry, event.outcome, event.error, event.model)
        break
      case 'input.requested': {
        if (entry.summary.stopping || turn.pending.has(event.request.requestId)) break
        const item = this.append(entry, { kind: 'input_request', request: event.request, resolution: null }) as RequestItem
        turn.pending.set(event.request.requestId, item)
        if (this.secretRequest(event.request)) {
          entry.secretComposer = true
          this.options.store.deleteDraft({ projectId: entry.summary.projectId, kind: 'session', sessionId: entry.summary.id })
        }
        entry.summary.activity = 'needs_input'
        this.publish(entry)
        break
      }
      case 'input.resolved': {
        const item = turn.pending.get(event.requestId)
        if (item) {
          item.resolution = this.safeResolution(entry, item.request, event.resolution)
          if (this.secretRequest(item.request)) item.redacted = true
          this.writeItem(entry, item)
          turn.pending.delete(event.requestId)
          entry.summary.activity = turn.pending.size && !entry.summary.stopping ? 'needs_input' : 'running'
          this.publish(entry)
        }
        break
      }
      case 'item.started': case 'item.updated': case 'item.completed':
        this.snapshot(entry, turn, event.item)
        break
      case 'item.delta': {
        if (event.channel === 'reasoning') break
        let item = turn.items.get(event.itemId)
        if (!item && event.channel === 'text') {
          item = this.append(entry, { kind: 'agent_message', nativeItemId: event.itemId, text: '', complete: false })
          turn.items.set(event.itemId, item)
        }
        if (item?.kind === 'agent_message' && event.channel === 'text') item.text += event.delta
        else if (item?.kind === 'tool_activity' && event.channel === 'output' && item.item.command) item.item.command.output = (item.item.command.output ?? '') + event.delta
        else break
        // A secret can be echoed across delta boundaries. Wait for the authoritative
        // completed snapshot before storing/broadcasting text from such a runtime.
        if (!entry.secrets.size) this.writeItem(entry, item!, false)
        break
      }
    }
  }

  private snapshot(entry: Entry, turn: ActiveTurn, snapshot: ItemSnapshot): void {
    if (snapshot.kind === 'reasoning') return
    let item = turn.items.get(snapshot.itemId)
    if (snapshot.kind === 'assistant_message') {
      if (!item) item = this.append(entry, { kind: 'agent_message', nativeItemId: snapshot.itemId, text: snapshot.text ?? '', complete: snapshot.status !== 'in_progress' })
      else if (item.kind === 'agent_message') {
        item.text = snapshot.text ?? item.text
        item.complete = snapshot.status !== 'in_progress'
      }
    } else {
      if (!item) item = this.append(entry, { kind: 'tool_activity', item: snapshot })
      else if (item.kind === 'tool_activity') item.item = snapshot
    }
    turn.items.set(snapshot.itemId, item!)
    if (!entry.secrets.size || snapshot.status !== 'in_progress') this.writeItem(entry, item!)
  }

  private finish(entry: Entry, outcome: 'completed' | 'interrupted' | 'failed', error?: AdapterErrorInfo, model?: string): void {
    const turn = entry.turn
    if (!turn) return
    this.options.store.transaction(() => {
      this.cancelRequests(entry, outcome === 'interrupted' ? 'turn_stopping' : 'turn_ended')
      for (const item of turn.items.values()) {
        if (item.kind === 'agent_message') item.complete = true
        if (item.kind === 'tool_activity' && item.item.status === 'in_progress') item.item.status = outcome === 'completed' ? 'completed' : outcome === 'failed' ? 'failed' : 'interrupted'
        this.writeItem(entry, item)
      }
      this.flushDisk()
      this.options.store.endTurn(turn.id, outcome, this.now())
      entry.summary.activity = 'none'
      entry.summary.lastOutcome = outcome
      entry.summary.stopping = false
      entry.summary.errorUnseen = outcome === 'failed' && !this.isViewed(entry)
      entry.summary.completionUnread = outcome === 'completed' && !this.isViewed(entry)
      if (outcome === 'failed') {
        const info = error ?? { code: 'provider_error', message: 'CLI 执行失败' }
        this.append(entry, { kind: 'error', summary: info.message, details: JSON.stringify(info, null, 2), retryable: info.retryable !== false })
      } else this.append(entry, { kind: 'turn_end', outcome, durationMs: Math.max(0, this.now() - turn.at), ...(model ? { model } : {}) })
      entry.turn = undefined
      this.publish(entry)
    })
    if (outcome === 'failed') this.retire(entry)
    // Preview scanning cannot alter this turn's terminal outcome.
    try { this.options.turnEnded?.(entry.summary.projectId) } catch { /* local preview diagnostics only */ }
  }

  private cancelRequests(entry: Entry, reason: 'turn_stopping' | 'turn_ended'): void {
    for (const item of entry.turn?.pending.values() ?? []) {
      item.resolution = { status: 'cancelled', reason }
      this.writeItem(entry, item)
    }
    entry.turn?.pending.clear()
  }

  private retire(entry: Entry): void {
    const runtime = entry.runtime ?? entry.retiredRuntime
    if (!runtime || entry.retirementPending) return
    if (entry.runtime) {
      entry.runtime = undefined
      entry.unsubscribe?.()
      entry.unsubscribe = undefined
      entry.generation++
    }
    entry.retiredRuntime = runtime
    entry.retirementPending = true
    entry.retiring = Promise.resolve().then(() => runtime.dispose()).then(() => {
      if (entry.retiredRuntime === runtime) entry.retiredRuntime = undefined
    }).finally(() => { entry.retirementPending = false })
    // Keep rejection observable by next submit/close without creating an unhandled rejection.
    void entry.retiring.catch(() => {})
  }

  stop(sessionId: string): Promise<void> {
    const entry = this.entry(sessionId)
    const turn = entry.turn
    if (!turn) return Promise.resolve()
    if (turn.stop) return turn.stop
    entry.summary.stopping = true
    entry.summary.activity = 'running'
    this.cancelRequests(entry, 'turn_stopping')
    this.publish(entry)
    turn.stop = this.performStop(entry, turn)
    return turn.stop
  }

  private async performStop(entry: Entry, turn: ActiveTurn): Promise<void> {
    try {
      await turn.startup
      if (entry.turn !== turn) {
        if (this.options.store.lastTurn(entry.summary.id)?.outcome === 'failed') throw new Error('停止或初始化失败')
        return
      }
      const runtime = entry.runtime
      if (!turn.adapterId) {
        // No input was submitted. Still dispose a newly created runtime before acknowledging Stop.
        this.retire(entry)
        await entry.retiring
        this.finish(entry, 'interrupted')
        return
      }
      if (!runtime) throw new Error('CLI 运行时已退出，无法确认停止')
      const result = await runtime.stop()
      if (result.status === 'failed') {
        this.finish(entry, 'failed', result.error ?? { code: 'stop_cleanup_failed', message: '停止清理失败' })
        throw new Error(result.error?.message ?? '停止清理失败')
      }
      if (entry.turn === turn) this.finish(entry, result.status === 'already_completed' ? 'completed' : 'interrupted')
    } catch (error) {
      if (entry.turn === turn) this.finish(entry, 'failed', toErrorInfo(error, 'stop_cleanup_failed'))
      throw error
    }
  }

  private secretRequest(request: InputRequest): boolean {
    return request.kind === 'question' && request.questions.some(question => question.secret)
  }

  private rememberAnswer(entry: Entry, request: InputRequest, response: InputResponse): void {
    if (request.kind !== 'question' || response.kind !== 'answers') return
    for (const question of request.questions) {
      const answer = response.answers[question.id]
      if (question.secret && answer) {
        if (answer.text) entry.secrets.add(answer.text)
        for (const id of answer.optionIds ?? []) if (id) entry.secrets.add(id)
      }
    }
  }

  private scrub<T>(entry: Entry, value: T): T {
    // Redact answers even if a CLI echoes them in tool output, errors or assistant text.
    const walk = (input: unknown): unknown => {
      if (typeof input === 'string') {
        for (const secret of entry.secrets) input = (input as string).split(secret).join('[已隐藏]')
        return input
      }
      if (Array.isArray(input)) return input.map(walk)
      if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, val]) => [key, walk(val)]))
      return input
    }
    return walk(value) as T
  }

  private safeResolution(entry: Entry, request: InputRequest, resolution: InputResolution): InputResolution {
    const safe = structuredClone(resolution)
    if (request.kind === 'question' && safe.status === 'answered' && safe.response.kind === 'answers') {
      const answers = { ...safe.response.answers }
      for (const question of request.questions) if (question.secret && answers[question.id]) answers[question.id] = { text: '[已隐藏]' }
      safe.response = { kind: 'answers', answers }
    }
    return this.scrub(entry, safe)
  }

  async answer(sessionId: string, requestId: string, response: InputResponse): Promise<void> {
    const entry = this.entry(sessionId)
    const turn = entry.turn
    const item = turn?.pending.get(requestId)
    if (!turn || !item || !entry.runtime || entry.summary.stopping) throw new Error('请求已失效')
    if (turn.answering) throw new Error('正在提交答复')
    turn.answering = true
    const runtime = entry.runtime
    const generation = entry.generation
    this.rememberAnswer(entry, item.request, response)
    try {
      await runtime.respondToInput(requestId, response)
      if (!this.disposed && entry.generation === generation && entry.runtime === runtime && entry.turn === turn
        && !entry.summary.stopping && item.resolution?.status === 'answered' && this.secretRequest(item.request)) this.clearComposer(entry)
    }
    catch (error) { throw new Error(this.scrub(entry, toErrorInfo(error).message)) }
    finally { turn.answering = false }
  }

  async replyWithText(sessionId: string, text: string): Promise<void> {
    this.validateMessage({ text })
    const entry = this.entry(sessionId)
    const turn = entry.turn
    if (!turn?.pending.size || !entry.runtime || entry.summary.stopping) throw new Error('没有待答复请求')
    if (turn.answering) throw new Error('正在提交答复')
    turn.answering = true
    const secret = [...turn.pending.values()].some(item => this.secretRequest(item.request))
    if (secret) entry.secrets.add(text)
    const buffer = { generation: entry.generation, events: [] as AdapterEvent[] }
    entry.replyEvents = buffer
    try {
      await entry.runtime.replyWithText(text)
      // Input can release a terminal before its Promise settles. Preserve transcript order
      // while only committing accepted user text; rejection leaves the composer intact.
      if (entry.turn === turn && !entry.summary.stopping) {
        this.append(entry, { kind: 'user_message', text: secret ? '[已隐藏]' : text, contextItems: [], ...(secret ? { redacted: true } : {}) })
        entry.summary.lastUserMessageAt = this.now()
        this.clearComposer(entry)
        this.publish(entry)
      }
    }
    catch (error) { throw new Error(this.scrub(entry, toErrorInfo(error).message)) }
    finally {
      if (entry.replyEvents === buffer) entry.replyEvents = undefined
      for (const event of buffer.events) if (entry.generation === buffer.generation) this.onEvent(entry, event)
      turn.answering = false
    }
  }

  retry(sessionId: string): void {
    const entry = this.entry(sessionId)
    this.ensureCanSubmit(entry)
    const turn = this.options.store.lastTurn(sessionId)
    if (turn?.outcome !== 'failed') throw new Error('没有可重试的失败消息')
    this.retire(entry)
    this.send(sessionId, JSON.parse(turn.message))
  }

  rename(sessionId: string, title: string): SessionSummary {
    const entry = this.entry(sessionId)
    const normalized = Array.from(title.replace(/[\r\n]+/g, ' ').trim()).slice(0, 100).join('')
    if (normalized && normalized !== entry.summary.title) {
      entry.summary.title = normalized
      entry.summary.titleSource = 'user'
      this.publish(entry)
    }
    return { ...entry.summary }
  }

  setModel(sessionId: string, model: string | null): void {
    const entry = this.entry(sessionId)
    entry.summary.model = model
    this.publish(entry)
  }

  updateViewing(senderId: number, viewing: SessionViewing): void {
    if (viewing.sessionId && this.entry(viewing.sessionId).summary.projectId !== viewing.projectId) throw new Error('Session 不属于当前 Project')
    this.viewing.set(senderId, { ...viewing })
  }

  opened(senderId: number, projectId: string, sessionId: string): void {
    const entry = this.entry(sessionId)
    if (entry.summary.projectId !== projectId) throw new Error('Session 不属于当前 Project')
    const context = this.viewing.get(senderId)
    if (!context || context.projectId !== projectId || context.sessionId !== sessionId || !this.foreground(senderId, context)) return
    entry.summary.errorUnseen = false
    entry.summary.completionUnread = false
    this.publish(entry)
  }

  private foreground(sender: number, context: SessionViewing): boolean {
    return context.foreground && (this.options.isForeground?.(sender) ?? false)
  }

  private isViewed(entry: Entry): boolean {
    return [...this.viewing].some(([sender, context]) => context.projectId === entry.summary.projectId && context.sessionId === entry.summary.id && this.foreground(sender, context))
  }

  getProjectState(projectId: string): SessionProjectState {
    this.project(projectId)
    return projectSessionState(projectId, [...this.entries.values()].map(entry => entry.summary))
  }

  getBlockingSessionCounts(projectId: string) { return this.getProjectState(projectId).counts }

  activeSessions(projectId?: string) {
    return [...this.entries.values()]
      .filter(entry => (projectId === undefined || entry.summary.projectId === projectId) &&
        (entry.turn || entry.summary.activity !== 'none' || entry.summary.stopping))
      .map(entry => ({ kind: 'session' as const, id: entry.summary.id, projectId: entry.summary.projectId, title: entry.summary.title }))
  }

  activeTurnCountAll() {
    const entries = [...this.entries.values()].filter(entry => entry.turn)
    return { sessions: entries.length, projects: new Set(entries.map(entry => entry.summary.projectId)).size }
  }

  private lockProject(projectId: string): () => void {
    this.closing.set(projectId, (this.closing.get(projectId) ?? 0) + 1)
    return () => {
      const remaining = (this.closing.get(projectId) ?? 1) - 1
      if (remaining > 0) this.closing.set(projectId, remaining)
      else this.closing.delete(projectId)
    }
  }

  async stopProjectTurns(projectId: string): Promise<StopProjectSessionsResult> {
    this.project(projectId)
    const release = this.lockProject(projectId)
    try {
      const targets = [...this.entries.values()].filter(entry => entry.summary.projectId === projectId && entry.turn)
      const result: StopProjectSessionsResult = { stopped: [], failed: [] }
      await Promise.all(targets.map(async entry => {
        try { await this.stop(entry.summary.id); result.stopped.push(entry.summary.id) }
        catch (error) { result.failed.push({ sessionId: entry.summary.id, reason: error instanceof Error ? error.message : '停止失败' }) }
      }))
      return result
    } finally {
      // The caller can time out while Adapter cleanup continues. Keep the lock
      // until the actual operation settles, then let a retained Tab accept work.
      release()
    }
  }

  async projectClosed(projectId: string): Promise<void> {
    this.project(projectId)
    const release = this.lockProject(projectId)
    try {
      const result = await this.stopProjectTurns(projectId)
      if (result.failed.length) throw new Error(result.failed.map(item => item.reason).join('; '))
      const entries = [...this.entries.values()].filter(entry => entry.summary.projectId === projectId)
      for (const entry of entries) this.retire(entry)
      const results = await Promise.allSettled([
        ...entries.map(entry => entry.retiring),
        ...[...this.providers.values()].map(provider => provider.releaseRuntimes(this.project(projectId).canonicalPath))
      ])
      const failed = results.filter(result => result.status === 'rejected')
      if (failed.length) throw new AggregateError(failed.map(result => result.reason), 'Project Runtime 释放失败')
      for (const [sender, context] of this.viewing) if (context.projectId === projectId) this.viewing.delete(sender)
      this.closed.add(projectId)
      this.flushDisk()
    } finally {
      // This outer lock spans the interval between Stop and idle Runtime release.
      release()
    }
  }

  async stopAllTurns(): Promise<void> {
    this.quitting = true
    const results = await Promise.allSettled([...this.entries.values()].filter(entry => entry.turn).map(entry => this.stop(entry.summary.id)))
    const failed = results.filter(result => result.status === 'rejected')
    if (failed.length) {
      this.quitting = false
      throw new Error(`${failed.length} 个 Session 停止失败`)
    }
  }

  cancelQuit(): void { if (!this.disposed) this.quitting = false }
  projectCloseCancelled(projectId: string): void { this.closed.delete(projectId) }

  async releaseAllRuntimes(): Promise<void> {
    // Model probes and background sends own Runtimes that the Provider release below ends.
    // Waiting for them first would let a probe's full timeout consume the quit bound (W8-F7);
    // they are still awaited afterwards so no late work outlives the release.
    const background = Promise.allSettled([...this.background])
    for (const entry of this.entries.values()) this.retire(entry)
    // Unlike final dispose, quit preparation must surface failures to the UI
    // and retain exact handles for a cancelled quit or cleanup retry.
    const results = await Promise.allSettled([
      ...[...this.entries.values()].map(entry => entry.retiring),
      ...[...this.providers.values()].map(provider => provider.releaseRuntimes())
    ])
    await background
    const failed = results.filter(result => result.status === 'rejected')
    if (failed.length) throw new AggregateError(failed.map(result => result.reason), `${failed.length} 个 Runtime 释放失败`)
  }

  async getProviders(force = false): Promise<ProviderSummary[]> {
    if (this.availability) return this.availability
    if (!force && this.providerSummaries.length && this.now() - this.availabilityAt < 30_000) return structuredClone(this.providerSummaries)
    this.availability = (async () => {
      const environment = await this.options.environment()
      if (this.quitting || this.disposed) return structuredClone(this.providerSummaries)
      const summaries = await Promise.all(SESSION_CLIS.map(async cli => {
        const provider = this.provider(cli)
        try {
          const report = await provider.checkAvailability({ environment, includeModels: false, signal: this.discoveryAbort.signal })
          return {
            cli, displayName: provider.displayName, status: report.status, reason: report.reason?.message ?? null,
            version: report.version.status === 'ok' ? report.version.value.version : null,
            compatibility: report.version.status === 'ok' ? report.version.value.compatibility : null,
            checkedAt: report.checkedAt, capabilities: provider.capabilities
          } satisfies ProviderSummary
        } catch (error) {
          return { cli, displayName: provider.displayName, status: 'error', reason: toErrorInfo(error).message, version: null, compatibility: null, checkedAt: this.now(), capabilities: provider.capabilities } satisfies ProviderSummary
        }
      }))
      this.providerSummaries = summaries
      this.availabilityAt = this.now()
      if (!this.disposed) this.options.providersChanged?.(structuredClone(summaries))
      return structuredClone(summaries)
    })()
    try { return await this.availability } finally { this.availability = undefined }
  }

  async getModels(cli: SessionCli, projectId: string): Promise<ModelCatalogResult> {
    const project = this.project(projectId)
    const task = (async (): Promise<ModelCatalogResult> => {
      try {
        const environment = await this.options.environment()
        if (this.quitting || this.disposed || this.closing.has(projectId) || this.closed.has(projectId) || this.options.canOperate?.(projectId) === false) return { models: [], error: 'Project 正在关闭或应用正在退出' }
        const models = await this.provider(cli).listModels({ environment, cwd: project.canonicalPath, signal: this.discoveryAbort.signal })
        const result = { models: models.filter(model => !model.hidden), error: null }
        this.catalogs.set(`${projectId}:${cli}`, result)
        return result
      } catch (error) { return { models: [], error: toErrorInfo(error).message } }
    })()
    this.background.add(task)
    try { return await task } finally { this.background.delete(task) }
  }

  async getDefaultCli(projectId: string): Promise<SessionCli | null> {
    this.project(projectId)
    const saved = this.options.projects.getDefaultCli(projectId)
    if (SESSION_CLIS.includes(saved as SessionCli)) return saved as SessionCli
    const preferenceKey = `initial_default_cli:${projectId}`
    let inherited = this.options.store.getPreference(preferenceKey)
    if (inherited === null) {
      inherited = this.options.store.getPreference('last_set_default_cli') ?? ''
      this.options.store.setPreference(preferenceKey, inherited)
    }
    const resolved = SESSION_CLIS.includes(inherited as SessionCli) ? inherited as SessionCli
      : (await this.getProviders()).find(provider => provider.status === 'available')?.cli ?? null
    if (this.quitting || this.disposed) return null
    const changedWhileChecking = this.options.projects.getDefaultCli(projectId)
    if (SESSION_CLIS.includes(changedWhileChecking as SessionCli)) return changedWhileChecking as SessionCli
    if (resolved) this.options.projects.setDefaultCli(projectId, resolved)
    return resolved
  }

  /** Called by the Project creation handler before it returns a new Project. */
  async initializeProject(projectId: string): Promise<void> {
    try { await this.getDefaultCli(projectId) } catch {
      // CLI discovery failure must never prevent the user opening a local Project.
    }
  }

  async setDefaultCli(projectId: string, cli: SessionCli): Promise<void> {
    this.project(projectId)
    const provider = (await this.getProviders()).find(provider => provider.cli === cli)
    if (this.quitting || this.disposed) throw new Error('应用正在退出')
    if (provider?.status !== 'available') throw new Error(provider?.reason ?? 'CLI 不可用')
    this.options.store.transaction(() => {
      this.options.projects.setDefaultCli(projectId, cli)
      this.options.store.setPreference('last_set_default_cli', cli)
    })
  }

  private validateDraftKey(key: DraftKey): Entry | null {
    this.project(key.projectId)
    if (key.kind === 'new_chat') return null
    const entry = this.entry(key.sessionId)
    if (entry.summary.projectId !== key.projectId) throw new Error('草稿不属于当前 Project')
    return entry
  }

  async getDraft(key: DraftKey): Promise<ComposerDraft> {
    const entry = this.validateDraftKey(key)
    this.closed.delete(key.projectId)
    const saved = (entry && this.volatileDrafts.get(entry.summary.id)) || this.options.store.getDraft(key)
    return saved ?? { cli: entry?.summary.cli ?? await this.getDefaultCli(key.projectId), model: entry?.summary.model ?? null, text: '', contextItems: key.kind === 'new_chat' && key.viewId ? [{ type: 'view', viewId: key.viewId }] : [] }
  }

  saveDraft(key: DraftKey, draft: ComposerDraft): void {
    const entry = this.validateDraftKey(key)
    const previous = this.options.store.getDraft(key)
    const safe = { ...draft, contextItems: [...draft.contextItems] }
    if (entry) { safe.cli = entry.summary.cli; safe.model = entry.summary.model }
    else if (previous?.cli && safe.cli !== previous.cli) safe.model = null
    if (entry && !safe.text && !safe.contextItems.length) {
      this.clearComposer(entry)
      return
    }
    if (entry && (entry.secretComposer || this.volatileDrafts.has(entry.summary.id))) {
      this.volatileDrafts.set(entry.summary.id, safe)
      this.options.store.deleteDraft(key)
    } else this.options.store.saveDraft(key, entry ? this.scrub(entry, safe) : safe)
  }

  private clearComposer(entry: Entry): void {
    entry.secretComposer = false
    this.volatileDrafts.delete(entry.summary.id)
    this.options.store.deleteDraft({ projectId: entry.summary.projectId, kind: 'session', sessionId: entry.summary.id })
  }

  private publish(entry: Entry): void {
    entry.summary.title = this.scrub(entry, entry.summary.title)
    entry.summary.status = sessionStatus(entry.summary)
    entry.summary.updatedAt = this.now()
    this.options.store.saveSummary(entry.summary)
    this.options.summaryChanged?.({ session: { ...entry.summary }, project: this.getProjectState(entry.summary.projectId) })
  }

  private append(entry: Entry, body: ItemBody, turnId = entry.turn?.id ?? null): TranscriptItem {
    const item = { ...body, id: this.newId(), sessionId: entry.summary.id, turnId, sequence: entry.sequence++, at: this.now() } as TranscriptItem
    this.writeItem(entry, item)
    return item
  }

  private writeItem(entry: Entry, item: TranscriptItem, immediate = true): void {
    if (entry.secrets.size && ((item.kind === 'agent_message' && !item.complete) || (item.kind === 'tool_activity' && item.item.status === 'in_progress'))) return
    const safe = this.scrub(entry, item)
    this.changed.set(item.id, safe)
    if (immediate) { this.options.store.saveItem(safe); this.dirty.delete(item.id) }
    else this.dirty.set(item.id, safe)
    this.broadcastTimer ??= setTimeout(() => this.flushBroadcast(), 32)
    if (!immediate) this.checkpointTimer ??= setTimeout(() => this.flushDisk(), 1000)
  }

  private flushBroadcast(): void {
    clearTimeout(this.broadcastTimer)
    this.broadcastTimer = undefined
    const grouped = new Map<string, TranscriptItem[]>()
    for (const item of this.changed.values()) {
      const group = grouped.get(item.sessionId) ?? []
      group.push(item)
      grouped.set(item.sessionId, group)
    }
    this.changed.clear()
    if (!this.disposed) for (const [sessionId, items] of grouped) this.options.transcriptChanged?.({ sessionId, items: items.sort((a, b) => a.sequence - b.sequence) })
  }

  private flushDisk(): void {
    clearTimeout(this.checkpointTimer)
    this.checkpointTimer = undefined
    for (const item of this.dirty.values()) this.options.store.saveItem(item)
    this.dirty.clear()
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.discoveryAbort.abort()
    try { await this.stopAllTurns() } finally {
      this.quitting = true
      for (const entry of this.entries.values()) this.retire(entry)
      await Promise.allSettled([...this.entries.values()].map(entry => entry.retiring))
      await Promise.allSettled([...this.background, ...(this.availability ? [this.availability] : [])])
      await Promise.allSettled([...this.providers.values()].map(provider => provider.dispose()))
      this.flushDisk()
      this.flushBroadcast()
      this.disposed = true
      this.viewing.clear()
      this.volatileDrafts.clear()
    }
  }
}
