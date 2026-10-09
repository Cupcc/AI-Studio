// node-pty 1.1.0 publishes prebuilds/darwin-*/spawn-helper without the
// executable bit, which makes every spawn fail with "posix_spawnp failed".
// Runs as this package's postinstall and restores the bit.
import { chmodSync, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

if (process.platform === 'win32') process.exit(0)

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('node-pty/package.json'))
const candidates = [
  join(root, 'build', 'Release', 'spawn-helper'),
  join(root, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
]

let fixed = 0
for (const file of candidates) {
  if (!existsSync(file)) continue
  const mode = statSync(file).mode
  if ((mode & 0o111) !== 0o111) {
    chmodSync(file, mode | 0o755)
    fixed += 1
  }
}
console.log(`[ensure-node-pty-helper] ${fixed} spawn-helper file(s) made executable`)
