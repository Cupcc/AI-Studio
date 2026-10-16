// Anchors directory enumeration to a child process cwd, verified against the parent's no-follow descriptor.
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { FILES_LIMITS, type FileEntry, type FileUnavailableReason, type ProjectPath } from '@shared/tools/files'
import { directoryReaderWorker } from './directory-reader-worker'

export type DirectoryReadOutcome =
  | { ok: true; entries: FileEntry[]; truncated: boolean; omittedPaths?: boolean }
  | { ok: false; reason: FileUnavailableReason }
  | 'changed'

interface ReaderOptions { path: ProjectPath; limit?: number; locale?: string; shouldStop?: () => boolean }
interface ReaderProcess {
  pid?: number
  stdout: NodeJS.ReadableStream | null
  once(event: string, listener: (...args: any[]) => void): unknown
  kill(): unknown
  postMessage?(message: unknown): void
}

const OUTPUT_LIMIT = 12 * 1024 * 1024

export async function readAnchoredDirectory(
  absolute: string, expected: { dev: bigint; ino: bigint }, options: ReaderOptions
): Promise<DirectoryReadOutcome> {
  if (options.shouldStop?.()) return { ok: false, reason: 'timeout' }
  const request = JSON.stringify({
    dev: expected.dev.toString(), ino: expected.ino.toString(), absolute, path: options.path,
    limit: Math.max(0, Math.min(FILES_LIMITS.listEntries, Math.trunc(options.limit ?? FILES_LIMITS.listEntries))),
    ...(options.locale ? { locale: options.locale } : {}),
    pathBytes: FILES_LIMITS.pathBytes, nameBytes: FILES_LIMITS.nameBytes, darwin: process.platform === 'darwin'
  })
  // No inherited Node loader/preload can change what the trusted reader executes.
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  delete env.ELECTRON_RUN_AS_NODE
  let child: ReaderProcess
  let utility = false
  try {
    if (process.versions.electron) {
      const { utilityProcess } = await import('electron')
      if (options.shouldStop?.()) return { ok: false, reason: 'timeout' }
      utility = true
      child = utilityProcess.fork(join(__dirname, 'directory-reader-worker.js'), ['--studio-directory-reader-worker', request], {
        cwd: absolute, env, stdio: 'ignore', serviceName: 'Files directory reader'
      })
    } else {
      // Tests execute the same self-contained worker in the pinned Node runtime.
      child = spawn(process.execPath, ['-e', `(${directoryReaderWorker.toString()})(process.argv[1])`, request], {
        cwd: absolute, env, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true
      })
    }
  } catch { return { ok: false, reason: 'unreadable' } }
  let stopped = false, overflow = false
  const stop = () => {
    stopped = true
    try { if (child.pid) process.kill(child.pid, 'SIGKILL'); else child.kill() } catch { /* Exit determines completion. */ }
  }
  child.once('spawn', () => { if (stopped) stop() })
  const chunks: Buffer[] = []
  let bytes = 0
  const append = (value: Buffer | string) => {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
    bytes += chunk.length
    if (bytes > OUTPUT_LIMIT) { overflow = true; stop(); return }
    if (!stopped) chunks.push(chunk)
  }
  if (utility) child.once('message', (value: string) => {
    append(value)
    if (!stopped) child.postMessage?.('received')
  })
  else child.stdout?.on('data', append)
  const timer = setTimeout(stop, 5000)
  const poll = options.shouldStop ? setInterval(() => { if (options.shouldStop?.()) stop() }, 20) : undefined
  const code = await new Promise<number>((resolve) => {
    let settled = false
    const done = (value: number) => { if (!settled) { settled = true; resolve(value) } }
    child.once(utility ? 'exit' : 'close', (value: number | null) => done(value ?? -1))
    child.once('error', () => { if (!utility) done(-1) })
  })
  clearTimeout(timer)
  clearInterval(poll)
  if (stopped || options.shouldStop?.()) return { ok: false, reason: overflow ? 'unreadable' : 'timeout' }
  if (code !== 0) return { ok: false, reason: 'unreadable' }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as DirectoryReadOutcome }
  catch { return { ok: false, reason: 'unreadable' } }
}
