// W18 independent regression: a visible row can exceed ProjectPath bytes even when its parent is addressable.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { listDirectory } from '../../../../apps/desktop/src/main/services/files/list'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('omits an unaddressable APFS long UTF-8 child with a flag while keeping the rest of its directory available', async () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'w18-list-boundary-')))
  roots.push(root)
  const parent = `${'p'.repeat(150)}/${'q'.repeat(150)}`
  const directory = join(root, parent)
  mkdirSync(directory, { recursive: true })
  // A relative filename under cwd stays within PATH_MAX while the absolute spelling exceeds it. APFS supports
  // 255 BMP Unicode characters stay inside APFS's per-name limit while crossing the Project's path-byte limit.
  const name = '漢'.repeat(255)
  execFileSync(process.execPath, ['-e', "require('node:fs').writeFileSync(process.argv[1], 'fixture\\n')", name], { cwd: directory })
  writeFileSync(join(directory, 'keep.txt'), 'keep\n')
  const listed = await listDirectory(root, parent)
  expect(listed).toEqual({ ok: true, entries: [{ name: 'keep.txt', kind: 'file' }], truncated: false, omittedPaths: true })
})
