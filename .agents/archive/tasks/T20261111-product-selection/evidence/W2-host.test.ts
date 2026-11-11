import { it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { FakeProvider } from '@review-testing'
import { runMigrations } from '@review-main/services/database/migrator'
import { migrations } from '@review-main/services/database/migrations'
import { createProjectService } from '@review-main/services/project/project-service'
import { SessionService } from '@review-main/services/session/session-service'
import { SessionStore } from '@review-main/services/session/store'
import { WorkbenchService } from '@review-main/services/workbench/workbench-service'

it('starting an independent workbench node preserves unsent workbench conversation draft',async()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');runMigrations(db,migrations)
  const root=mkdtempSync(join(tmpdir(),'selection-review-')),projects=createProjectService(()=>db)
  const opened=projects.openPath(root);if(!opened.ok)throw Error('setup')
  const projectId=opened.project.id,provider=new FakeProvider('codex')
  const sessions=new SessionService({store:new SessionStore(db),projects,providers:[provider],environment:async()=>({env:{}})})
  const workbench=new WorkbenchService({database:()=>db,projectPath:()=>root,presetRoot:resolve('apps/desktop/out/workbench-packages'),changed:()=>{}})
  workbench.setAgentPort(sessions)
  try {
    const draft=workbench.createDraft({projectId,source:'template',templateId:'product-selection'})
    const snap=await workbench.getSnapshot({projectId,viewId:draft.viewId});if(!snap.page)throw Error(snap.error||'setup')
    const instance=workbench.applyDraft({ref:{projectId,viewId:draft.viewId},expectedPackageRevision:snap.page.packageRevision})
    const key={kind:'new_chat',projectId,viewId:instance.viewId} as const
    sessions.saveDraft(key,{cli:'codex',model:null,text:'用户尚未发送的讨论草稿',contextItems:[]})
    const before=await sessions.getDraft(key)
    await workbench.startAgent({projectId,viewId:instance.viewId},{requestId:'review-run',key:'market',title:'市场分析',text:'独立节点执行',model:null})
    const after=await sessions.getDraft(key)
    console.log(JSON.stringify({before:before.text,after:after.text}))
    expect(after.text).toBe(before.text)
  } finally {await sessions.dispose();workbench.dispose();db.close();rmSync(root,{recursive:true,force:true})}
})
