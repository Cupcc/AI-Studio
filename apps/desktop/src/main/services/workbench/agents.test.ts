import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { FakeProvider } from '@ai-studio/agent-adapter/testing'
import { openDatabase } from '../database/database'
import { migrations } from '../database/migrations'
import { createProjectService } from '../project/project-service'
import { SessionService } from '../session/session-service'
import { SessionStore } from '../session/store'
import { WorkbenchService } from './workbench-service'
import type { InstanceWorkbenchRef } from '@shared/workbench/types'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn() })
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'selection-agent-')), root = join(dir, 'project'); mkdirSync(root)
  const database = openDatabase({ userDataDir: join(dir, 'data'), migrations }), projects = createProjectService(() => database.db)
  const opened = projects.openPath(root); if (!opened.ok) throw new Error('fixture')
  const projectId = opened.project.id, provider = new FakeProvider('codex')
  const sessions = new SessionService({ store: new SessionStore(database.db), projects, providers: [provider], environment: async () => ({ env: {} }) })
  const createHost = () => {
    const host = new WorkbenchService({ database: () => database.db, projectPath: () => root, presetRoot: fileURLToPath(new URL('../../../../out/workbench-packages', import.meta.url)), changed: () => {} })
    host.setAgentPort(sessions); return host
  }
  const host = createHost()
  cleanup.push(async () => { host.dispose(); await sessions.dispose(); database.close(); rmSync(dir,{recursive:true,force:true}) })
  const install = async (templateId?: 'product-selection') => {
    const draft = host.createDraft({ projectId, source: 'template', templateId })
    const snapshot = await host.getSnapshot({ projectId, viewId: draft.viewId }); if (!snapshot.page) throw new Error('fixture')
    const instance = host.applyDraft({ ref: { projectId, viewId: draft.viewId }, expectedPackageRevision: snapshot.page.packageRevision })
    const ref: InstanceWorkbenchRef = { projectId, viewId: instance.viewId }; return ref
  }
  return { host, createHost, sessions, provider, database, ref: await install('product-selection'), install }
}
const request = { requestId: 'run-one', key: 'market', title: '市场分析', text: 'Analyze this source', model: null }
it('runs through SessionService, deduplicates requests, persists ownership and stops the underlying turn', async () => {
  const f = await fixture()
  const draftKey = { projectId: f.ref.projectId, kind: 'new_chat' as const, viewId: f.ref.viewId }
  await f.sessions.saveDraft(draftKey, { cli: 'codex', model: null, text: '尚未发送的讨论', contextItems: [] })
  const pending=f.host.startAgent(f.ref,request)
  expect(()=>f.host.startAgent(f.ref,{...request,text:'conflicting pending request'})).toThrow('不同请求')
  const [first, duplicate] = await Promise.all([pending,f.host.startAgent(f.ref,request)])
  expect((await f.sessions.getDraft(draftKey)).text).toBe('尚未发送的讨论')
  expect(first.session.id).toBe(duplicate.session.id)
  expect(f.sessions.list(f.ref.projectId)).toHaveLength(1)
  expect(first.session).toMatchObject({ cli:'codex', originViewId:f.ref.viewId, title:'市场分析' })
  expect(f.host.getAgent(f.ref, request.requestId).items).toContainEqual(expect.objectContaining({kind:'user_message',text:request.text}))
  const reopened=f.createHost()
  expect(reopened.listAgents(f.ref)[0]?.session.id).toBe(first.session.id)
  await reopened.stopAgent(f.ref,request.requestId)
  expect(reopened.getAgent(f.ref,request.requestId).session).toMatchObject({activity:'none',lastOutcome:'interrupted'})
  reopened.dispose()
  await expect(f.host.startAgent(f.ref,request)).resolves.toMatchObject({session:{id:first.session.id}})
  expect(()=>f.host.startAgent(f.ref,{...request,text:'different'})).toThrow('不同请求')
})
it('refuses undeclared execution and access from another instance', async () => {
  const f=await fixture(), run=await f.host.startAgent(f.ref,request), other=await f.install('product-selection'), notes=await f.install()
  expect(()=>f.host.getAgent(other,run.request.requestId)).toThrow('不属于')
  expect(()=>f.host.stopAgent(other,run.request.requestId)).toThrow('不属于')
  expect(()=>f.host.startAgent(notes,request)).toThrow('未启用')
  await f.sessions.stop(run.session.id)
})
it('rolls back session creation when the durable association fails', async () => {
  const f=await fixture()
  f.database.db.exec("CREATE TRIGGER reject_selection BEFORE INSERT ON workbench_agent_runs BEGIN SELECT RAISE(ABORT, 'cannot save'); END")
  await expect(f.host.startAgent(f.ref,request)).rejects.toThrow('cannot save')
  expect(f.sessions.list(f.ref.projectId)).toHaveLength(0)
  expect(f.database.db.prepare('SELECT count(*) AS n FROM sessions').get()?.n).toBe(0)
})
