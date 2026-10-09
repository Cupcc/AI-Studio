// Builds the renderer-facing API from feature contracts. Only declared
// channels are reachable; the raw ipcRenderer and IpcRendererEvent objects
// never cross the context bridge.
import {
  eventMethodName,
  type FeatureContract,
  type StudioApiOf,
  type Unsubscribe
} from '@shared/ipc/contract'

/** The subset of ipcRenderer the bridge needs; injectable for tests. */
export interface BridgeIpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
}

function buildFeature(contract: FeatureContract, ipc: BridgeIpc): Record<string, unknown> {
  const api: Record<string, unknown> = {}
  for (const [key, ch] of Object.entries(contract.invoke)) {
    const channel = ch.channel
    api[key] = (request?: unknown) =>
      request === undefined ? ipc.invoke(channel) : ipc.invoke(channel, request)
  }
  for (const [key, ch] of Object.entries(contract.events)) {
    const channel = ch.channel
    api[eventMethodName(key)] = (listener: (payload: unknown) => void): Unsubscribe => {
      if (typeof listener !== 'function') throw new TypeError(`${eventMethodName(key)} expects a function`)
      const wrapped = (_event: unknown, payload: unknown): void => listener(payload)
      ipc.on(channel, wrapped)
      return () => {
        ipc.removeListener(channel, wrapped)
      }
    }
  }
  return Object.freeze(api)
}

export function buildStudioApi<const T extends readonly FeatureContract[]>(
  contracts: T,
  ipc: BridgeIpc
): StudioApiOf<T> {
  const api: Record<string, unknown> = {}
  for (const contract of contracts) {
    if (contract.name in api) throw new Error(`Duplicate feature contract: ${contract.name}`)
    api[contract.name] = buildFeature(contract, ipc)
  }
  return Object.freeze(api) as StudioApiOf<T>
}
