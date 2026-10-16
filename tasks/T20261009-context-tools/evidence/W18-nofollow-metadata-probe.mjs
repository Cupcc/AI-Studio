// Darwin SDK flags: O_SYMLINK allows opening the final link itself; O_NOFOLLOW_ANY refuses links in the path.
// Probe whether both can safely bind per-row metadata. No file content is read through the descriptor.
import { closeSync, fstatSync, mkdirSync, mkdtempSync, openSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'w18-metadata-')))
try {
  mkdirSync(join(root, 'real')); writeFileSync(join(root, 'real', 'file'), 'fixture\n', { mode: 0o000 })
  symlinkSync('file', join(root, 'real', 'link')); symlinkSync('missing', join(root, 'real', 'dangling'))
  symlinkSync('real', join(root, 'ancestor'))
  for (const flags of [0x20000000 | 0x00200000, 0x20000000 | 0x00200000 | 0x00008000]) {
    for (const relative of ['real', 'real/file', 'real/link', 'real/dangling', 'ancestor/file', 'ancestor/link']) {
      let fd
      try {
        fd = openSync(join(root, relative), flags)
        const info = fstatSync(fd)
        console.log(JSON.stringify({ flags: flags.toString(16), relative, outcome: info.isSymbolicLink() ? 'symlink' : info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other' }))
      } catch (error) { console.log(JSON.stringify({ flags: flags.toString(16), relative, error: error.code })) }
      finally { if (fd !== undefined) closeSync(fd) }
    }
  }
} finally { rmSync(root, { recursive: true, force: true }) }
