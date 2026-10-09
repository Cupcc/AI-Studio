import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from '../../../apps/desktop/node_modules/vitest/dist/index.js'
import { FakeProvider } from '../../../packages/agent-adapter/dist/testing/index.js'
import { runMigrations } from '../../../apps/desktop/src/main/services/database/migrator'
import { coreAppMeta } from '../../../apps/desktop/src/main/services/database/migrations/2026100901_core_app_meta'
import { projectCore } from '../../../apps/desktop/src/main/services/database/migrations/2026100902_project_core'
import { sessionCore } from '../../../apps/desktop/src/main/services/database/migrations/2026100903_session_core'
import { createProjectService } from '../../../apps/desktop/src/main/services/project/project-service'
import { SessionService } from '../../../apps/desktop/src/main/services/session/session-service'
import { SessionStore } from '../../../apps/desktop/src/main/services/session/store'
import type { SessionSummary, TranscriptItem } from '../../../apps/desktop/src/shared/session/types'
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

it('durably reopens 2,000 summaries, all 1,202 paged transcript rows and resumes the exact native conversation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'studio-w6-durable-'))
  const path = join(directory, 'session.sqlite')
  let db = new DatabaseSync(path), service: SessionService | undefined
  const openService = (provider: FakeProvider) => new SessionService({ store: new SessionStore(db), projects: createProjectService(() => db), providers: [provider, new FakeProvider('claude-code')], environment: async () => ({ env: { PATH: '/usr/bin' } }), isForeground: () => false })
  try {
    db.exec('PRAGMA foreign_keys=ON')
    runMigrations(db, [coreAppMeta, projectCore, sessionCore])
    db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)').run('p', 'p', '/tmp', '/tmp/w6-project', '1', 'p', '2026-10-09')
    const provider = new FakeProvider('codex')
    service = openService(provider)
    const created = await service.create({ projectId: 'p', cli: 'codex', text: 'durable transcript' }); await tick()
    const runtime = provider.sessions[0]!.controller, turnId = runtime.activeTurn!.turnId
    for (let n = 0; n < 1200; n++) runtime.sink.itemCompleted(turnId, { itemId: `message-${n}`, kind: 'assistant_message', status: 'completed', text: `row ${n}` })
    runtime.sink.nativeTurnEnded(turnId, { status: 'completed' })
    const nativeId = service.getConversation(created.id).session.nativeSessionId
    service.rename(created.id, 'Durable title')
    service.saveDraft({ projectId: 'p', kind: 'new_chat' }, { cli: 'codex', text: 'Unsent draft', model: null, contextItems: [] })
    const store = new SessionStore(db)
    store.transaction(() => {
      for (let n = 1; n < 2000; n++) store.saveSummary({ ...created, id: `seed-${n}`, nativeSessionId: null, activity: 'none', status: null, completionUnread: false, lastUserMessageAt: created.lastUserMessageAt - n } as SessionSummary)
    })
    await service.dispose(); service = undefined; db.close()
    db = new DatabaseSync(path)
    const resumedProvider = new FakeProvider('codex')
    // The simulated CLI's native history survives the application process.
    resumedProvider.knownNativeIds.add(nativeId!)
    const start = performance.now()
    service = openService(resumedProvider)
    expect(service.list('p')).toHaveLength(2000)
    const reopenListMs = performance.now() - start
    console.info(`W6 disk reopen + 2000-summary list: ${reopenListMs.toFixed(1)} ms`)
    expect(resumedProvider.sessions).toHaveLength(0)
    const durable = service.getConversation(created.id)
    expect(durable.session).toMatchObject({ title: 'Durable title', titleSource: 'user', nativeSessionId: nativeId, completionUnread: true, activity: 'none' })
    expect(durable.items.at(-1)).toMatchObject({ kind: 'turn_end', outcome: 'completed' })
    expect((await service.getDraft({ projectId: 'p', kind: 'new_chat' })).text).toBe('Unsent draft')
    let page = durable, all: TranscriptItem[] = []
    do {
      expect(page.items.length).toBeLessThanOrEqual(500)
      all = [...page.items, ...all]
      if (!page.hasMore) break
      page = service.getConversation(created.id, page.nextBeforeSequence!)
    } while (true)
    expect(all).toHaveLength(1202)
    expect(new Set(all.map(row => row.id)).size).toBe(1202)
    expect(all.map(row => row.sequence)).toEqual(Array.from({ length: 1202 }, (_, n) => n + 1))
    service.send(created.id, { text: 'resume exact original' }); await tick()
    expect(resumedProvider.sessions).toHaveLength(1)
    expect(resumedProvider.sessions[0]!.options.nativeSessionId).toBe(nativeId)
    const resumed = resumedProvider.sessions[0]!.controller
    resumed.sink.nativeTurnEnded(resumed.activeTurn!.turnId, { status: 'completed' })
    expect(service.list('p')[0]!.id).toBe(created.id)
    writeFileSync(new URL('./W6-backend-results.json', import.meta.url), JSON.stringify({ provider: 'simulated', database: 'real SQLite file reopened', summaryCount: 2000, reopenListMs, transcriptRows: all.length, uniqueRows: new Set(all.map(row => row.id)).size, pageLimit: 500, sequentialRows: true, lazyStartup: true, resumeNativeIdRetained: true, draftTitleUnreadRetained: true }, null, 2) + '\n')
    console.info('W6 rows=1202 unique/sequential, lazy resume native identity retained, draft/title/unread retained')
  } finally {
    await service?.dispose(); db.close(); rmSync(directory, { recursive: true, force: true })
  }
})
