// Quick Open index (FR-TOOL-001 2026-10-26): every file of the Project that VS Code's Quick Open would offer, listed by
// ripgrep (`rg --files`), which honours .gitignore / .ignore and skips `.git`. Output is NUL-separated, bounded in
// entries, bytes and time, and every path is validated as a ProjectPath before it reaches the renderer.
import { spawn } from 'node:child_process'
import { FILES_OPERATION_LIMITS, parseProjectPath, type FileIndexResult, type ProjectPath } from '@shared/tools/files'
import { resolveEntry, sameIdentity } from './safe-path'
import { filesHelperPath } from './rename-exclusive'

/** Pin cwd in a native launcher; return results only while the canonical Project root has the same identity. */
export async function projectRipgrep(root: string, rg: string, args: readonly string[]): Promise<{ command: string; args: string[]; current(): Promise<boolean> } | null> {
  const resolved = await resolveEntry(root, '', 'directory')
  if (!resolved.ok) return null
  const identity = resolved.value.stats
  return {
    command: filesHelperPath('project-ripgrep'), args: [root, String(identity.dev), String(identity.ino), rg, ...args],
    current: async () => { const latest = await resolveEntry(root, '', 'directory'); return latest.ok && sameIdentity(identity, latest.value.stats) }
  }
}

/** Resolves the bundled ripgrep binary; outside the asar archive in a packaged app (see electron-builder asarUnpack). */
export async function ripgrepPath(): Promise<string> {
  const { rgPath } = await import('@vscode/ripgrep')
  return rgPath.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2')
}

/** Arguments shared with Search: no user config file, hidden files included, VCS folders and Finder metadata excluded. */
export const RIPGREP_COMMON_ARGS: readonly string[] = [
  '--no-config', '--hidden', '--no-require-git', '--no-messages',
  '--glob', '!.git', '--glob', '!.svn', '--glob', '!.hg', '--glob', '!.DS_Store'
]

/** Minimal environment: ripgrep needs no PATH, and RIPGREP_CONFIG_PATH must not apply. */
export function ripgrepEnv(): NodeJS.ProcessEnv {
  return { HOME: process.env.HOME ?? '', LANG: 'en_US.UTF-8' }
}

export interface IndexOptions {
  rg: string
  signal?: AbortSignal
  maxEntries?: number
  maxBytes?: number
  timeoutMs?: number
}

export async function listProjectFiles(root: string, options: IndexOptions): Promise<FileIndexResult> {
  if (options.signal?.aborted) return Promise.resolve({ status: 'unavailable', reason: 'project_closing' })
  const launch = await projectRipgrep(root, options.rg, ['--files', '--null', ...RIPGREP_COMMON_ARGS])
  if (options.signal?.aborted) return { status: 'unavailable', reason: 'project_closing' }
  if (!launch) return { status: 'unavailable', reason: 'project_unavailable' }
  const maxEntries = options.maxEntries ?? FILES_OPERATION_LIMITS.indexEntries
  const maxBytes = options.maxBytes ?? FILES_OPERATION_LIMITS.indexOutputBytes
  const result = await new Promise<FileIndexResult>((resolve) => {
    const child = spawn(launch.command, launch.args, { env: ripgrepEnv(), stdio: ['ignore', 'pipe', 'ignore'] })
    const paths: ProjectPath[] = []
    let pending: Buffer = Buffer.alloc(0), bytes = 0, truncated = false, settled = false
    const finish = (result: FileIndexResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer); options.signal?.removeEventListener('abort', abort)
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      resolve(result)
    }
    const abort = () => finish({ status: 'unavailable', reason: 'project_closing' })
    const timer = setTimeout(() => finish({ status: 'unavailable', reason: 'timeout' }), options.timeoutMs ?? FILES_OPERATION_LIMITS.indexTimeoutMs)
    options.signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) return
      bytes += chunk.length
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk
      let start = 0
      for (let index = pending.indexOf(0); index >= 0; index = pending.indexOf(0, start)) {
        const text = pending.toString('utf8', start, index)
        start = index + 1
        try { if (text && !text.includes('�')) paths.push(parseProjectPath(text)) } catch { /* not representable */ }
        if (paths.length >= maxEntries) { truncated = true; finish({ status: 'ok', paths, truncated }); return }
      }
      pending = pending.subarray(start)
      if (bytes > maxBytes) { truncated = true; finish({ status: 'ok', paths, truncated }) }
    })
    child.on('error', () => finish({ status: 'unavailable', reason: 'failed' }))
    // 0: files found; 1: none (an empty Project); 2: some paths unreadable (still a useful listing).
    child.on('close', (code) => finish(code === 0 || code === 1 || code === 2 ? { status: 'ok', paths, truncated } : { status: 'unavailable', reason: 'failed' }))
  })
  if (options.signal?.aborted) return { status: 'unavailable', reason: 'project_closing' }
  return await launch.current() ? result : { status: 'unavailable', reason: 'project_unavailable' }
}
