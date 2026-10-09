// Typed IPC contract primitives shared by main, preload and renderer.
// A feature declares one contract (channels + payload types); the preload
// bridge and the renderer-facing API type are derived from it.

declare const typeBrand: unique symbol

export interface InvokeChannel<Req, Res> {
  readonly kind: 'invoke'
  readonly channel: string
  /** Type-only marker; never present at runtime. */
  readonly [typeBrand]?: (req: Req) => Res
}

export interface EventChannel<Payload> {
  readonly kind: 'event'
  readonly channel: string
  /** Type-only marker; never present at runtime. */
  readonly [typeBrand]?: (payload: Payload) => void
}

export type AnyInvokeChannel = InvokeChannel<any, any>
export type AnyEventChannel = EventChannel<any>

export interface FeatureContract<
  Name extends string = string,
  Invokes extends Record<string, AnyInvokeChannel> = Record<string, AnyInvokeChannel>,
  Events extends Record<string, AnyEventChannel> = Record<string, AnyEventChannel>
> {
  readonly name: Name
  readonly invoke: Invokes
  readonly events: Events
}

export type RequestOf<C> = C extends InvokeChannel<infer Req, any> ? Req : never
export type ResponseOf<C> = C extends InvokeChannel<any, infer Res> ? Res : never
export type PayloadOf<C> = C extends EventChannel<infer P> ? P : never

export function invoke<Req = void, Res = void>(channel: string): InvokeChannel<Req, Res> {
  return { kind: 'invoke', channel }
}

export function event<Payload>(channel: string): EventChannel<Payload> {
  return { kind: 'event', channel }
}

const FEATURE_NAME = /^[a-z][a-zA-Z0-9]*$/
const MEMBER_NAME = /^[a-z][a-zA-Z0-9]*$/

/**
 * Declares a feature contract. Channel names must be prefixed with
 * `<feature>:` so features cannot collide; invoke method names may not
 * start with `on` because event subscriptions are exposed as `on<Event>`.
 */
export function defineContract<
  const Name extends string,
  Invokes extends Record<string, AnyInvokeChannel> = Record<never, AnyInvokeChannel>,
  Events extends Record<string, AnyEventChannel> = Record<never, AnyEventChannel>
>(
  name: Name,
  spec: { invoke?: Invokes; events?: Events }
): FeatureContract<Name, Invokes, Events> {
  if (!FEATURE_NAME.test(name)) throw new Error(`Invalid feature name: ${name}`)
  const invokes = (spec.invoke ?? {}) as Invokes
  const events = (spec.events ?? {}) as Events
  const prefix = `${name}:`
  for (const [key, ch] of [...Object.entries(invokes), ...Object.entries(events)]) {
    if (!MEMBER_NAME.test(key)) throw new Error(`Invalid member name ${name}.${key}`)
    if (!ch.channel.startsWith(prefix)) {
      throw new Error(`Channel ${ch.channel} of ${name}.${key} must start with "${prefix}"`)
    }
  }
  for (const key of Object.keys(invokes)) {
    if (/^on[A-Z]/.test(key)) throw new Error(`Invoke ${name}.${key} must not start with "on"`)
  }
  return Object.freeze({ name, invoke: Object.freeze(invokes), events: Object.freeze(events) })
}

export type Unsubscribe = () => void

type InvokeMethod<C> = [RequestOf<C>] extends [void]
  ? () => Promise<ResponseOf<C>>
  : (request: RequestOf<C>) => Promise<ResponseOf<C>>

/** Renderer-facing API of one feature: invoke methods plus `on<Event>` subscriptions. */
export type FeatureBridge<C extends FeatureContract> = {
  readonly [K in keyof C['invoke']]: InvokeMethod<C['invoke'][K]>
} & {
  readonly [K in keyof C['events'] & string as `on${Capitalize<K>}`]: (
    listener: (payload: PayloadOf<C['events'][K]>) => void
  ) => Unsubscribe
}

/** Renderer-facing API of a list of contracts, keyed by feature name. */
export type StudioApiOf<T extends readonly FeatureContract[]> = {
  readonly [C in T[number] as C['name']]: FeatureBridge<C>
}

export function eventMethodName(key: string): string {
  return `on${key.charAt(0).toUpperCase()}${key.slice(1)}`
}
