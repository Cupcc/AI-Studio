// Independent Electron probe: no BrowserWindow, isolated userData, actual bundled utility worker.
import { app, utilityProcess } from 'electron'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readAnchoredDirectory } from '../../../apps/desktop/src/main/services/files/directory-reader'
import { createFilesService } from '../../../apps/desktop/src/main/services/files/service'

const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'w18-utility-')))
const root = join(base, 'project')
mkdirSync(root)
writeFileSync(join(root, 'mode-zero'), 'fixture\n', { mode: 0o000 })
mkdirSync(join(root, 'directory'))
symlinkSync('missing-target', join(root, 'dangling'))
app.setPath('userData', join(base, 'user-data'))
app.setActivationPolicy('prohibited')

const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
const records: unknown[] = []
let mode: 'normal' | 'cancel' | 'timeout' | 'close' = 'normal'
let stop = false
let latestPid: number | undefined
let closing: Promise<void> | undefined
let service: ReturnType<typeof createFilesService> | undefined
const originalFork = utilityProcess.fork.bind(utilityProcess)
utilityProcess.fork = ((...args: Parameters<typeof originalFork>) => {
  const child = originalFork(...args)
  child.once('spawn', () => {
    latestPid = child.pid
    if (mode === 'normal') return
    process.kill(child.pid!, 'SIGSTOP')
    if (mode === 'cancel') setTimeout(() => { stop = true }, 10)
    if (mode === 'close') setTimeout(() => {
      closing = service!.closeProject('p').then(() => {
        records.push({ case: 'closeProject immediate return', childStillAlive: alive(child.pid!) })
      })
    }, 10)
  })
  return child
}) as typeof utilityProcess.fork

app.whenReady().then(async () => {
  app.dock?.hide()
  try {
    const expected = statSync(root, { bigint: true })
    const listed = await readAnchoredDirectory(root, expected, { path: '' })
    assert(typeof listed === 'object' && listed.ok, 'real utility worker did not list')
    if (typeof listed === 'object' && listed.ok) {
      assert(listed.entries.some((entry) => entry.name === 'mode-zero' && entry.kind === 'file'), 'unreadable file row lost')
      assert(listed.entries.some((entry) => entry.name === 'dangling' && entry.kind === 'symlink' && entry.linkTarget === 'missing-target'), 'raw symlink target lost')
    }
    assert(latestPid !== undefined && !alive(latestPid), 'successful utility worker survived its result')
    records.push({ case: 'normal', result: listed, childGone: true })
    const mismatch = await readAnchoredDirectory(root, { dev: expected.dev, ino: expected.ino + 1n }, { path: '' })
    assert(mismatch === 'changed', 'wrong cwd identity did not fail closed')
    records.push({ case: 'identity mismatch', result: mismatch, childGone: !alive(latestPid!) })

    mode = 'cancel'; stop = false
    let began = Date.now()
    const cancelled = await readAnchoredDirectory(root, expected, { path: '', shouldStop: () => stop })
    assert(typeof cancelled === 'object' && !cancelled.ok && cancelled.reason === 'timeout', 'cancel did not return unavailable')
    assert(!alive(latestPid!), 'cancel left a SIGSTOP worker alive')
    records.push({ case: 'cancel stopped worker', elapsedMs: Date.now() - began, result: cancelled, childGone: true })

    mode = 'timeout'
    began = Date.now()
    const timeout = await readAnchoredDirectory(root, expected, { path: '' })
    assert(typeof timeout === 'object' && !timeout.ok && timeout.reason === 'timeout', 'fixed deadline did not return timeout')
    assert(!alive(latestPid!), 'deadline left a SIGSTOP worker alive')
    records.push({ case: '5 second deadline', elapsedMs: Date.now() - began, result: timeout, childGone: true })

    mode = 'close'
    service = createFilesService({ projectRoot: (id) => id === 'p' ? root : null, changed: () => {}, watchChanged: () => {} })
    began = Date.now()
    const closed = await service.list('p', '')
    await closing
    assert(closed.status === 'unavailable' && closed.reason === 'project_closing', 'project close delivered a late listing')
    assert(!alive(latestPid!), 'project close left a SIGSTOP worker alive after request settled')
    records.push({ case: 'project close', elapsedMs: Date.now() - began, result: closed, childGoneAfterRequest: true })
    await service.dispose()
    console.log(JSON.stringify({ code: 0, records }, null, 2))
    app.exit(0)
  } catch (error) {
    console.error(JSON.stringify({ code: 1, records, error: String(error) }, null, 2))
    if (latestPid && alive(latestPid)) process.kill(latestPid, 'SIGKILL')
    app.exit(1)
  } finally { rmSync(base, { recursive: true, force: true }) }
})
