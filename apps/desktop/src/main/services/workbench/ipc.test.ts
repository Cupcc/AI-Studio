import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createCoreServices, type CoreServices } from '../core'
import { projectShellFor } from '../project'
import { createWorkbenchFeature } from '../../ipc/workbench'
import { createSenderPolicy } from '../../security/policy'
import { registerFeatureHandlers, type MainIpc } from '../../ipc/registry'
import { workbenchContract } from '@shared/ipc/workbench'

let directory: string, core: CoreServices, projectId: string
const broadcast = vi.fn()
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'workbench-ipc-'))
  const path = join(directory, 'project'); mkdirSync(path)
  core = createCoreServices({ userDataDir: join(directory, 'data'), broadcast, appInfo: () => ({ name: 'Test', version: '1', isPackaged: false, platform: process.platform, arch: process.arch, versions: { electron: '', chrome: '', node: process.versions.node } }) })
  const opened = projectShellFor(core).projects.openPath(path)
  if (!opened.ok) throw new Error('fixture failed')
  projectId = opened.project.id
})
afterEach(() => { core.dispose(); rmSync(directory, { recursive: true, force: true }) })
it('routes the registered contract through actual persistence and blocks plugin frames from direct IPC', async () => {
  const handlers = new Map<string, Parameters<MainIpc['handle']>[1]>()
  const feature = createWorkbenchFeature(core)
  const unregister = registerFeatureHandlers({ handle: (name, handler) => { handlers.set(name, handler) }, removeHandler: name => { handlers.delete(name) } }, [workbenchContract], [feature], { isTrustedSender: createSenderPolicy() })
  const invoke = (name: string, data: unknown, senderUrl = 'app://studio/index.html') => {
    const handler = handlers.get(name)
    if (!handler) throw new Error('Missing handler')
    return handler({ sender: { id: 1 }, senderFrame: { url: senderUrl } }, data)
  }
  await expect(invoke('workbench:create-draft', { projectId, source: 'template' }, 'app://workbench/index.html')).rejects.toThrow('untrusted sender')
  await invoke('workbench:create-draft', { projectId, source: 'template' })
  expect(await invoke('workbench:list', { projectId })).toMatchObject({ instances: [], drafts: [expect.objectContaining({ projectId, source: 'template' })] })
  expect(broadcast).toHaveBeenCalledWith(workbenchContract.events.changed, expect.objectContaining({ projectId }))
  await expect(invoke('workbench:create-draft', { projectId, source: 'arbitrary' })).rejects.toThrow('source')
  await expect(invoke('workbench:update-state', { target: { projectId, kind: 'draft', id: 'missing' }, state: new Map(), expectedRevision: 0 })).rejects.toThrow('JSON')
  await expect(invoke('workbench:set-enabled', { projectId, instanceId: 'missing', enabled: 'yes' })).rejects.toThrow('布尔值')
  await expect(invoke('workbench:list', { projectId, root: '/' })).rejects.toThrow('Unexpected field')
  for (const expectedPackageRevision of [undefined, '', 'f'.repeat(63), 'z'.repeat(64)]) {
    await expect(invoke('workbench:apply-draft', { projectId, draftId: 'draft', ...(expectedPackageRevision === undefined ? {} : { expectedPackageRevision }) })).rejects.toThrow('expectedPackageRevision')
  }
  unregister(); expect(handlers.size).toBe(0)
})
