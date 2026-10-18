// Independent extension of W16 B5: a symlink row must not evade a no-follow check applied only to regular rows.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { listDirectory } from '../../../../apps/desktop/src/main/services/files/list'

it('does not return names or link targets from an external directory swapped into the requested path', { timeout: 45_000 }, async () => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'w18-list-race-')))
  const root = join(base, 'project'), outside = join(base, 'outside')
  mkdirSync(root); mkdirSync(outside); mkdirSync(join(root, 'd'))
  writeFileSync(join(root, 'd', 'inside.txt'), 'inside\n')
  symlinkSync('OUTSIDE-TARGET-MUST-NOT-APPEAR', join(outside, 'OUTSIDE-SYMLINK-NAME'))
  symlinkSync(outside, join(root, 'dl'))
  const stop = join(base, 'stop')
  const script = `const fs = require('node:fs'); const [root, stop] = process.argv.slice(1);
    while (!fs.existsSync(stop)) { try { fs.renameSync(root+'/d',root+'/held'); fs.renameSync(root+'/dl',root+'/d'); fs.renameSync(root+'/d',root+'/dl'); fs.renameSync(root+'/held',root+'/d') } catch {} }`
  const child = spawn(process.execPath, ['-e', script, root, stop], { stdio: 'ignore' })
  let attempts = 0, ok = 0, leaks = 0
  try {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const deadline = Date.now() + 40_000
    while (Date.now() < deadline && leaks === 0) {
      const result = await listDirectory(root, 'd')
      attempts++
      if (result.ok) {
        ok++
        if (JSON.stringify(result).includes('OUTSIDE-')) leaks++
      }
    }
    console.info(`[W18 symlink-row race] attempts=${attempts} ok=${ok} leaks=${leaks}`)
    expect(leaks).toBe(0)
  } finally {
    writeFileSync(stop, 'stop'); child.kill('SIGKILL')
    await new Promise<void>((resolve) => { if (child.exitCode !== null || child.signalCode !== null) resolve(); else child.once('exit', () => resolve()) })
    rmSync(base, { recursive: true, force: true })
  }
})
