import { describe, expect, it } from 'vitest'
import { parseLaunchOptions } from './launch-options'

describe('parseLaunchOptions', () => {
  it('reads smoke output and user data overrides, ignoring other args', () => {
    expect(
      parseLaunchOptions([
        '/Applications/AI Developer Studio.app/Contents/MacOS/AI Developer Studio',
        '--studio-smoke-output=/tmp/a b/out.json',
        '--studio-user-data-dir=/tmp/user data',
        '--inspect'
      ])
    ).toEqual({ smokeOutput: '/tmp/a b/out.json', userDataDir: '/tmp/user data' })
    expect(parseLaunchOptions(['electron', '.'])).toEqual({})
  })

  it('requires absolute paths', () => {
    expect(() => parseLaunchOptions(['--studio-smoke-output=out.json'])).toThrow(/absolute/)
    expect(() => parseLaunchOptions(['--studio-user-data-dir=data'])).toThrow(/absolute/)
  })
})
