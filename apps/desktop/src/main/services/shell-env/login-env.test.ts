import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildEnvScript, createShellEnvService, parseEnvOutput, resolveLoginEnv, RESOLVING_ENV_FLAG } from './login-env'

let dir: string

function fakeShell(name: string, body: string): string {
  const file = join(dir, name)
  writeFileSync(file, `#!/bin/sh\n${body}\n`)
  chmodSync(file, 0o755)
  return file
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'studio shell env '))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('parseEnvOutput', () => {
  it('extracts NUL-separated pairs between markers and ignores noise', () => {
    const marker = '__M__'
    const out = `motd banner\n${marker}PATH=/a:/b\0MULTI=line1\nline2\0EQ=a=b\0SHLVL=2\0_=/usr/bin/env\0${marker}trailing`
    expect(parseEnvOutput(out, marker)).toEqual({ PATH: '/a:/b', MULTI: 'line1\nline2', EQ: 'a=b' })
  })

  it('returns null when markers are missing', () => {
    expect(parseEnvOutput('no markers', '__M__')).toBeNull()
    expect(parseEnvOutput('__M__PATH=/a', '__M__')).toBeNull()
  })

  it('builds a script that prints the marker twice', () => {
    expect(buildEnvScript('__X__')).toBe("printf '%s' '__X__'; /usr/bin/env -0; printf '%s' '__X__'")
  })
})

describe('resolveLoginEnv', () => {
  it('uses the login shell output (shell gets -i -l -c <script>)', async () => {
    // The fake shell drops "-i -l -c" and runs the script with a custom PATH.
    const shell = fakeShell('login-sh', 'echo "rc noise"; shift 3; PATH="/login/bin:/usr/bin:/bin" FROM_LOGIN=1 exec /bin/sh -c "$1"')
    const result = await resolveLoginEnv({ shell, baseEnv: { PATH: '/usr/bin:/bin', HOME: '/home/x' } })
    expect(result.source).toBe('login-shell')
    expect(result.env.PATH).toBe('/login/bin:/usr/bin:/bin')
    expect(result.env.FROM_LOGIN).toBe('1')
    expect(result.env.HOME).toBe('/home/x')
    expect(result.env[RESOLVING_ENV_FLAG]).toBeUndefined()
  })

  it('falls back to the launch environment on timeout', async () => {
    const shell = fakeShell('slow-sh', 'exec /bin/sleep 5')
    const result = await resolveLoginEnv({ shell, baseEnv: { PATH: '/usr/bin' }, timeoutMs: 200 })
    expect(result.source).toBe('fallback')
    expect(result.error).toMatch(/timed out/)
    expect(result.env).toEqual({ PATH: '/usr/bin' })
  })

  it('falls back when the shell prints no environment or cannot start', async () => {
    const silent = await resolveLoginEnv({ shell: fakeShell('silent-sh', 'exit 3'), baseEnv: { PATH: '/x' } })
    expect(silent.source).toBe('fallback')
    expect(silent.error).toMatch(/exit code 3/)
    const missing = await resolveLoginEnv({ shell: join(dir, 'missing-sh'), baseEnv: {} })
    expect(missing.source).toBe('fallback')
    const relative = await resolveLoginEnv({ shell: 'zsh', baseEnv: {} })
    expect(relative.error).toMatch(/not absolute/)
  })

  it('caches the resolution in the service until refresh', async () => {
    const shell = fakeShell('count-sh', 'shift 3; exec /bin/sh -c "$1"')
    const service = createShellEnvService({ shell, baseEnv: { PATH: '/usr/bin:/bin' } })
    const a = await service.get()
    expect(await service.get()).toBe(a)
    expect(await service.refresh()).not.toBe(a)
  })

  it.skipIf(!existsSync('/bin/zsh'))('resolves a real zsh login environment', async () => {
    const result = await resolveLoginEnv({ shell: '/bin/zsh', baseEnv: { PATH: '/usr/bin:/bin', HOME: process.env.HOME } })
    expect(result.source).toBe('login-shell')
    expect(result.env.PATH?.split(':')).toContain('/usr/bin')
  })
})
