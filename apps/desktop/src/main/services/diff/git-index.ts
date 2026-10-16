// Git may refresh the index while answering a read-only diff query. Keep that refresh (and any hook/filter child
// inheriting the environment) in a private temporary index so the user's real repository is never rewritten.
import { copyFile, mkdtemp, readFile, realpath, rm, stat, utimes } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { Env } from '../shell-env/login-env'

export interface PreparedGitIndex {
  env: Env
  cleanup(): Promise<void>
}

/**
 * Finds the git directory Git would discover from a working directory without invoking Git itself.
 *
 * A linked worktree has a `.git` file whose `gitdir:` points at `.git/worktrees/<name>`, where its private index
 * lives. Following that pointer is what keeps staged changes in a linked worktree visible to Diff.
 */
async function gitDirFrom(cwd: string): Promise<string | null> {
  let current = resolve(cwd)
  while (true) {
    const marker = join(current, '.git')
    try {
      // realpath handles a repository whose `.git` entry is a symlink while stat handles both a directory and a
      // gitdir file. A dangling marker is treated like Git's failed discovery and lets us continue to a parent.
      const resolvedMarker = await realpath(marker)
      const info = await stat(resolvedMarker)
      if (info.isDirectory()) return resolvedMarker
      if (info.isFile()) {
        const text = await readFile(resolvedMarker, 'utf8')
        const match = /^gitdir:\s*(.+?)\s*$/mi.exec(text)
        if (!match || !match[1]) return null
        const pointer = match[1]
        return isAbsolute(pointer) ? pointer : resolve(dirname(resolvedMarker), pointer)
      }
    } catch {
      // Missing / unreadable `.git` is not a usable repository marker at this level.
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/** Creates a private index snapshot and returns an environment that points Git at it. */
export async function prepareGitIndex(cwd: string, baseEnv: Env): Promise<PreparedGitIndex> {
  const directory = await mkdtemp(join(tmpdir(), 'ai-studio-git-index-'))
  const isolated = join(directory, 'index')
  try {
    const gitDir = await gitDirFrom(cwd)
    if (gitDir) {
      try {
        // ENOENT is normal for an unborn repository with no staged files. Git then starts with an empty index and
        // may create the file in this private directory while answering the query.
        const source = join(gitDir, 'index')
        const info = await stat(source)
        await copyFile(source, isolated)
        // Git uses the index timestamp to detect same-size edits made in the same timestamp tick. A fresh copy's
        // newer mtime could incorrectly make such an entry look clean. Round down to avoid moving the racy-index
        // boundary forward when the floating-point timestamp is converted back to the filesystem's precision.
        await utimes(isolated, info.atimeMs / 1000, Math.floor(info.mtimeMs) / 1000)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Could not snapshot the Git index')
      }
    }
    return {
      env: { ...baseEnv, GIT_INDEX_FILE: isolated },
      cleanup: () => rm(directory, { recursive: true, force: true })
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}
