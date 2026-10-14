import { expect, it, vi } from 'vitest'
import { PsProcessLister, type ProcessInfo } from '@ai-studio/agent-adapter'
import { createPtySpawner } from './driver'
import { createTerminalService } from './service'

const fakeRootPid = 900_000
const fakeRoot: ProcessInfo = {
  pid: fakeRootPid, ppid: 1, pgid: fakeRootPid, state: 'S', startedAt: 'original-start', command: 'test shell'
}

function mockPty() {
  let exit: ((event: { exitCode: number; signal?: number }) => void) | undefined
  const proc = {
    pid: fakeRootPid, write: vi.fn(), resize: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn((listener: (event: { exitCode: number; signal?: number }) => void) => {
      exit = listener
      return { dispose: vi.fn() }
    })
  }
  vi.doMock('node-pty', () => ({ spawn: () => proc }))
  return { proc, exit: () => exit?.({ exitCode: 0 }) }
}

it.each(['absent', 'reused'] as const)('does not confirm cleanup after unobserved root exit when its PID is %s', async (state) => {
  const pty = mockPty()
  // No real process or OS signal is involved, including on a regression failure.
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  let processes: ProcessInfo[] = [{ ...fakeRoot, pid: fakeRootPid + 1, ppid: 1, startedAt: 'unknown-child-start' }]
  const list = vi.fn(async () => processes)
  try {
    const terminal = await createPtySpawner({ lister: { list }, gracefulMs: 0, forcedMs: 0 })({
      shell: 'test-shell', cwd: '/tmp', env: {}, cols: 80, rows: 24
    })
    expect(list).toHaveBeenCalledTimes(1)
    pty.exit()
    if (state === 'reused') processes = [...processes, { ...fakeRoot, startedAt: 'unrelated-new-start' }]
    await expect(terminal.liveOwnedProcesses()).rejects.toThrow('ownership unavailable')
    await expect(terminal.close()).rejects.toThrow('ownership unavailable')
    await expect(terminal.close()).rejects.toThrow('ownership unavailable')
    expect(kill).not.toHaveBeenCalled()
    expect(pty.proc.resume).not.toHaveBeenCalled()
  } finally {
    pty.exit()
    vi.doUnmock('node-pty')
    kill.mockRestore()
  }
})

it('can recover a missing initial root identity while the PTY is still alive', async () => {
  const pty = mockPty()
  let processes: ProcessInfo[] = []
  try {
    const terminal = await createPtySpawner({ lister: { list: async () => processes } })({
      shell: 'test-shell', cwd: '/tmp', env: {}, cols: 80, rows: 24
    })
    await expect(terminal.liveOwnedProcesses()).rejects.toThrow('ownership unavailable')
    processes = [fakeRoot]
    expect(await terminal.liveOwnedProcesses()).toEqual([fakeRootPid])
    processes = []
    pty.exit()
    expect(await terminal.liveOwnedProcesses()).toEqual([])
    await expect(terminal.close()).resolves.toBeUndefined()
  } finally {
    pty.exit()
    vi.doUnmock('node-pty')
  }
})

it.skipIf(process.platform !== 'darwin' && process.platform !== 'linux')('closes real local PTY descendants without affecting another user terminal', async () => {
  const spawn = createPtySpawner()
  const options = { shell: '/bin/sh', cwd: '/tmp', env: { PATH: '/bin:/usr/bin', LC_ALL: 'C', TERM: 'xterm-256color' }, cols: 80, rows: 24 }
  const one = await spawn(options)
  const two = await spawn(options)
  let outputOne = '', outputTwo = ''
  let exitTwo = false
  const subscriptions = [one.onData((data) => { outputOne += data }), two.onData((data) => { outputTwo += data }), two.onExit(() => { exitTwo = true })]
  const waitUntil = async (predicate: () => boolean) => {
    const until = Date.now() + 5000
    while (!predicate() && Date.now() < until) await new Promise<void>((resolve) => setTimeout(resolve, 25))
    expect(predicate(), JSON.stringify({ outputOne, outputTwo })).toBe(true)
  }
  try {
    one.resume(); two.resume()
    one.write("sleep 30 & printf '\\nchild=%s\\n' $!\r")
    await waitUntil(() => /child=(\d+)/.test(outputOne))
    const childPid = Number(outputOne.match(/child=(\d+)/)![1])
    expect((await new PsProcessLister().list()).some((info) => info.pid === childPid)).toBe(true)
    await one.close()
    expect((await new PsProcessLister().list()).some((info) => info.pid === childPid && !info.state.startsWith('Z'))).toBe(false)
    expect(exitTwo).toBe(false)
    two.write("printf '%s%s\\n' 'still-' 'alive'\r")
    await waitUntil(() => outputTwo.includes('still-alive'))
    two.resize(100, 30)
  } finally {
    await Promise.all([one.close(), two.close()])
    for (const subscription of subscriptions) subscription.dispose()
  }
}, 15_000)

it.skipIf(process.platform !== 'darwin' && process.platform !== 'linux')('keeps a real observed HUP-ignoring descendant in confirmation after natural shell exit', async () => {
  const spawner = createPtySpawner(), lister = new PsProcessLister()
  let output = '', shellExited = false
  let child: { pid: number; startedAt: string } | undefined
  const subscriptions: { dispose(): void }[] = []
  const service = createTerminalService({
    projectPath: () => '/tmp',
    shellEnv: async () => ({ shell: '/bin/sh', env: { PATH: '/bin:/usr/bin', LC_ALL: 'C' }, source: 'fallback', durationMs: 0 }),
    spawn: async (options) => {
      const process = await spawner(options)
      subscriptions.push(process.onData((data) => { output += data }), process.onExit(() => { shellExited = true }))
      return process
    },
    output() {}, changed() {}
  })
  const wait = async (condition: () => boolean | Promise<boolean>) => {
    const deadline = Date.now() + 5000
    while (!(await condition()) && Date.now() < deadline) await new Promise<void>((done) => setTimeout(done, 25))
    expect(await condition(), output).toBe(true)
  }
  try {
    const terminal = await service.create({ projectId: 'p1', cols: 80, rows: 24 })
    service.input(terminal, "sh -c 'trap \"\" HUP; sleep 30' >/dev/null 2>&1 & printf '\\nchild=%s\\n' $!\r")
    await wait(() => /child=(\d+)/.test(output))
    const pid = Number(output.match(/child=(\d+)/)![1])
    child = (await lister.list()).find((info) => info.pid === pid)
    expect(child).toBeDefined()
    // Let the independent periodic ownership probe observe the real descendant.
    await new Promise<void>((done) => setTimeout(done, 1250))
    service.input(terminal, 'exit\r')
    await wait(() => shellExited)
    await wait(() => service.list('p1')[0]?.error?.includes(String(pid)) ?? false)
    expect(service.activeTerminals('p1')).toHaveLength(1)
    expect((await service.close(terminal, false)).status).toBe('needs_confirmation')
    expect((await lister.list()).some((info) => info.pid === child!.pid && info.startedAt === child!.startedAt && !info.state.startsWith('Z'))).toBe(true)
    expect((await service.close(terminal, true)).status).toBe('closed')
  } finally {
    await service.dispose()
    if (child) expect((await lister.list()).some((info) => info.pid === child!.pid && info.startedAt === child!.startedAt && !info.state.startsWith('Z'))).toBe(false)
    subscriptions.forEach((subscription) => subscription.dispose())
  }
}, 15_000)

it.skipIf(process.platform !== 'darwin' && process.platform !== 'linux')('retains a real PTY after initial identity discovery fails so cleanup can retry', async () => {
  const nativeLister = new PsProcessLister()
  let probes = 0
  const spawn = createPtySpawner({ lister: { list: async () => {
    if (++probes === 1) throw new Error('transient process discovery failure')
    return nativeLister.list()
  } } })
  const terminal = await spawn({ shell: '/bin/sh', cwd: '/tmp', env: { PATH: '/bin:/usr/bin', LC_ALL: 'C' }, cols: 80, rows: 24 })
  try {
    expect(probes).toBe(1)
    await terminal.close()
    expect(probes).toBeGreaterThan(1)
  } finally { await terminal.close() }
}, 15_000)
