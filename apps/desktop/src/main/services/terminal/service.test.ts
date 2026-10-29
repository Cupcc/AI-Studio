import { afterEach, describe, expect, it, vi } from 'vitest'
import { Terminal } from '@xterm/headless'
import type { TerminalChanged, TerminalOutput } from '@shared/tools/terminal'
import type { TerminalProcess, TerminalSpawn } from './driver'
import { createTerminalService, TERMINAL_FLOW_HIGH, type TerminalService } from './service'
import { createTerminalScreen, TERMINAL_SCROLLBACK } from './screen'

class FakeProcess implements TerminalProcess {
  paused = true
  writes: string[] = []
  sizes: [number, number][] = []
  closeError?: Error
  exited = false
  liveChildren: number[] = []
  probeError?: Error
  foreground = 'zsh'
  dataListeners = new Set<(data: string) => void>()
  exitListeners = new Set<(exit: { exitCode: number; signal?: number }) => void>()
  write(data: string) { this.writes.push(data) }
  resize(cols: number, rows: number) { this.sizes.push([cols, rows]) }
  pause() { this.paused = true }
  resume() { this.paused = false }
  processName() { return this.foreground }
  onData(listener: (data: string) => void) { this.dataListeners.add(listener); return { dispose: () => this.dataListeners.delete(listener) } }
  onExit(listener: (exit: { exitCode: number; signal?: number }) => void) { this.exitListeners.add(listener); return { dispose: () => this.exitListeners.delete(listener) } }
  emit(data: string) { for (const listener of this.dataListeners) listener(data) }
  exit(code = 0) { this.exited = true; for (const listener of this.exitListeners) listener({ exitCode: code }) }
  async close() { if (this.closeError) throw this.closeError; if (!this.exited) this.exit() }
  async liveOwnedProcesses() { if (this.probeError) throw this.probeError; return this.liveChildren }
}

const services: TerminalService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.dispose().catch(() => {}) })

function fixture(extra: Partial<Parameters<typeof createTerminalService>[0]> = {}) {
  const processes: FakeProcess[] = []
  const spawns: TerminalSpawn[] = []
  const outputs: TerminalOutput[] = []
  const changes: TerminalChanged[] = []
  const service = createTerminalService({
    projectPath: (id) => ['p1', 'p2'].includes(id) ? `/projects/${id}` : null,
    shellEnv: async () => ({ shell: '/bin/zsh', env: { PATH: '/bin' }, source: 'login-shell', durationMs: 1 }),
    spawn: async (options) => { const process = new FakeProcess(); processes.push(process); spawns.push(options); return process },
    output: (event) => outputs.push(event), changed: (event) => changes.push(event), ...extra
  })
  services.push(service)
  return { service, processes, spawns, outputs, changes }
}

const create = (service: TerminalService, projectId = 'p1') => service.create({ projectId, cols: 80, rows: 24 })
const write = (terminal: Terminal, data: string) => new Promise<void>((resolve) => terminal.write(data, resolve))
const visible = (terminal: Terminal) => Array.from({ length: terminal.buffer.active.length }, (_, i) => terminal.buffer.active.getLine(i)?.translateToString(true) ?? '').join('\n')

describe('Project-owned user terminals', () => {
  it('creates only on request, uses Project cwd and isolates identity and generation', async () => {
    const { service, processes, spawns } = fixture()
    expect(service.list('p1')).toEqual([])
    const one = await create(service), two = await create(service, 'p2')
    expect(spawns.map((spawn) => spawn.cwd)).toEqual(['/projects/p1', '/projects/p2'])
    expect(() => service.input({ ...one, projectId: 'p2' }, 'x')).toThrow('identity')
    expect(() => service.input({ ...one, generation: one.generation + 1 }, 'x')).toThrow('generation')
    service.input(two, '\u0003')
    expect(processes[0]!.writes).toEqual([])
    expect(processes[1]!.writes).toEqual(['\u0003'])
  })

  it('hands off snapshots without missed/duplicate output; late detach cannot affect a new mount', async () => {
    const { service, processes, outputs } = fixture()
    const ref = await create(service)
    processes[0]!.emit('before')
    const snapshot = await service.attach(ref, 7)
    expect(snapshot.screen).toContain('before')
    processes[0]!.emit('after')
    await vi.waitFor(() => expect(processes[0]!.paused).toBe(false))
    expect(outputs).toEqual([])
    service.ack({ ...snapshot, sequence: snapshot.sequence }, 7)
    await vi.waitFor(() => expect(outputs.length).toBe(1))
    expect(outputs[0]!.sequence).toBe(snapshot.sequence + 1)
    expect(outputs[0]!.data).toBe('after')
    const second = await service.attach(ref, 7)
    expect(second.screen).toContain('beforeafter')
    service.detach(snapshot, 7)
    service.ack(second, 7)
    processes[0]!.emit('latest')
    await vi.waitFor(() => expect(outputs.at(-1)?.attachmentId).toBe(second.attachmentId))
    expect(outputs.at(-1)?.sequence).toBe(second.sequence + 1)
    expect(() => service.ack({ ...second, sequence: Number.MAX_SAFE_INTEGER }, 7)).toThrow('acknowledgement')
    expect(() => service.detach(second, 8)).toThrow('sender')
  })

  it('restores ANSI cursor state, alternate screen and resize after hidden output', async () => {
    const { service, processes } = fixture()
    const ref = await create(service)
    const first = await service.attach(ref)
    service.ack(first)
    service.detach(first)
    processes[0]!.emit('old\r\n\u001b[2J\u001b[H\u001b[31mRED\u001b[0m\u001b[2;4Hcursor\u001b[?1049hALT\u001b[3;7H')
    const snapshot = await service.attach(ref)
    const restored = new Terminal({ cols: 80, rows: 24, allowProposedApi: true })
    await write(restored, snapshot.screen)
    expect(restored.buffer.active.type).toBe('alternate')
    expect(visible(restored)).toContain('ALT')
    expect(restored.buffer.active.cursorX).toBe(6)
    expect(restored.buffer.active.cursorY).toBe(2)
    await write(restored, '\u001b[?1049l')
    expect(visible(restored)).toContain('RED')
    expect(visible(restored)).toContain('cursor')
    restored.dispose()
    await service.resize(ref, 100, 30)
    expect(processes[0]!.sizes).toEqual([[100, 30]])
    const resized = await service.attach(ref)
    expect(resized.terminal).toMatchObject({ cols: 100, rows: 30 })
    expect(service.list('p1')).toHaveLength(1)
    expect(processes[0]!.exited).toBe(false)
  })

  it('bounds output behind ACK while Ctrl-C is independent, and detach resumes hidden parsing', async () => {
    const { service, processes, outputs } = fixture()
    const ref = await create(service)
    const snapshot = await service.attach(ref, 4)
    service.ack(snapshot, 4)
    processes[0]!.emit('x'.repeat(TERMINAL_FLOW_HIGH))
    await vi.waitFor(() => expect(outputs.length).toBe(16))
    expect(processes[0]!.paused).toBe(true)
    service.input(ref, '\u0003')
    expect(processes[0]!.writes).toContain('\u0003')
    service.ack({ ...snapshot, sequence: outputs.at(-1)!.sequence }, 4)
    expect(processes[0]!.paused).toBe(false)
    processes[0]!.emit('x'.repeat(TERMINAL_FLOW_HIGH))
    await vi.waitFor(() => expect(outputs.length).toBe(32))
    expect(processes[0]!.paused).toBe(true)
    service.detachOwner(4)
    expect(processes[0]!.paused).toBe(false)
    processes[0]!.emit('HIDDEN')
    const reattached = await service.attach(ref)
    expect(reattached.screen).toContain('HIDDEN')
    expect(outputs.length).toBe(32)
  })

  it('keeps natural exits until close and confirms/retains/retries a failed cleanup', async () => {
    const { service, processes } = fixture()
    const one = await create(service), two = await create(service)
    expect((await service.close(one, false)).status).toBe('needs_confirmation')
    expect(processes[0]!.exited).toBe(false)
    processes[0]!.closeError = new Error('owned PID did not exit')
    expect(await service.close(one, true)).toMatchObject({ status: 'failed', error: 'owned PID did not exit' })
    expect(service.activeTerminals()[0]!.state).toBe('close_failed')
    expect(() => service.input(one, 'x')).toThrow('not running')
    expect(processes[1]!.exited).toBe(false)
    processes[1]!.exit(23)
    await vi.waitFor(() => expect(service.list('p1')[1]?.state).toBe('exited'))
    expect(service.list('p1')[1]).toMatchObject({ state: 'exited', exitCode: 23 })
    expect(service.activeTerminals()).toHaveLength(1)
    expect(await service.close(two, false)).toEqual({ status: 'closed' })
    processes[0]!.closeError = undefined
    expect(await service.close(one, true)).toEqual({ status: 'closed' })
    expect(service.list('p1')).toEqual([])
  })

  it('closeAll is reversible after quit failure, and project closure blocks concurrent creation', async () => {
    let allowed = true
    const { service, processes } = fixture({ canOperate: () => allowed })
    const ref = await create(service)
    allowed = false
    expect(() => create(service)).toThrow('closing')
    expect(() => service.input(ref, 'x')).toThrow('closing')
    expect(() => service.resize(ref, 90, 30)).toThrow('closing')
    expect(service.list('p1')).toHaveLength(1)
    processes[0]!.closeError = new Error('retry needed')
    await expect(service.closeAll()).rejects.toThrow('retry needed')
    processes[0]!.closeError = undefined
    allowed = true
    const another = await create(service)
    await service.closeAll()
    expect(service.list('p1')).toEqual([])
    expect(another.projectId).toBe('p1')
    expect((await create(service)).state).toBe('running')
  })

  it('keeps surviving owned children and failed natural-exit probes in confirmation scope without killing them', async () => {
    const { service, processes } = fixture()
    const one = await create(service), two = await create(service)
    processes[0]!.liveChildren = [456]
    processes[0]!.exit()
    processes[1]!.probeError = new Error('identity verification unavailable')
    processes[1]!.exit()
    await vi.waitFor(() => expect(service.list('p1')[0]?.error).toContain('456'))
    await vi.waitFor(() => expect(service.list('p1')[1]?.error).toContain('identity verification unavailable'))
    expect(service.activeTerminals('p1')).toHaveLength(2)
    expect((await service.close(one, false)).status).toBe('needs_confirmation')
    expect((await service.close(two, false)).status).toBe('needs_confirmation')
    expect(processes[0]!.liveChildren).toEqual([456])
    processes[0]!.liveChildren = []
    processes[1]!.probeError = undefined
    expect((await service.close(one, true)).status).toBe('closed')
    expect((await service.close(two, true)).status).toBe('closed')
  })

  it('handles creation finishing during project closure without leaking a failing process', async () => {
    let release: (() => void) | undefined
    const process = new FakeProcess()
    process.closeError = new Error('spawn cleanup retry')
    const { service } = fixture({ spawn: async () => { await new Promise<void>((resolve) => { release = resolve }); return process } })
    const created = create(service)
    await vi.waitFor(() => expect(release).toBeDefined())
    const closed = service.closeProject('p1')
    release!()
    await expect(created).rejects.toThrow('closing')
    await expect(closed).rejects.toThrow('spawn cleanup retry')
    expect(service.activeTerminals('p1')).toHaveLength(1)
    process.closeError = undefined
    await service.closeProject('p1')
    expect(service.list('p1')).toEqual([])
  })

  it('keeps scrollback bounded and answers device status while no renderer is attached', async () => {
    const { service, processes } = fixture()
    const ref = await create(service)
    processes[0]!.emit(Array.from({ length: TERMINAL_SCROLLBACK + 200 }, (_, i) => `line-${i}\r\n`).join(''))
    processes[0]!.emit('\u001b[6n')
    const snapshot = await service.attach(ref)
    expect(snapshot.screen).not.toContain('line-0\r')
    expect(snapshot.screen).toContain(`line-${TERMINAL_SCROLLBACK + 199}`)
    expect(processes[0]!.writes.some((data) => /^\u001b\[\d+;\d+R$/.test(data))).toBe(true)
    const screen = createTerminalScreen(80, 24)
    screen.dispose()
  })
})

describe('VS Code-style terminal controls (DEC-25)', () => {
  it('starts in a Project directory, renames tabs and reports the foreground process', async () => {
    vi.useFakeTimers()
    try {
      const resolveCwd = vi.fn(async (_id: string, path: string) => `/projects/p1/${path}`)
      const { service, processes, spawns, changes } = fixture({ resolveCwd, processPollMs: 100 })
      const ref = await service.create({ projectId: 'p1', cols: 80, rows: 24, cwd: 'src/app' })
      expect(resolveCwd).toHaveBeenCalledWith('p1', 'src/app')
      expect(spawns[0]!.cwd).toBe('/projects/p1/src/app')
      expect(ref.process).toBe('zsh')
      processes[0]!.foreground = 'node'
      await vi.advanceTimersByTimeAsync(150)
      expect(changes.at(-1)!.terminals[0]).toMatchObject({ process: 'node' })
      expect(service.rename(ref, '  dev server\n ')).toMatchObject({ title: 'dev server', renamed: true })
      expect(() => service.rename(ref, '   ')).toThrow('empty')
      await expect(service.create({ projectId: 'p1', cols: 80, rows: 24, cwd: 'missing' })).resolves.toBeDefined()
    } finally { vi.useRealTimers() }
  })

  it('refuses a start directory when the Project cannot resolve it', async () => {
    const { service, spawns } = fixture({ resolveCwd: async () => { throw new Error('Directory unavailable: symlink_refused') } })
    await expect(service.create({ projectId: 'p1', cols: 80, rows: 24, cwd: 'escape' })).rejects.toThrow('symlink_refused')
    expect(spawns).toEqual([])
  })

  it('clears the Project-held screen so a re-attach does not restore the old output', async () => {
    const { service, processes } = fixture({ screen: createTerminalScreen })
    const ref = await create(service)
    processes[0]!.emit('old output line\r\n$ ')
    await service.attach(ref, 1)
    await service.clear(ref)
    const snapshot = await service.attach(ref, 1)
    expect(snapshot.screen).not.toContain('old output line')
  })
})
