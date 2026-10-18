import { describe, expect, it } from 'vitest'
import type { AppInfo } from '@shared/ipc/app'
import { createAppFeature } from './app'
import { IpcValidationError } from './registry'

const info: AppInfo = {
  name: 'AI Developer Studio',
  version: '0.0.0',
  isPackaged: false,
  platform: 'darwin',
  arch: 'arm64',
  versions: { electron: '44.4.5', chrome: '152', node: '24.21.0' }
}
const ctx = { senderUrl: 'app://studio/index.html', senderId: 1 }

describe('app feature handlers', () => {
  const { handlers } = createAppFeature({ appInfo: () => info })

  it('getInfo takes no input and returns app info', async () => {
    expect(() => handlers.getInfo.parse({})).toThrow(IpcValidationError)
    handlers.getInfo.parse(undefined)
    expect(await handlers.getInfo.handle(undefined, ctx)).toEqual(info)
  })

  it('reads the trusted sender window focus and accepts no renderer state', async () => {
    const feature = createAppFeature({ appInfo: () => info }, sender => sender === ctx.senderId)
    expect(() => feature.handlers.getWindowFocus.parse({ focused: true })).toThrow(IpcValidationError)
    expect(feature.handlers.getWindowFocus.handle(undefined, ctx)).toEqual({ focused: true })
    expect(feature.handlers.getWindowFocus.handle(undefined, { ...ctx, senderId: 2 })).toEqual({ focused: false })
  })

  it('ping validates its input strictly', async () => {
    expect(handlers.ping.parse({ message: 'hi' })).toEqual({ message: 'hi' })
    for (const bad of [undefined, null, 'hi', [], { message: 1 }, { message: 'x'.repeat(1001) }, { message: 'hi', extra: 1 }]) {
      expect(() => handlers.ping.parse(bad)).toThrow(IpcValidationError)
    }
    const res = await handlers.ping.handle({ message: 'hi' }, ctx)
    expect(res.message).toBe('hi')
    expect(Number.isNaN(Date.parse(res.receivedAt))).toBe(false)
  })
})
