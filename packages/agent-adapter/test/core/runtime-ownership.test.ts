import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuntimeOwnershipRegistry } from '../../src/core/runtime-ownership.js'
import { RuntimeResources } from '../../src/core/runtime-resources.js'
import { FakeRuntime, fakeProcess } from '../../src/testing/fake-runtime.js'
import type { ProcessInfo } from '../../src/core/process-probe.js'

const fixtures: string[] = []
afterEach(async () => { await Promise.all(fixtures.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'w27-ownership-'))
  fixtures.push(directory)
  return directory
}
const ident = (p: ProcessInfo) => ({ pid: p.pid, startedAt: p.startedAt })
const target = (p: ProcessInfo) => ({ ...ident(p), pgid: p.pgid })
async function record(directory: string, host: ProcessInfo, runtime: ProcessInfo, processes: ProcessInfo[] = []) {
  await writeFile(join(directory, '1234-abcd.json'), JSON.stringify({ version: 1, instanceId: 'prior-host', host: ident(host), runtime: target(runtime), sessionId: 'fixture-session', processes: processes.map(target) }))
}
const host = fakeProcess(401, 'old-host')
const root = fakeProcess(501, 'old-runtime')
const external = fakeProcess(601, 'external-shared-mcp')
const terminal = fakeProcess(701, 'user-terminal')

describe('W27 independent ownership review; simulated OS table, no CLI/model', () => {
  it('preserves every target belonging to a live original host', async () => {
    const directory = await fixture()
    await record(directory, host, root)
    const signals: number[] = []
    const registry = new RuntimeOwnershipRegistry({ directory, lister: { list: async () => [host, root, external, terminal] }, signal: pid => { signals.push(pid) } })
    expect(await registry.recover()).toEqual([{ record: '1234-abcd.json', status: 'active_host' }])
    expect(signals).toEqual([])
    expect((await readdir(directory)).filter(name => name.endsWith('.json'))).toHaveLength(1)
  })

  it('does not adopt a recycled PID/group and cleans only a known detached identity', async () => {
    const directory = await fixture()
    const detached = fakeProcess(502, 'known-detached', { pgid: 502 })
    await record(directory, host, root, [detached])
    const reusedRoot = { ...root, startedAt: 'Fri Jan 2 00:00:00 2026' }
    const unrelatedGroupMember = fakeProcess(503, 'new-group-member', { pgid: root.pid })
    let table = [reusedRoot, unrelatedGroupMember, detached, external, terminal]
    const signals: number[] = []
    const registry = new RuntimeOwnershipRegistry({ directory, graceMs: 0, killWaitMs: 0, lister: { list: async () => [...table] }, signal: pid => { signals.push(pid); table = table.filter(p => p.pid !== pid) } })
    expect((await registry.recover())[0]?.status).toBe('cleaned')
    expect(signals).toEqual([detached.pid])
    expect(table).toEqual([reusedRoot, unrelatedGroupMember, external, terminal])
  })

  it('does not delete an ownership record while its observed detached descendant remains alive', async () => {
    const directory = await fixture()
    const runtime = new FakeRuntime()
    const runtimeInfo = fakeProcess(runtime.pid, 'runtime')
    const detached = fakeProcess(802, 'detaches-later', { ppid: runtime.pid, pgid: 802 })
    let table = [host, runtimeInfo, detached, external, terminal]
    const originalTerminate = runtime.terminate.bind(runtime)
    runtime.terminate = async options => {
      const report = await originalTerminate(options)
      table = table.filter(p => p.pid !== runtime.pid)
      return report
    }
    const registry = new RuntimeOwnershipRegistry({ directory, hostPid: host.pid, sampleMs: 60000, lister: { list: async () => [...table] }, signal: pid => { table = table.filter(p => p.pid !== pid) } })
    const wrapped = await registry.start({ command: 'fixture', args: [], cwd: tmpdir(), env: {} }, async () => runtime)
    // Registry observed this identity while it was a descendant; it has since detached/reparented.
    table = table.map(p => p.pid === detached.pid ? { ...p, ppid: 1 } : p)
    const report = await wrapped.terminate()
    const files = (await readdir(directory)).filter(name => name.endsWith('.json'))
    const stillAlive = table.some(p => p.pid === detached.pid)
    expect({ confirmed: report.confirmed, stillAlive, recordRetained: files.length > 0 }).not.toEqual({ confirmed: true, stillAlive: true, recordRetained: false })
    if (stillAlive) expect(files).toHaveLength(1)
  })

  it('retains a failed-registration Runtime for release retry instead of losing its exact handle', async () => {
    const directory = await fixture()
    const blockedDirectory = join(directory, 'not-a-directory')
    await writeFile(blockedDirectory, 'block mkdir')
    const runtime = new FakeRuntime({ terminateBehavior: 'hang' })
    const runtimeInfo = fakeProcess(runtime.pid, 'runtime')
    const registry = new RuntimeOwnershipRegistry({ directory: blockedDirectory, hostPid: host.pid, lister: { list: async () => [host, runtimeInfo] } })
    const resources = new RuntimeResources()
    const options = { command: 'fixture', args: [], cwd: tmpdir(), env: {} }
    await expect(resources.start(options, config => registry.start(config, async () => runtime))).rejects.toThrow()
    runtime.terminateBehavior = 'exit'
    await resources.release(undefined, async () => {})
    expect(runtime.running).toBe(false)
    expect(runtime.terminateCalls.length).toBeGreaterThan(1)
  })

  it('merges concurrent termination through the ownership wrapper without temporary-file collisions', async () => {
    const directory = await fixture()
    const runtime = new FakeRuntime()
    const runtimeInfo = fakeProcess(runtime.pid, 'runtime')
    let table = [host, runtimeInfo]
    const originalTerminate = runtime.terminate.bind(runtime)
    runtime.terminate = async options => { const report = await originalTerminate(options); table = [host]; return report }
    const registry = new RuntimeOwnershipRegistry({ directory, hostPid: host.pid, sampleMs: 60000, graceMs: 0, killWaitMs: 0, lister: { list: async () => [...table] } })
    const wrapped = await registry.start({ command: 'fixture', args: [], cwd: tmpdir(), env: {} }, async () => runtime)
    const outcomes = await Promise.allSettled([wrapped.terminate(), wrapped.terminate()])
    expect(outcomes.map(result => result.status)).toEqual(['fulfilled', 'fulfilled'])
    expect((await readdir(directory)).filter(name => name.endsWith('.json'))).toHaveLength(0)
  })
})
