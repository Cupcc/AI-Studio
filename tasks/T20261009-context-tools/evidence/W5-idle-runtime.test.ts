import { DatabaseSync } from 'node:sqlite'
import { expect, it, vi } from 'vitest'
import { FakeProvider } from '../../../packages/agent-adapter/dist/testing/index.js'
import { runMigrations } from '../../../apps/desktop/src/main/services/database/migrator'
import { coreAppMeta } from '../../../apps/desktop/src/main/services/database/migrations/2026100901_core_app_meta'
import { projectCore } from '../../../apps/desktop/src/main/services/database/migrations/2026100902_project_core'
import { sessionCore } from '../../../apps/desktop/src/main/services/database/migrations/2026100903_session_core'
import { createProjectService } from '../../../apps/desktop/src/main/services/project/project-service'
import { SessionService } from '../../../apps/desktop/src/main/services/session/session-service'
import { SessionStore } from '../../../apps/desktop/src/main/services/session/store'

it('W5 surfaces actual Adapter driver disposal failure for idle quit preparation and retries exact ownership', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  runMigrations(db, [coreAppMeta, projectCore, sessionCore])
  db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)')
    .run('p', 'W5 Runtime Fixture', '/tmp', '/tmp', '1', 'w5', '2026-10-13')
  const provider = new FakeProvider('codex')
  const service = new SessionService({
    store: new SessionStore(db), projects: createProjectService(() => db), providers: [provider, new FakeProvider('claude-code')],
    environment: async () => ({ env: { PATH: '/usr/bin' } })
  })
  try {
    const session = await service.create({ projectId: 'p', cli: 'codex', text: 'W5 simulated request' })
    await vi.waitFor(() => expect(provider.sessions).toHaveLength(1))
    const native = provider.sessions[0]!
    await vi.waitFor(() => expect(native.controller.activeTurn).not.toBeUndefined())
    native.controller.sink.nativeTurnEnded(native.controller.activeTurn!.turnId, { status: 'completed' })
    expect(service.activeTurnCountAll().sessions).toBe(0)
    const original = native.driver.dispose.bind(native.driver)
    const dispose = vi.fn().mockRejectedValueOnce(new Error('W5 actual driver could not confirm cleanup')).mockImplementation(original)
    native.driver.dispose = dispose
    await expect(service.releaseAllRuntimes()).rejects.toThrow()
    expect(dispose).toHaveBeenCalledOnce()
    await service.releaseAllRuntimes()
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(provider.sessions).toHaveLength(1)
    expect(service.getConversation(session.id).session.projectId).toBe('p')
  } finally {
    await service.dispose()
    db.close()
  }
})
