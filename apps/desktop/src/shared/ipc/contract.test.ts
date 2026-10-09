import { describe, expect, it } from 'vitest'
import { defineContract, event, eventMethodName, invoke } from './contract'
import { contracts } from './contracts'

describe('defineContract', () => {
  it('accepts channels prefixed with the feature name and freezes the result', () => {
    const c = defineContract('demo', {
      invoke: { doThing: invoke<{ a: number }, string>('demo:do-thing') },
      events: { changed: event<{ b: string }>('demo:changed') }
    })
    expect(c.name).toBe('demo')
    expect(Object.isFrozen(c)).toBe(true)
    expect(Object.isFrozen(c.invoke)).toBe(true)
  })

  it('rejects channels outside the feature namespace', () => {
    expect(() => defineContract('demo', { invoke: { x: invoke('other:x') } })).toThrow(/must start with "demo:"/)
    expect(() => defineContract('demo', { events: { x: event('x') } })).toThrow(/must start with "demo:"/)
  })

  it('rejects invoke names that would clash with event subscriptions', () => {
    expect(() => defineContract('demo', { invoke: { onThing: invoke('demo:on-thing') } })).toThrow(/must not start with "on"/)
  })

  it('rejects invalid feature and member names', () => {
    expect(() => defineContract('Bad-Name', {})).toThrow(/Invalid feature name/)
    expect(() => defineContract('demo', { invoke: { 'bad-key': invoke('demo:x') } })).toThrow(/Invalid member name/)
  })

  it('maps event keys to on<Event> method names', () => {
    expect(eventMethodName('windowFocusChanged')).toBe('onWindowFocusChanged')
  })
})

describe('contract registry', () => {
  it('has unique feature names and channels', () => {
    const names = contracts.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    const channels = contracts.flatMap((c) => [
      ...Object.values(c.invoke).map((ch) => ch.channel),
      ...Object.values(c.events).map((ch) => ch.channel)
    ])
    expect(new Set(channels).size).toBe(channels.length)
  })
})
