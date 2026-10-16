// Shared fixtures for the Files service tests: real directories under the OS temp dir, never the repository.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export interface Fixture {
  /** Canonical temp directory holding `root` and `outside`. */
  base: string
  /** The Project root (canonical path, like a Project's `canonicalPath`). */
  root: string
  /** A sibling directory the Project must never expose. */
  outside: string
  /** Writes a file below the root, creating parents. */
  write(relative: string, content?: string | Buffer): string
  mkfifo(relative: string): string
  cleanup(): void
}

export function createFixture(): Fixture {
  // macOS temp dirs live behind the /var -> /private/var link; Projects store the canonical path.
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'studio-files-')))
  const root = join(base, 'project')
  const outside = join(base, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
  writeFileSync(join(outside, 'secret.txt'), 'TOP SECRET')
  return {
    base, root, outside,
    write(relative, content = 'x') {
      const path = join(root, relative)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
      return path
    },
    mkfifo(relative) {
      const path = join(root, relative)
      mkdirSync(dirname(path), { recursive: true })
      execFileSync('mkfifo', [path])
      return path
    },
    cleanup: () => rmSync(base, { recursive: true, force: true })
  }
}

/** chmod-based denial does not apply to root. */
export const runningAsRoot = (): boolean => process.getuid?.() === 0
