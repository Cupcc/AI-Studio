import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extractVersion, findExecutable, probeExecutable, splitPath } from './executables'

let dir: string
let binA: string
let binB: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'studio exec '))
  binA = join(dir, 'bin a')
  binB = join(dir, 'bin b')
  mkdirSync(binA)
  mkdirSync(binB)
  writeFileSync(join(binA, 'codex'), '#!/bin/sh\necho not executable\n') // no x bit
  writeFileSync(join(binB, 'codex'), '#!/bin/sh\necho "codex-cli 0.161.0"\n')
  chmodSync(join(binB, 'codex'), 0o755)
  mkdirSync(join(binA, 'claude')) // a directory is not an executable
  writeFileSync(join(binB, 'claude'), '#!/bin/sh\necho "2.1.294 (Claude Code)"\n')
  chmodSync(join(binB, 'claude'), 0o755)
  writeFileSync(join(binB, 'broken'), '#!/bin/sh\nexit 4\n')
  chmodSync(join(binB, 'broken'), 0o755)
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('findExecutable', () => {
  it('returns the first executable file on PATH, skipping non-executables and directories', async () => {
    const path = `${binA}:${binB}`
    expect(await findExecutable('codex', path)).toBe(join(binB, 'codex'))
    expect(await findExecutable('claude', path)).toBe(join(binB, 'claude'))
    expect(await findExecutable('missing', path)).toBeNull()
    expect(await findExecutable('codex', undefined)).toBeNull()
  })

  it('ignores relative PATH entries and rejects odd names', async () => {
    expect(splitPath(`relative:${binB}::`)).toEqual([binB])
    await expect(findExecutable('../codex', binB)).rejects.toThrow(/Invalid executable name/)
  })
})

describe('probeExecutable', () => {
  it('reports path and parsed version', async () => {
    const env = { PATH: `${binB}:/usr/bin:/bin` }
    expect(await probeExecutable('codex', env)).toEqual({ name: 'codex', found: true, path: join(binB, 'codex'), version: '0.161.0' })
    expect(await probeExecutable('claude', env)).toEqual({ name: 'claude', found: true, path: join(binB, 'claude'), version: '2.1.294' })
    expect(await probeExecutable('nope', env)).toEqual({ name: 'nope', found: false })
  })

  it('reports a failing --version without raw output', async () => {
    const result = await probeExecutable('broken', { PATH: `${binB}:/usr/bin:/bin` })
    expect(result.found).toBe(true)
    expect(result.version).toBeUndefined()
    expect(result.error).toMatch(/--version failed/)
  })

  it('extracts semver-like versions', () => {
    expect(extractVersion('codex-cli 0.161.0\n')).toBe('0.161.0')
    expect(extractVersion('v1.2.3-beta.1 extra')).toBe('1.2.3-beta.1')
    expect(extractVersion('unknown')).toBeUndefined()
  })
})
