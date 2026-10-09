// Main-side IPC plumbing: typed handler definitions, input validation,
// sender checks and typed event emission.
import type {
  AnyEventChannel,
  FeatureContract,
  PayloadOf,
  RequestOf,
  ResponseOf
} from '@shared/ipc/contract'

export interface HandlerContext {
  /** URL of the frame that sent the request (already checked as trusted). */
  senderUrl: string
  /** webContents id of the sender, for routing replies or events. */
  senderId: number
}

export interface HandlerSpec<Req, Res> {
  /** Validates untrusted renderer input; throw IpcValidationError to reject. */
  parse: (raw: unknown) => Req
  handle: (request: Req, ctx: HandlerContext) => Res | Promise<Res>
}

export type HandlersOf<C extends FeatureContract> = {
  [K in keyof C['invoke']]: HandlerSpec<RequestOf<C['invoke'][K]>, ResponseOf<C['invoke'][K]>>
}

export interface FeatureHandlers<C extends FeatureContract = FeatureContract> {
  contract: C
  handlers: HandlersOf<C>
  /** Called on shutdown, e.g. to stop feature-owned processes. */
  dispose?: () => void | Promise<void>
}

export function defineHandlers<C extends FeatureContract>(
  contract: C,
  handlers: HandlersOf<C>,
  dispose?: () => void | Promise<void>
): FeatureHandlers<C> {
  return dispose ? { contract, handlers, dispose } : { contract, handlers }
}

export class IpcValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IpcValidationError'
  }
}

/** Minimal ipcMain surface; injectable for tests. */
export interface MainIpc {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, ...args: unknown[]) => unknown
  ): void
  removeHandler(channel: string): void
}

export interface IpcInvokeEventLike {
  sender: { id: number }
  senderFrame?: { url: string } | null
}

export interface RegisterOptions {
  isTrustedSender: (url: string) => boolean
  onError?: (channel: string, error: unknown) => void
}

/**
 * Registers handlers for every contract. Fails fast if a contract in
 * `contracts` has no handler module, a handler is missing, or a channel is
 * registered twice. Returns a function that unregisters everything.
 */
export function registerFeatureHandlers(
  ipc: MainIpc,
  contracts: readonly FeatureContract[],
  features: readonly FeatureHandlers[],
  options: RegisterOptions
): () => void {
  const byName = new Map<string, FeatureHandlers>()
  for (const feature of features) {
    if (byName.has(feature.contract.name)) {
      throw new Error(`Duplicate handlers for feature ${feature.contract.name}`)
    }
    byName.set(feature.contract.name, feature)
  }
  const registered: string[] = []
  const seen = new Set<string>()
  for (const contract of contracts) {
    const feature = byName.get(contract.name)
    if (!feature || feature.contract !== contract) {
      throw new Error(`No handlers registered for feature contract ${contract.name}`)
    }
    byName.delete(contract.name)
    const handlers = feature.handlers as Record<string, HandlerSpec<unknown, unknown> | undefined>
    for (const [key, ch] of Object.entries(contract.invoke)) {
      const spec = handlers[key]
      if (!spec) throw new Error(`Missing handler ${contract.name}.${key}`)
      if (seen.has(ch.channel)) throw new Error(`Duplicate channel ${ch.channel}`)
      seen.add(ch.channel)
      ipc.handle(ch.channel, async (event, ...args) => {
        const senderUrl = event.senderFrame?.url ?? ''
        if (!options.isTrustedSender(senderUrl)) {
          throw new Error(`Rejected IPC ${ch.channel} from untrusted sender`)
        }
        if (args.length > 1) throw new IpcValidationError(`${ch.channel} takes at most one argument`)
        try {
          const request = spec.parse(args[0])
          return await spec.handle(request, { senderUrl, senderId: event.sender.id })
        } catch (error) {
          options.onError?.(ch.channel, error)
          throw error
        }
      })
      registered.push(ch.channel)
    }
  }
  if (byName.size > 0) {
    throw new Error(`Handlers without a registered contract: ${[...byName.keys()].join(', ')}`)
  }
  return () => {
    for (const channel of registered) ipc.removeHandler(channel)
  }
}

/** Minimal webContents surface for sending events. */
export interface EventTarget {
  isDestroyed(): boolean
  send(channel: string, ...args: unknown[]): void
}

/** Sends a typed main -> renderer event; silently skips destroyed targets. */
export function emit<E extends AnyEventChannel>(
  target: EventTarget,
  channel: E,
  payload: PayloadOf<E>
): void {
  if (target.isDestroyed()) return
  target.send(channel.channel, payload)
}
