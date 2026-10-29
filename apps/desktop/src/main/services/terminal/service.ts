import { randomUUID } from 'node:crypto'
import { TERMINAL_TITLE_LIMIT } from '@shared/tools/terminal'
import type {
  TerminalAckRequest, TerminalAttachment, TerminalChanged, TerminalCloseResult,
  TerminalCreateRequest, TerminalOutput, TerminalRef, TerminalSnapshot, TerminalSummary
} from '@shared/tools/terminal'
import type { LoginEnvResult } from '../shell-env/login-env'
import { createPtySpawner, type TerminalProcess, type TerminalSpawner } from './driver'
import { createTerminalScreen, type TerminalScreen } from './screen'

export const TERMINAL_FLOW_HIGH = 256 * 1024
export const TERMINAL_FLOW_LOW = 64 * 1024
export const TERMINAL_CHUNK_SIZE = 16 * 1024
export const TERMINAL_INPUT_LIMIT = 64 * 1024
export const TERMINAL_PROJECT_LIMIT = 16
export const TERMINAL_TOTAL_LIMIT = 32
/** How often running terminals are asked for their foreground process name. */
export const TERMINAL_PROCESS_POLL_MS = 1500

interface Attachment {
  id: string
  owner: number
  baseline: number
  acknowledged: number
  sent: number
  started: boolean
  pending: { sequence: number; data: string }[]
}

interface Instance {
  summary: TerminalSummary
  process: TerminalProcess
  screen: TerminalScreen
  sequence: number
  processed: number
  screenPending: number
  paused: boolean
  held: number
  attachment?: Attachment
  drained: (() => void)[]
  subscriptions: { dispose(): void }[]
  operation: Promise<unknown>
  closeOperation?: Promise<TerminalCloseResult>
  exitRevision: number
}

export interface TerminalServiceOptions {
  projectPath(projectId: string): string | null
  canOperate?(projectId: string): boolean
  shellEnv(): Promise<LoginEnvResult>
  /** Absolute path of a Project directory for `cwd`; rejects paths outside the Project or through links. */
  resolveCwd?(projectId: string, path: string): Promise<string>
  output(event: TerminalOutput): void
  changed(event: TerminalChanged): void
  spawn?: TerminalSpawner
  screen?: (cols: number, rows: number, respond: (data: string) => void) => TerminalScreen
  newId?: () => string
  /** Test seam; 0 disables the foreground-process poll. */
  processPollMs?: number
}

export interface TerminalService {
  list(projectId: string): TerminalSummary[]
  create(request: TerminalCreateRequest): Promise<TerminalSummary>
  attach(ref: TerminalRef, owner?: number): Promise<TerminalSnapshot>
  detach(ref: TerminalAttachment, owner?: number): void
  detachOwner(owner: number): void
  ack(request: TerminalAckRequest, owner?: number): void
  input(ref: TerminalRef, data: string): void
  resize(ref: TerminalRef, cols: number, rows: number): Promise<void>
  close(ref: TerminalRef, confirmed: boolean): Promise<TerminalCloseResult>
  rename(ref: TerminalRef, title: string): TerminalSummary
  clear(ref: TerminalRef): Promise<void>
  activeTerminals(projectId?: string): TerminalSummary[]
  closeProject(projectId: string): Promise<void>
  closeAll(): Promise<void>
  dispose(): Promise<void>
}

export function terminalDimensions(cols: number, rows: number): void {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || cols > 500 || rows < 1 || rows > 200) {
    throw new Error('Terminal dimensions must be integers within 2–500 columns and 1–200 rows')
  }
}

export function createTerminalService(options: TerminalServiceOptions): TerminalService {
  const instances = new Map<string, Instance>()
  const creating = new Map<string, Set<Promise<TerminalSummary>>>()
  const closingProjects = new Set<string>()
  const spawn = options.spawn ?? createPtySpawner()
  const makeScreen = options.screen ?? createTerminalScreen
  const newId = options.newId ?? randomUUID
  let generation = 0
  let disposed = false
  let poller: ReturnType<typeof setInterval> | undefined
  const pollMs = options.processPollMs ?? TERMINAL_PROCESS_POLL_MS
  /** Foreground process names change without output events (e.g. `node` exits back to `zsh`); poll while terminals run. */
  function pollProcesses(): void {
    const touched = new Set<string>()
    for (const instance of instances.values()) {
      if (instance.summary.state !== 'running' || !instance.process.processName) continue
      // eslint-disable-next-line no-control-regex
      const name = instance.process.processName().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, TERMINAL_TITLE_LIMIT)
      if (!name || name === instance.summary.process) continue
      instance.summary.process = name
      touched.add(instance.summary.projectId)
    }
    for (const projectId of touched) changed(projectId)
    if (!instances.size && poller) { clearInterval(poller); poller = undefined }
  }
  function ensurePoller(): void {
    if (poller || !pollMs || disposed) return
    poller = setInterval(pollProcesses, pollMs)
    poller.unref?.()
  }
  const summary = (instance: Instance) => ({ ...instance.summary })
  const list = (projectId: string): TerminalSummary[] => {
    requireProject(projectId)
    return [...instances.values()].filter((instance) => instance.summary.projectId === projectId).map(summary)
  }
  const changed = (projectId: string) => options.changed({ projectId, terminals: list(projectId) })
  function requireProject(projectId: string): string {
    const path = options.projectPath(projectId)
    if (!path) throw new Error('Unknown project')
    return path
  }
  function canOperate(projectId: string): void {
    requireProject(projectId)
    if (disposed || closingProjects.has(projectId) || options.canOperate?.(projectId) === false) {
      throw new Error('Project is closing; terminal operation rejected')
    }
  }
  function requireInstance(ref: TerminalRef): Instance {
    requireProject(ref.projectId)
    const instance = instances.get(ref.terminalId)
    if (!instance || instance.summary.projectId !== ref.projectId || instance.summary.generation !== ref.generation) {
      throw new Error('Terminal identity or generation mismatch')
    }
    return instance
  }
  const refOf = (instance: Instance): TerminalRef => ({
    projectId: instance.summary.projectId, terminalId: instance.summary.terminalId, generation: instance.summary.generation
  })
  function pressure(instance: Instance): void {
    const renderPending = instance.attachment?.pending.reduce((total, chunk) => total + chunk.data.length, 0) ?? 0
    const pending = instance.screenPending + renderPending
    const shouldPause = instance.held > 0 || pending >= TERMINAL_FLOW_HIGH || (instance.paused && pending > TERMINAL_FLOW_LOW)
    if (shouldPause === instance.paused) return
    instance.paused = shouldPause
    if (shouldPause) instance.process.pause()
    else instance.process.resume()
  }
  function publish(instance: Instance, chunk: { sequence: number; data: string }): void {
    const attachment = instance.attachment
    if (!attachment || !attachment.started) return
    attachment.sent = chunk.sequence
    options.output({ ...refOf(instance), attachmentId: attachment.id, ...chunk })
  }
  function receive(instance: Instance, data: string): void {
    for (let offset = 0; offset < data.length; offset += TERMINAL_CHUNK_SIZE) {
      const chunk = { sequence: ++instance.sequence, data: data.slice(offset, offset + TERMINAL_CHUNK_SIZE) }
      instance.screenPending += chunk.data.length
      instance.screen.write(chunk.data, () => {
        instance.processed = chunk.sequence
        instance.screenPending -= chunk.data.length
        if (instance.attachment && chunk.sequence > instance.attachment.baseline) {
          instance.attachment.pending.push(chunk)
          publish(instance, chunk)
        }
        pressure(instance)
        if (instance.screenPending === 0) for (const resolve of instance.drained.splice(0)) resolve()
      })
    }
    pressure(instance)
  }
  function drain(instance: Instance): Promise<void> {
    return instance.screenPending === 0 ? Promise.resolve() : new Promise((resolve) => instance.drained.push(resolve))
  }
  function serial<T>(instance: Instance, operation: () => Promise<T>): Promise<T> {
    const result = instance.operation.then(operation, operation)
    instance.operation = result.catch(() => {})
    return result
  }
  async function closeInstance(instance: Instance, confirmed: boolean): Promise<TerminalCloseResult> {
    if (instance.summary.state !== 'exited' && !confirmed) return { status: 'needs_confirmation', terminal: summary(instance) }
    if (instance.closeOperation) return instance.closeOperation
    instance.closeOperation = (async () => {
      instance.exitRevision++
      instance.summary.state = 'closing'
      delete instance.summary.error
      instance.attachment = undefined
      pressure(instance)
      changed(instance.summary.projectId)
      try {
        await instance.process.close()
        await instance.operation
        await drain(instance)
        for (const subscription of instance.subscriptions) subscription.dispose()
        instance.screen.dispose()
        instances.delete(instance.summary.terminalId)
        changed(instance.summary.projectId)
        return { status: 'closed' } as const
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        instance.summary.state = 'close_failed'
        instance.summary.error = message
        changed(instance.summary.projectId)
        return { status: 'failed', terminal: summary(instance), error: message } as const
      }
    })().finally(() => { instance.closeOperation = undefined })
    return instance.closeOperation
  }
  const service: TerminalService = {
    list,
    create(request) {
      canOperate(request.projectId)
      terminalDimensions(request.cols, request.rows)
      const pendingCount = [...creating.values()].reduce((total, pending) => total + pending.size, 0)
      if (instances.size + pendingCount >= TERMINAL_TOTAL_LIMIT || list(request.projectId).length + (creating.get(request.projectId)?.size ?? 0) >= TERMINAL_PROJECT_LIMIT) {
        throw new Error('Terminal limit reached; close an existing terminal before creating another')
      }
      // No automatic creation in list/attach: the caller owns the first-open action.
      const operation = (async () => {
        const environment = await options.shellEnv()
        canOperate(request.projectId)
        const root = requireProject(request.projectId)
        const cwd = request.cwd ? await (options.resolveCwd?.(request.projectId, request.cwd) ?? Promise.reject(new Error('Terminal directory unavailable'))) : root
        canOperate(request.projectId)
        let process: TerminalProcess | undefined
        let screen: TerminalScreen
        screen = makeScreen(request.cols, request.rows, (data) => process?.write(data))
        try { process = await spawn({ shell: environment.shell, cwd, env: environment.env, cols: request.cols, rows: request.rows }) }
        catch (error) { screen.dispose(); throw error }
        const terminalId = newId()
        const instance: Instance = {
          summary: {
            projectId: request.projectId, terminalId, generation: ++generation,
            title: `Terminal ${list(request.projectId).length + 1}`, shell: environment.shell, cwd,
            createdAt: new Date().toISOString(), state: 'running', cols: request.cols, rows: request.rows
          },
          process, screen, sequence: 0, processed: 0, screenPending: 0, paused: true, held: 0,
          drained: [], subscriptions: [], operation: Promise.resolve(), exitRevision: 0
        }
        instances.set(terminalId, instance)
        instance.subscriptions.push(process.onData((data) => receive(instance, data)))
        instance.subscriptions.push(process.onExit((exit) => {
          instance.summary.exitCode = exit.exitCode
          if (exit.signal !== undefined) instance.summary.signal = exit.signal
          if (instance.summary.state !== 'closing') {
            const revision = ++instance.exitRevision
            instance.summary.state = 'close_failed'
            instance.summary.error = 'Shell 已退出；正在核对所属进程是否退出'
            void process.liveOwnedProcesses().then((pids) => {
              if (!instances.has(terminalId) || instance.exitRevision !== revision) return
              if (pids.length) instance.summary.error = `Shell 已退出；所属进程仍在运行（PID: ${pids.join(', ')}）。关闭时将结束这些进程`
              else { instance.summary.state = 'exited'; delete instance.summary.error }
              changed(request.projectId)
            }).catch((error: unknown) => {
              if (!instances.has(terminalId) || instance.exitRevision !== revision) return
              instance.summary.error = `Shell 已退出；无法确认所属进程清理状态：${error instanceof Error ? error.message : String(error)}`
              changed(request.projectId)
            })
          }
          changed(request.projectId)
        }))
        try { canOperate(request.projectId) } catch (error) { await closeInstance(instance, true); throw error }
        const name = process.processName?.()
        if (name) instance.summary.process = name.slice(0, TERMINAL_TITLE_LIMIT)
        ensurePoller()
        pressure(instance)
        changed(request.projectId)
        return summary(instance)
      })()
      const pending = creating.get(request.projectId) ?? new Set()
      creating.set(request.projectId, pending)
      pending.add(operation)
      void operation.finally(() => { pending.delete(operation); if (!pending.size) creating.delete(request.projectId) }).catch(() => {})
      return operation
    },
    attach(ref, owner = 0) {
      const instance = requireInstance(ref)
      return serial(instance, async () => {
        instance.held++
        instance.attachment = undefined
        pressure(instance)
        try {
          await drain(instance)
          const attachment: Attachment = {
            id: newId(), owner, baseline: instance.processed, acknowledged: instance.processed,
            sent: instance.processed, started: false, pending: []
          }
          instance.attachment = attachment
          return { ...refOf(instance), attachmentId: attachment.id, terminal: summary(instance), sequence: instance.processed, screen: instance.screen.serialize(), emulatorState: instance.screen.emulatorState() }
        } catch (error) {
          instance.attachment = undefined
          throw error
        } finally { instance.held--; pressure(instance) }
      })
    },
    detach(ref, owner = 0) {
      const instance = requireInstance(ref)
      const attachment = instance.attachment
      // A late cleanup from an old mount must not detach the current screen.
      if (!attachment || attachment.id !== ref.attachmentId) return
      if (attachment.owner !== owner) throw new Error('Terminal attachment sender mismatch')
      instance.attachment = undefined
      pressure(instance)
    },
    detachOwner(owner) {
      for (const instance of instances.values()) {
        if (instance.attachment?.owner === owner) { instance.attachment = undefined; pressure(instance) }
      }
    },
    ack(request, owner = 0) {
      const instance = requireInstance(request)
      const attachment = instance.attachment
      if (!attachment || attachment.id !== request.attachmentId) return
      if (attachment.owner !== owner) throw new Error('Terminal attachment sender mismatch')
      if (!Number.isSafeInteger(request.sequence) || request.sequence < 0 || request.sequence > attachment.sent) {
        throw new Error('Invalid terminal output acknowledgement')
      }
      if (!attachment.started) {
        if (request.sequence !== attachment.baseline) throw new Error('First acknowledgement must match snapshot sequence')
        attachment.started = true
        for (const chunk of attachment.pending) publish(instance, chunk)
      }
      attachment.acknowledged = Math.max(attachment.acknowledged, request.sequence)
      attachment.pending = attachment.pending.filter((chunk) => chunk.sequence > attachment.acknowledged)
      pressure(instance)
    },
    input(ref, data) {
      canOperate(ref.projectId)
      const instance = requireInstance(ref)
      if (instance.summary.state !== 'running') throw new Error('Terminal is not running')
      if (!data.length || data.length > TERMINAL_INPUT_LIMIT) throw new Error('Invalid terminal input length')
      // Input is deliberately independent of the output parse/ack queue (Ctrl-C stays responsive).
      instance.process.write(data)
    },
    resize(ref, cols, rows) {
      canOperate(ref.projectId)
      terminalDimensions(cols, rows)
      const instance = requireInstance(ref)
      return serial(instance, async () => {
        if (instance.summary.state !== 'running') return
        if (instance.summary.cols === cols && instance.summary.rows === rows) return
        instance.held++
        pressure(instance)
        try {
          await drain(instance)
          instance.screen.resize(cols, rows)
          instance.process.resize(cols, rows)
          instance.summary.cols = cols
          instance.summary.rows = rows
          changed(ref.projectId)
        } finally { instance.held--; pressure(instance) }
      })
    },
    close: (ref, confirmed) => closeInstance(requireInstance(ref), confirmed),
    rename(ref, title) {
      const instance = requireInstance(ref)
      // eslint-disable-next-line no-control-regex
      const clean = title.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, TERMINAL_TITLE_LIMIT)
      if (!clean) throw new Error('Terminal title must not be empty')
      instance.summary.title = clean
      instance.summary.renamed = true
      changed(ref.projectId)
      return summary(instance)
    },
    clear(ref) {
      const instance = requireInstance(ref)
      // After the output already received is parsed, like the renderer's own clear.
      return serial(instance, async () => { await drain(instance); instance.screen.clear() })
    },
    activeTerminals: (projectId) => [...instances.values()]
      .filter((instance) => (!projectId || instance.summary.projectId === projectId) && instance.summary.state !== 'exited').map(summary),
    async closeProject(projectId) {
      requireProject(projectId)
      closingProjects.add(projectId)
      try {
        await Promise.allSettled([...(creating.get(projectId) ?? [])])
        const results = await Promise.all([...instances.values()]
          .filter((instance) => instance.summary.projectId === projectId).map((instance) => closeInstance(instance, true)))
        const failures = results.filter((result) => result.status === 'failed')
        if (failures.length) throw new Error(failures.map((result) => result.status === 'failed' ? `${result.terminal.title}: ${result.error}` : '').join('; '))
      } finally { closingProjects.delete(projectId) }
    },
    async closeAll() {
      const projectIds = new Set([...instances.values()].map((instance) => instance.summary.projectId))
      for (const id of creating.keys()) projectIds.add(id)
      const results = await Promise.allSettled([...projectIds].map((id) => service.closeProject(id)))
      const failures = results.flatMap((result) => result.status === 'rejected' ? [String(result.reason)] : [])
      if (failures.length) throw new Error(failures.join('; '))
    },
    async dispose() {
      disposed = true
      if (poller) { clearInterval(poller); poller = undefined }
      await service.closeAll()
    }
  }
  return service
}
