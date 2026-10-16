import { describe, expect, it, vi } from 'vitest'
import { createGitLocator, type GitLocatorOptions } from './git-locate'

function locator(overrides: Partial<GitLocatorOptions> = {}) {
  const used = {
    xcodeSelect: vi.fn(async (): Promise<string | null> => '/Library/Developer/CommandLineTools'),
    developerGit: vi.fn(async (_directory: string) => true),
    find: vi.fn(async (): Promise<string | null> => '/usr/bin/git'),
    version: vi.fn(async (): Promise<string | null> => '2.39.2 (Apple Git-143)'),
    ...overrides
  }
  const locate = createGitLocator({ env: async () => ({ PATH: '/usr/bin' }), platform: 'darwin', ...used } as GitLocatorOptions)
  return { locate, ...used }
}

describe('createGitLocator (macOS developer tools shim)', () => {
  it('reports missing when git is not on PATH', async () => {
    const { locate, xcodeSelect } = locator({ find: vi.fn(async () => null) })
    expect(await locate()).toEqual({ status: 'missing' })
    expect(xcodeSelect).not.toHaveBeenCalled()
  })

  it('refuses /usr/bin/git when xcode-select -p fails, without ever running git (that would open the installer dialog)', async () => {
    const { locate, version } = locator({ xcodeSelect: vi.fn(async () => null) })
    expect(await locate()).toEqual({ status: 'missing' })
    expect(version).not.toHaveBeenCalled()
  })

  it('refuses /usr/bin/git when the selected developer directory has no git (a stale selection)', async () => {
    const { locate, developerGit, version } = locator({ developerGit: vi.fn(async () => false) })
    expect(await locate()).toEqual({ status: 'missing' })
    expect(developerGit).toHaveBeenCalledWith('/Library/Developer/CommandLineTools')
    expect(version).not.toHaveBeenCalled()
  })

  it('accepts /usr/bin/git when the developer tools really provide git, and reads its version', async () => {
    const { locate } = locator()
    expect(await locate()).toEqual({ status: 'ok', path: '/usr/bin/git', version: '2.39.2 (Apple Git-143)' })
  })

  it('does not consult xcode-select for a git outside /usr/bin, nor off macOS', async () => {
    const brew = locator({ find: vi.fn(async () => '/opt/homebrew/bin/git') })
    expect(await brew.locate()).toMatchObject({ status: 'ok', path: '/opt/homebrew/bin/git' })
    expect(brew.xcodeSelect).not.toHaveBeenCalled()
    const linux = locator({ platform: 'linux' })
    expect(await linux.locate()).toMatchObject({ status: 'ok', path: '/usr/bin/git' })
    expect(linux.xcodeSelect).not.toHaveBeenCalled()
  })

  it('caches a found git, never caches "missing" (the user may install it), and can be invalidated', async () => {
    const { locate, find } = locator()
    await locate(); await locate()
    expect(find).toHaveBeenCalledTimes(1)
    locate.invalidate()
    await locate()
    expect(find).toHaveBeenCalledTimes(2)
    const missing = locator({ find: vi.fn(async () => null) })
    await missing.locate(); await missing.locate()
    expect(missing.find).toHaveBeenCalledTimes(2)
  })

  it('shares one lookup between concurrent callers', async () => {
    const { locate, find } = locator()
    await Promise.all([locate(), locate(), locate()])
    expect(find).toHaveBeenCalledTimes(1)
  })
})

describe.runIf(process.platform === 'darwin')('createGitLocator on this Mac (only `xcode-select -p` and `git --version` are executed)', () => {
  it('finds a working git through the real probes', async () => {
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    const location = await createGitLocator({ env: async () => env })()
    expect(location.status).toBe('ok')
    if (location.status === 'ok') expect(location.version).toMatch(/^\d+\.\d+/)
  })
})
