import { afterEach, describe, expect, it, vi } from '../../../../packages/agent-adapter/node_modules/vitest/dist/index.js'
import { DatabaseSync } from 'node:sqlite'
import { FakeProvider } from '../../../../packages/agent-adapter/src/testing/scripted-driver.js'
import { SessionService } from '../../../../apps/desktop/src/main/services/session/session-service'
import { SessionStore } from '../../../../apps/desktop/src/main/services/session/store'
import { createProjectService } from '../../../../apps/desktop/src/main/services/project/project-service'
import { runMigrations } from '../../../../apps/desktop/src/main/services/database/migrator'
import { migrations } from '../../../../apps/desktop/src/main/services/database/migrations'
import { createFeatureDisposer } from '../../../../apps/desktop/src/main/ipc/index'
import type { FeatureHandlers } from '../../../../apps/desktop/src/main/ipc/registry'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const release of cleanup.splice(0).reverse()) await release() })
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function harness(provider = new FakeProvider('codex')) {
  const db = new DatabaseSync(':memory:')
  runMigrations(db, migrations)
  db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)')
    .run('project', 'fixture', '/tmp', '/tmp/w27-review', '1', '1', '2026-10-18')
  const service = new SessionService({ store: new SessionStore(db), projects: createProjectService(() => db), providers: [provider, new FakeProvider('claude-code')], environment: async () => ({ env: { PATH: '/usr/bin' } }) })
  cleanup.push(async () => { await service.dispose().catch(() => {}); if (db.isOpen) db.close() })
  return { db, provider, service }
}

describe('W27 independent final disposal review; no Electron launch, no CLI', () => {
  it('rejects a failed Provider dispose and invokes it again on the next service attempt', async () => {
    const provider = new FakeProvider('codex')
    const original = provider.dispose.bind(provider)
    const dispose = vi.spyOn(provider, 'dispose').mockRejectedValueOnce(new Error('exit unconfirmed')).mockImplementation(original)
    const { service, db } = harness(provider)
    await expect(service.dispose()).rejects.toThrow('Session cleanup failed')
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(db.isOpen).toBe(true)
    await expect(service.dispose()).resolves.toBeUndefined()
    expect(dispose).toHaveBeenCalledTimes(2)
    await service.dispose()
    expect(dispose).toHaveBeenCalledTimes(2)
  })

  it('retains the exact retired Session handle after disposal failure and retries without creating another Runtime', async () => {
    const { service, provider, db } = harness()
    const session = await service.create({ projectId: 'project', cli: 'codex', text: 'fixture' })
    await tick()
    const native = provider.sessions[0]!
    native.controller.sink.nativeTurnEnded(native.controller.activeTurn!.turnId, { status: 'completed' })
    const original = native.driver.dispose.bind(native.driver)
    const dispose = vi.spyOn(native.driver, 'dispose').mockRejectedValueOnce(new Error('exact handle not exited')).mockImplementation(original)
    await expect(service.dispose()).rejects.toThrow('Session cleanup failed')
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(service.getConversation(session.id).session.nativeSessionId).toBe(native.controller.nativeSessionId)
    expect(db.isOpen).toBe(true)
    await expect(service.dispose()).resolves.toBeUndefined()
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(provider.sessions).toHaveLength(1)
  })

  it('keeps IPC registered on feature failure, retries only failed features and merges concurrent calls', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const succeeds = vi.fn(async () => {})
    const retries = vi.fn().mockImplementationOnce(async () => { await gate; throw new Error('tool not exited') }).mockResolvedValue(undefined)
    const unregister = vi.fn()
    const disposer = createFeatureDisposer([{ dispose: retries }, { dispose: succeeds }] as FeatureHandlers[], unregister)
    const first = disposer()
    const overlapping = disposer()
    expect(overlapping).toBe(first)
    const assertions = Promise.all([expect(first).rejects.toThrow('Feature cleanup failed'), expect(overlapping).rejects.toThrow('Feature cleanup failed')])
    release()
    await assertions
    expect(unregister).not.toHaveBeenCalled()
    expect(succeeds).toHaveBeenCalledTimes(1)
    expect(retries).toHaveBeenCalledTimes(1)
    await disposer()
    expect(succeeds).toHaveBeenCalledTimes(1)
    expect(retries).toHaveBeenCalledTimes(2)
    expect(unregister).toHaveBeenCalledTimes(1)
    await disposer()
    expect(retries).toHaveBeenCalledTimes(2)
    expect(unregister).toHaveBeenCalledTimes(1)
  })
})
