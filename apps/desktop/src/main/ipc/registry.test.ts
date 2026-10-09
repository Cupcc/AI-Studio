import { describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { defineContract, event, invoke } from '@shared/ipc/contract'
import { contracts } from '@shared/ipc/contracts'
import type { CoreServices } from '../services/core'
import { createFeatures } from '.'
import { runMigrations } from '../services/database/migrator'
import { migrations } from '../services/database/migrations'
import {
  defineHandlers,
  emit,
  IpcValidationError,
  registerFeatureHandlers,
  type IpcInvokeEventLike,
  type MainIpc
} from './registry'
import { expectRecord, expectString } from './validate'

type Handler = (event: IpcInvokeEventLike, ...args: unknown[]) => unknown

function fakeIpc() {
  const handlers = new Map<string, Handler>()
  const ipc: MainIpc = {
    handle: (channel, listener) => {
      if (handlers.has(channel)) throw new Error(`already registered ${channel}`)
      handlers.set(channel, listener)
    },
    removeHandler: (channel) => {
      handlers.delete(channel)
    }
  }
  const call = (channel: string, url: string, ...args: unknown[]) => {
    const h = handlers.get(channel)
    if (!h) throw new Error(`no handler ${channel}`)
    return h({ sender: { id: 7 }, senderFrame: { url } }, ...args)
  }
  return { ipc, handlers, call }
}

const demo = defineContract('demo', {
  invoke: {
    greet: invoke<{ name: string }, string>('demo:greet'),
    count: invoke<void, number>('demo:count')
  },
  events: { tick: event<{ n: number }>('demo:tick') }
})

const demoHandlers = defineHandlers(demo, {
  greet: {
    parse: (raw) => ({ name: expectString(expectRecord(raw).name, 'name', { maxLength: 10 }) }),
    handle: ({ name }, ctx) => `hello ${name} from ${ctx.senderId}`
  },
  count: { parse: () => undefined, handle: () => 3 }
})

const trusted = (url: string) => url.startsWith('app://studio/')

describe('registerFeatureHandlers', () => {
  it('registers every invoke channel and runs parse + handle', async () => {
    const { ipc, handlers, call } = fakeIpc()
    registerFeatureHandlers(ipc, [demo], [demoHandlers], { isTrustedSender: trusted })
    expect([...handlers.keys()].sort()).toEqual(['demo:count', 'demo:greet'])
    await expect(call('demo:greet', 'app://studio/index.html', { name: 'Ada' })).resolves.toBe('hello Ada from 7')
    await expect(call('demo:count', 'app://studio/index.html')).resolves.toBe(3)
  })

  it('rejects untrusted senders before parsing', async () => {
    const { ipc, call } = fakeIpc()
    const parse = vi.fn()
    const spy = defineHandlers(demo, { ...demoHandlers.handlers, count: { parse, handle: () => 1 } })
    registerFeatureHandlers(ipc, [demo], [spy], { isTrustedSender: trusted })
    await expect(call('demo:count', 'https://evil.example/')).rejects.toThrow(/untrusted sender/)
    await expect(call('demo:count', '')).rejects.toThrow(/untrusted sender/)
    expect(parse).not.toHaveBeenCalled()
  })

  it('surfaces validation errors and extra arguments', async () => {
    const { ipc, call } = fakeIpc()
    const onError = vi.fn()
    registerFeatureHandlers(ipc, [demo], [demoHandlers], { isTrustedSender: trusted, onError })
    await expect(call('demo:greet', 'app://studio/', { name: 42 })).rejects.toBeInstanceOf(IpcValidationError)
    await expect(call('demo:greet', 'app://studio/', { name: 'x'.repeat(11) })).rejects.toThrow(/too long/)
    await expect(call('demo:greet', 'app://studio/', { name: 'a' }, 'extra')).rejects.toThrow(/at most one argument/)
    expect(onError).toHaveBeenCalledWith('demo:greet', expect.any(IpcValidationError))
  })

  it('fails fast when a contract has no handlers or handlers have no contract', () => {
    const { ipc } = fakeIpc()
    expect(() => registerFeatureHandlers(ipc, [demo], [], { isTrustedSender: trusted })).toThrow(/No handlers registered/)
    expect(() => registerFeatureHandlers(ipc, [], [demoHandlers], { isTrustedSender: trusted })).toThrow(/without a registered contract/)
  })

  it('fails fast when a handler is missing', () => {
    const { ipc } = fakeIpc()
    const partial = { contract: demo, handlers: { greet: demoHandlers.handlers.greet } } as never
    expect(() => registerFeatureHandlers(ipc, [demo], [partial], { isTrustedSender: trusted })).toThrow(/Missing handler demo.count/)
  })

  it('unregisters all channels', () => {
    const { ipc, handlers } = fakeIpc()
    const off = registerFeatureHandlers(ipc, [demo], [demoHandlers], { isTrustedSender: trusted })
    off()
    expect(handlers.size).toBe(0)
  })
})

describe('real registry', () => {
  it('has a handler module for every registered contract without invoking real CLIs', async () => {
    const { ipc, handlers } = fakeIpc()
    const db = new DatabaseSync(':memory:')
    runMigrations(db, migrations)
    const core = {
      appInfo: () => ({}), database: () => ({ db }),
      shellEnv: { get: async () => ({ env: {} }) }, broadcast: vi.fn()
    } as unknown as CoreServices
    const features = createFeatures(core, { providers: [], isForeground: () => false })
    try {
      registerFeatureHandlers(ipc, contracts, features, { isTrustedSender: trusted })
      const expected = contracts.flatMap((c) => Object.values(c.invoke).map((ch) => ch.channel))
      expect([...handlers.keys()].sort()).toEqual(expected.sort())
    } finally {
      for (const feature of features) await feature.dispose?.()
      db.close()
    }
  })
})

describe('emit', () => {
  it('sends typed events and skips destroyed targets', () => {
    const send = vi.fn()
    emit({ isDestroyed: () => false, send }, demo.events.tick, { n: 1 })
    expect(send).toHaveBeenCalledWith('demo:tick', { n: 1 })
    send.mockClear()
    emit({ isDestroyed: () => true, send }, demo.events.tick, { n: 2 })
    expect(send).not.toHaveBeenCalled()
  })
})
