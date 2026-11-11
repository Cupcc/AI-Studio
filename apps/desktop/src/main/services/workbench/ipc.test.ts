import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createCoreServices, type CoreServices } from '../core'
import { projectShellFor } from '../project'
import { createWorkbenchFeature } from '../../ipc/workbench'
import { createSenderPolicy } from '../../security/policy'
import { registerFeatureHandlers, type MainIpc } from '../../ipc/registry'
import { workbenchContract } from '@shared/ipc/workbench'
import { FakeProvider } from '@ai-studio/agent-adapter/testing'
import { createSessionFeature } from '../../ipc/session'
const electron = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => electron.userData, getAppPath: () => process.cwd() }, BrowserWindow: { getAllWindows: () => [] } }))

let directory: string, core: CoreServices, projectId: string
const broadcast = vi.fn()
const disposers: (() => void | Promise<void>)[] = []
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'workbench-ipc-'))
  const path = join(directory, 'project'); mkdirSync(path)
  electron.userData = join(directory, 'data')
  core = createCoreServices({ userDataDir: join(directory, 'data'), broadcast, appInfo: () => ({ name: 'Test', version: '1', isPackaged: false, platform: process.platform, arch: process.arch, versions: { electron: '', chrome: '', node: process.versions.node } }) })
  const opened = projectShellFor(core).projects.openPath(path)
  if (!opened.ok) throw new Error('fixture failed')
  projectId = opened.project.id
})
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose(); core.dispose(); rmSync(directory, { recursive: true, force: true }); broadcast.mockClear() })
it('routes the registered contract through actual persistence and blocks plugin frames from direct IPC', async () => {
  const handlers = new Map<string, Parameters<MainIpc['handle']>[1]>()
  const feature = createWorkbenchFeature(core)
  disposers.push(() => feature.dispose?.())
  const unregister = registerFeatureHandlers({ handle: (name, handler) => { handlers.set(name, handler) }, removeHandler: name => { handlers.delete(name) } }, [workbenchContract], [feature], { isTrustedSender: createSenderPolicy() })
  const invoke = (name: string, data: unknown, senderUrl = 'app://studio/index.html') => {
    const handler = handlers.get(name)
    if (!handler) throw new Error('Missing handler')
    return handler({ sender: { id: 1 }, senderFrame: { url: senderUrl } }, data)
  }
  await expect(invoke('workbench:create-draft', { projectId, source: 'template' }, 'app://workbench/index.html')).rejects.toThrow('untrusted sender')
  await invoke('workbench:create-draft', { projectId, source: 'template' })
  expect(await invoke('workbench:list', { projectId })).toEqual(expect.arrayContaining([expect.objectContaining({ viewId: 'overview', origin: 'preset' }), expect.objectContaining({ projectId, source: 'template', origin: 'custom', kind: 'draft' })]))
  expect(await invoke('workbench:get-snapshot', { projectId, viewId: 'architecture' })).toMatchObject({ status: 'ready', page: { resources: { knowledge: { status: 'empty' } } } })
  expect(await invoke('workbench:get-context', { projectId, viewId: 'architecture' })).toMatchObject({ text: expect.stringContaining('Current Workbench: Architecture') })
  expect(existsSync(join(directory, 'project/.ai-studio/knowledge'))).toBe(false)
  expect(broadcast).toHaveBeenCalledWith(workbenchContract.events.changed, expect.objectContaining({ projectId }))
  await expect(invoke('workbench:create-draft', { projectId, source: 'arbitrary' })).rejects.toThrow('source')
  await expect(invoke('workbench:update-state', { ref: { projectId, viewId: 'workbench-draft:missing' }, state: new Map(), expectedRevision: 0 })).rejects.toThrow('JSON')
  await expect(invoke('workbench:set-enabled', { ref: { projectId, viewId: 'workbench:missing' }, enabled: 'yes' })).rejects.toThrow('布尔值')
  await expect(invoke('workbench:list', { projectId, root: '/' })).rejects.toThrow('Unexpected field')
  for (const expectedPackageRevision of [undefined, '', 'f'.repeat(63), 'z'.repeat(64)]) {
    await expect(invoke('workbench:apply-draft', { ref: { projectId, viewId: 'workbench-draft:draft' }, ...(expectedPackageRevision === undefined ? {} : { expectedPackageRevision }) })).rejects.toThrow('expectedPackageRevision')
  }
  await expect(invoke('workbench:update-state', { ref: { projectId, viewId: 'overview' }, state: {}, expectedRevision: 0 })).rejects.toThrow('自定义工作台')
  await expect(invoke('workbench:set-enabled', { ref: { projectId, viewId: 'architecture' }, enabled: false })).rejects.toThrow('自定义工作台')
  await invoke('workbench:rename', { ref: { projectId, viewId: 'architecture' }, title: '项目架构' })
  await invoke('workbench:move', { ref: { projectId, viewId: 'architecture' }, before: 'overview' })
  expect(await invoke('workbench:list', { projectId })).toEqual(expect.arrayContaining([expect.objectContaining({ viewId: 'architecture', title: '项目架构' }), expect.objectContaining({ viewId: 'overview' })]))
  await invoke('workbench:set-visible', { ref: { projectId, viewId: 'architecture' }, visible: false })
  expect(await invoke('workbench:list-removed', { projectId })).toMatchObject([{ viewId: 'architecture', title: '项目架构' }])
  await invoke('workbench:set-visible', { ref: { projectId, viewId: 'architecture' }, visible: true })
  await expect(invoke('workbench:rename', { ref: { projectId, viewId: 'overview' }, title: '  ' })).rejects.toThrow('名称须为')
  await expect(invoke('workbench:move', { ref: { projectId, viewId: 'overview' }, before: '/tmp/anything' })).rejects.toThrow('before')
  await expect(invoke('workbench:set-visible', { ref: { projectId, viewId: 'overview' }, visible: 'yes' })).rejects.toThrow('布尔值')
  await expect(invoke('workbench:delete-draft', { projectId, viewId: 'overview' })).rejects.toThrow('自定义工作台')
  await expect(invoke('workbench:rename', { ref: { projectId, viewId: 'overview' }, title: 'no', path: '/' })).rejects.toThrow('Unexpected field')
  await expect(invoke('workbench:rename', { ref: { projectId, viewId: 'overview' }, title: 'no' }, 'app://workbench/index.html')).rejects.toThrow('untrusted sender')
  unregister(); expect(handlers.size).toBe(0)
})
it('routes preset, design-draft and live contexts through the same Session callback without sending on navigation or stopping on disable', async () => {
  const workbench = createWorkbenchFeature(core), provider = new FakeProvider('codex')
  disposers.push(() => workbench.dispose?.())
  const sessions = createSessionFeature(core, { providers: [provider] })
  disposers.push(() => sessions.dispose?.())
  const ctx = { senderId: 1, senderUrl: 'app://studio/index.html' }
  await workbench.handlers.list.handle({ projectId }, ctx)
  await workbench.handlers.getSnapshot.handle({ projectId, viewId: 'architecture' }, ctx)
  expect(provider.sessions).toHaveLength(0)
  expect(existsSync(join(directory, 'project/.ai-studio'))).toBe(false)
  const draft = await workbench.handlers.createDraft.handle({ projectId, source: 'template' }, ctx)
  const draftRef = { projectId, viewId: draft.viewId }
  const preview = await workbench.handlers.getSnapshot.handle(draftRef, ctx)
  if (!preview.page) throw new Error('fixture package failed')
  const instance = await workbench.handlers.applyDraft.handle({ ref: draftRef, expectedPackageRevision: preview.page.packageRevision }, ctx)
  expect(provider.sessions).toHaveLength(0)
  const cases = [
    { viewId: 'architecture', expected: 'Current Workbench: Architecture' },
    { viewId: draft.viewId, expected: '当前任务是创建或编辑 AI Studio 工作台页面' },
    { viewId: instance.viewId, expected: '这是工作台使用对话，不是页面结构编辑' }
  ] as const
  const created = []
  for (const [index, item] of cases.entries()) {
    const summary = await sessions.handlers.create.handle({ projectId, cli: 'codex', text: 'Inspect this workbench', originViewId: item.viewId, viewContextAttached: true }, ctx)
    created.push(summary)
    await expect.poll(() => provider.sessions[index]?.driver.callsTo('startTurn').length).toBe(1)
    expect(JSON.stringify(provider.sessions[index]!.driver.callsTo('startTurn'))).toContain(item.expected)
    expect(summary.originViewId).toBe(item.viewId)
    const conversation = await sessions.handlers.getConversation.handle({ sessionId: summary.id }, ctx)
    expect(conversation.items[0]).toMatchObject({ kind: 'user_message', viewContextAttached: true })
    expect(JSON.stringify(conversation.items)).not.toContain(item.expected)
  }
  expect(existsSync(join(directory, 'project/.ai-studio/schema/knowledge.schema.json'))).toBe(true)
  const detached = await sessions.handlers.create.handle({ projectId, cli: 'codex', text: 'Without context', originViewId: 'architecture', viewContextAttached: false }, ctx)
  await expect.poll(() => provider.sessions[3]?.driver.callsTo('startTurn').length).toBe(1)
  expect(detached).toMatchObject({ originViewId: 'architecture', viewContextAttached: false })
  expect(JSON.stringify(provider.sessions[3]!.driver.callsTo('startTurn'))).not.toContain('Current Workbench')
  const count = await projectShellFor(core).sessionPort().getBlockingSessionCounts(projectId)
  await workbench.handlers.setEnabled.handle({ ref: { projectId, viewId: instance.viewId }, enabled: false }, ctx)
  expect(await projectShellFor(core).sessionPort().getBlockingSessionCounts(projectId)).toEqual(count)
  expect((await sessions.handlers.getConversation.handle({ sessionId: created[2]!.id }, ctx)).session.activity).toBe('running')
  await workbench.handlers.setVisible.handle({ ref: { projectId, viewId: instance.viewId }, visible: false }, ctx)
  await workbench.handlers.deleteDraft.handle(draftRef, ctx)
  expect(await projectShellFor(core).sessionPort().getBlockingSessionCounts(projectId)).toEqual(count)
  expect((await sessions.handlers.getConversation.handle({ sessionId: created[1]!.id }, ctx)).session.activity).toBe('running')
})
