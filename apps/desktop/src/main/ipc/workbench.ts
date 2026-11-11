import { workbenchContract } from '@shared/ipc/workbench'
import { parseDraftWorkbenchRef, parseInstanceWorkbenchRef, parseJsonState, parseCustomWorkbenchRef, parseWorkbenchRef } from '@shared/workbench/schema'
import type { CoreServices } from '../services/core'
import { workbenchesFor } from '../services/workbench'
import { projectShellFor } from '../services/project'
import { defineHandlers } from './registry'
import { expectOnlyKeys, expectRecord, expectString } from './validate'

const id = (value: unknown, label: string) => expectString(value, label, { minLength: 1, maxLength: 100 })
export function createWorkbenchFeature(core: CoreServices) {
  const service = workbenchesFor(core), shell = projectShellFor(core)
  shell.workbenches = service
  return defineHandlers(workbenchContract, {
    list: {
      parse(raw) { const value = expectRecord(raw); expectOnlyKeys(value, ['projectId']); return { projectId: id(value.projectId, 'projectId') } },
      handle: ({ projectId }) => service.list(projectId)
    },
    createDraft: {
      parse(raw): { projectId: string; source: 'template' | 'ai'; instanceId?: string } {
        const value = expectRecord(raw); expectOnlyKeys(value, ['projectId', 'source', 'instanceId'])
        if (value.source !== 'template' && value.source !== 'ai') throw new Error('source 必须为 template 或 ai')
        return { projectId: id(value.projectId, 'projectId'), source: value.source, ...(value.instanceId !== undefined ? { instanceId: id(value.instanceId, 'instanceId') } : {}) }
      },
      handle: request => service.createDraft(request)
    },
    getSnapshot: { parse: parseWorkbenchRef, handle: ref => service.getSnapshot(ref) },
    getContext: { parse: parseWorkbenchRef, handle: ref => service.buildContext(ref) },
    applyDraft: {
      parse(raw) {
        const value = expectRecord(raw); expectOnlyKeys(value, ['ref', 'expectedPackageRevision'])
        const expectedPackageRevision = expectString(value.expectedPackageRevision, 'expectedPackageRevision', { minLength: 64, maxLength: 64 })
        if (!/^[a-f0-9]{64}$/.test(expectedPackageRevision)) throw new Error('expectedPackageRevision 必须是预览返回的包版本')
        return { ref: parseDraftWorkbenchRef(value.ref), expectedPackageRevision }
      },
      handle: request => service.applyDraft(request)
    },
    updateState: {
      parse(raw) {
        const value = expectRecord(raw); expectOnlyKeys(value, ['ref', 'state', 'expectedRevision'])
        if (typeof value.expectedRevision !== 'number' || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) throw new Error('expectedRevision 必须为非负整数')
        return { ref: parseCustomWorkbenchRef(value.ref), state: parseJsonState(value.state), expectedRevision: value.expectedRevision }
      },
      handle: request => service.updateState(request)
    },
    setEnabled: {
      parse(raw) {
        const value = expectRecord(raw); expectOnlyKeys(value, ['ref', 'enabled'])
        if (typeof value.enabled !== 'boolean') throw new Error('enabled 必须为布尔值')
        return { ref: parseInstanceWorkbenchRef(value.ref), enabled: value.enabled }
      },
      handle: request => service.setEnabled(request)
    }
  }, () => { service.dispose(); shell.workbenches = undefined })
}
