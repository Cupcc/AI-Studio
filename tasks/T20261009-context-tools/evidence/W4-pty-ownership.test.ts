import { expect, it } from 'vitest'
import { PsProcessLister } from '@ai-studio/agent-adapter'
import { createPtySpawner } from '@w4-terminal-driver'
import { createTerminalService } from '@w4-terminal-service'

it.skipIf(process.platform !== 'darwin' && process.platform !== 'linux')('W4 keeps observed surviving background resources in close confirmation after Shell exit', async () => {
  const spawner = createPtySpawner()
  const lister = new PsProcessLister()
  let output = ''
  let shellExited = false
  let childIdentity: { pid: number; startedAt: string } | undefined
  const subscriptions: { dispose(): void }[] = []
  const service = createTerminalService({
    projectPath: id => id === 'p1' ? '/tmp' : null,
    shellEnv: async () => ({ shell: '/bin/sh', env: { PATH: '/bin:/usr/bin', LC_ALL: 'C' }, source: 'fallback' }),
    spawn: async options => {
      const process = await spawner(options)
      subscriptions.push(process.onData(data => { output += data }))
      subscriptions.push(process.onExit(() => { shellExited = true }))
      return process
    },
    output() {}, changed() {}
  })
  const wait = async (condition: () => boolean | Promise<boolean>) => {
    const until = Date.now() + 5000
    while (!(await condition()) && Date.now() < until) await new Promise(done => setTimeout(done, 25))
    expect(await condition(), output).toBe(true)
  }
  try {
    const terminal = await service.create({ projectId: 'p1', cols: 80, rows: 24 })
    service.input(terminal, "sh -c 'trap \"\" HUP; sleep 60' >/dev/null 2>&1 & printf '\\nowned-child=%s\\n' $!\r")
    await wait(() => /owned-child=(\d+)/.test(output))
    const childPid = Number(output.match(/owned-child=(\d+)/)![1])
    const child = (await lister.list()).find(info => info.pid === childPid)!
    expect(child).toBeDefined()
    childIdentity = child
    // Allow the real driver's ownership tracker to observe this descendant.
    await new Promise(done => setTimeout(done, 1250))
    service.input(terminal, 'exit\r')
    await wait(() => shellExited)
    expect((await lister.list()).some(info => info.pid === child.pid && info.startedAt === child.startedAt && !info.state.startsWith('Z'))).toBe(true)
    // An alive, observed owned process must still appear in merged confirmation.
    expect(service.activeTerminals('p1')).toHaveLength(1)
  } finally {
    await service.dispose()
    if (childIdentity) expect((await lister.list()).some(info => info.pid === childIdentity!.pid && info.startedAt === childIdentity!.startedAt && !info.state.startsWith('Z'))).toBe(false)
    subscriptions.forEach(subscription => subscription.dispose())
  }
}, 15_000)
