// Runs the real installer script against fake bundles in a temporary directory.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bundleOf, INSTALL_SCRIPT, installBlock, relaunchArgs } from './installer'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'studio-installer-')) })
afterEach(() => { chmodSync(dir, 0o700); rmSync(dir, { recursive: true, force: true }) })

function bundle(path: string, marker: string) {
  mkdirSync(join(path, 'Contents/MacOS'), { recursive: true })
  writeFileSync(join(path, 'Contents/marker'), marker)
}

function runScript(target: string, staged: string) {
  const script = join(dir, 'install.sh'), status = join(dir, 'status')
  writeFileSync(script, INSTALL_SCRIPT, { mode: 0o700 })
  // PID 999999 is not running, so the script proceeds at once; relaunch is off.
  const result = spawnSync('/bin/sh', [script, '999999', target, staged, '1.2.0', '0', status], { encoding: 'utf8' })
  return { code: result.status, status: existsSync(status) ? readFileSync(status, 'utf8').trim() : null }
}

describe('installer script', () => {
  it('replaces the bundle and removes the previous copy', () => {
    const target = join(dir, 'Apps/AI Developer Studio.app'), staged = join(dir, 'updates/staged/AI Developer Studio.app')
    bundle(target, 'old'); bundle(staged, 'new')
    expect(runScript(target, staged)).toEqual({ code: 0, status: 'ok 1.2.0' })
    expect(readFileSync(join(target, 'Contents/marker'), 'utf8')).toBe('new')
    expect(existsSync(`${target}.previous`)).toBe(false)
    expect(existsSync(`${target}.incoming`)).toBe(false)
  })

  it('keeps the current bundle when the new one cannot be copied next to it', () => {
    const target = join(dir, 'Apps/AI Developer Studio.app'), staged = join(dir, 'updates/staged/AI Developer Studio.app')
    bundle(target, 'old'); bundle(staged, 'new')
    // A file where the copy would go makes `ditto` fail before anything is moved.
    writeFileSync(`${target}.incoming`, '')
    chmodSync(join(dir, 'Apps'), 0o500)
    try {
      const result = runScript(target, staged)
      expect(result.code).toBe(1)
      expect(result.status).toMatch(/^failed /)
    } finally { chmodSync(join(dir, 'Apps'), 0o700) }
    expect(readFileSync(join(target, 'Contents/marker'), 'utf8')).toBe('old')
  })

  it('keeps the current bundle and records the failure when the new one is missing', () => {
    const target = join(dir, 'Apps/AI Developer Studio.app')
    bundle(target, 'old')
    const result = runScript(target, join(dir, 'missing.app'))
    expect(result.code).toBe(1)
    expect(result.status).toMatch(/^failed /)
    expect(readFileSync(join(target, 'Contents/marker'), 'utf8')).toBe('old')
  })
})

describe('installBlock', () => {
  const exec = (app: string) => join(app, 'Contents/MacOS/AI Developer Studio')

  it('allows a packaged bundle in a writable folder', () => {
    const app = join(dir, 'AI Developer Studio.app'); bundle(app, 'x')
    expect(bundleOf(exec(app))).toBe(app)
    expect(installBlock({ packaged: true, platform: 'darwin', execPath: exec(app) })).toBeNull()
  })

  it('names why development, translocated and read-only copies cannot update themselves', () => {
    expect(installBlock({ packaged: false, platform: 'darwin', execPath: '/x' })).toContain('开发版本')
    expect(installBlock({ packaged: true, platform: 'darwin', execPath: '/private/var/folders/x/AppTranslocation/1/d/A.app/Contents/MacOS/A' })).toContain('应用程序')
    const app = join(dir, 'ro/AI Developer Studio.app'); bundle(app, 'x')
    chmodSync(join(dir, 'ro'), 0o500)
    try { expect(installBlock({ packaged: true, platform: 'darwin', execPath: exec(app) })).toContain('权限') } finally { chmodSync(join(dir, 'ro'), 0o700) }
  })

  it('relaunches with only the isolated data directory argument', () => {
    expect(relaunchArgs(['/app', '-psn_0_1', '--studio-user-data-dir=/tmp/d', '--inspect'])).toEqual(['--studio-user-data-dir=/tmp/d'])
  })
})
