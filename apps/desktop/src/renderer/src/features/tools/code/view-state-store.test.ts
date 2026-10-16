import { describe, expect, it } from 'vitest'
import { VIEW_STATE_LIMIT, ViewStateStore } from './view-state-store'

describe('ViewStateStore', () => {
  it('returns what was stored and forgets what was not', () => {
    const store = new ViewStateStore<{ top: number }>(3)
    store.set('a', { top: 10 })
    expect(store.get('a')).toEqual({ top: 10 })
    expect(store.get('missing')).toBeUndefined()
  })

  it('evicts the least recently used entry beyond its limit', () => {
    const store = new ViewStateStore<number>(3)
    for (const [key, value] of [['a', 1], ['b', 2], ['c', 3]] as const) store.set(key, value)
    store.set('d', 4)
    expect(store.size).toBe(3)
    expect(store.get('a')).toBeUndefined()
    expect([store.get('b'), store.get('c'), store.get('d')]).toEqual([2, 3, 4])
  })

  it('counts a read as use and an overwrite as the newest entry', () => {
    const store = new ViewStateStore<number>(3)
    store.set('a', 1); store.set('b', 2); store.set('c', 3)
    expect(store.get('a')).toBe(1)           // a is now the newest; b is the oldest
    store.set('d', 4)
    expect(store.get('b')).toBeUndefined()   // order now: c, a, d
    store.set('c', 33)                       // overwriting c makes it the newest: a, d, c
    store.set('e', 5)                        // so a is evicted, not c
    expect(store.get('a')).toBeUndefined()
    expect([store.get('d'), store.get('c'), store.get('e')]).toEqual([4, 33, 5])
    expect(store.size).toBe(3)
  })

  it('removes the key when asked to store nothing, and on delete / clear', () => {
    const store = new ViewStateStore<number>(3)
    store.set('a', 1); store.set('b', 2)
    store.set('a', null)
    expect(store.get('a')).toBeUndefined()
    store.set('b', undefined)
    expect(store.size).toBe(0)
    store.set('c', 3); store.delete('c'); expect(store.size).toBe(0)
    store.set('d', 4); store.clear(); expect(store.size).toBe(0)
  })

  it('stays bounded under many keys and rejects an invalid limit', () => {
    const store = new ViewStateStore<number>(VIEW_STATE_LIMIT)
    for (let i = 0; i < VIEW_STATE_LIMIT * 5; i++) store.set(`k${i}`, i)
    expect(store.size).toBe(VIEW_STATE_LIMIT)
    expect(store.get(`k${VIEW_STATE_LIMIT * 5 - 1}`)).toBe(VIEW_STATE_LIMIT * 5 - 1)
    expect(() => new ViewStateStore(0)).toThrow(RangeError)
    expect(() => new ViewStateStore(1.5)).toThrow(RangeError)
  })
})
