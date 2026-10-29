import { describe, expect, it } from 'vitest'
import { regroup } from './terminal-store'

describe('Terminal split groups (DEC-25)', () => {
  it('gives a new terminal its own group, or puts it after the split anchor', () => {
    expect(regroup([], ['a']).groups).toEqual([['a']])
    expect(regroup([['a']], ['a', 'b']).groups).toEqual([['a'], ['b']])
    expect(regroup([['a'], ['b']], ['a', 'b', 'c'], 'a')).toEqual({ groups: [['a', 'c'], ['b']], usedAnchor: true })
    expect(regroup([['a', 'c'], ['b']], ['a', 'b', 'c', 'd'], 'a').groups).toEqual([['a', 'd', 'c'], ['b']])
  })
  it('drops closed terminals and empty groups, and ignores a missing anchor', () => {
    expect(regroup([['a', 'c'], ['b']], ['c', 'b']).groups).toEqual([['c'], ['b']])
    expect(regroup([['a'], ['b']], ['b']).groups).toEqual([['b']])
    expect(regroup([['a']], ['a', 'x'], 'gone')).toEqual({ groups: [['a'], ['x']], usedAnchor: false })
  })
})
