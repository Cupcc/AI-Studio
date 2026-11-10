import { workbenchContract } from '@shared/ipc/workbench'
import { parseJsonState, parseTarget } from '@shared/workbench/schema'
import type { CoreServices } from '../services/core'
import { workbenchesFor } from '../services/workbench'
import { defineHandlers } from './registry'
import { expectOnlyKeys, expectRecord, expectString } from './validate'

const id = (value: unknown, label: string) => expectString(value, label, { minLength: 1, maxLength: 100 })
export function createWorkbenchFeature(core: CoreServices) {
  const service = workbenchesFor(core)
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
      handle: ({ projectId, source, instanceId }) => service.createDraft(projectId, source, instanceId)
    },
    getSnapshot: { parse: parseTarget, handle: target => service.getSnapshot(target) },
    applyDraft: {
      parse(raw) {
        const value = expectRecord(raw); expectOnlyKeys(value, ['projectId', 'draftId', 'expectedPackageRevision'])
        const expectedPackageRevision = expectString(value.expectedPackageRevision, 'expectedPackageRevision', { minLength: 64, maxLength: 64 })
        if (!/^[a-f0-9]{64}$/.test(expectedPackageRevision)) throw new Error('expectedPackageRevision 必须是预览返回的包版本')
        return { projectId: id(value.projectId, 'projectId'), draftId: id(value.draftId, 'draftId'), expectedPackageRevision }
      },
      handle: ({ projectId, draftId, expectedPackageRevision }) => service.applyDraft(projectId, draftId, expectedPackageRevision)
    },
    updateState: {
      parse(raw) {
        const value = expectRecord(raw); expectOnlyKeys(value, ['target', 'state', 'expectedRevision'])
        if (typeof value.expectedRevision !== 'number' || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) throw new Error('expectedRevision 必须为非负整数')
        return { target: parseTarget(value.target), state: parseJsonState(value.state), expectedRevision: value.expectedRevision }
      },
      handle: ({ target, state, expectedRevision }) => service.updateState(target, state, expectedRevision)
    },
    setEnabled: {
      parse(raw) {
        const value = expectRecord(raw); expectOnlyKeys(value, ['projectId', 'instanceId', 'enabled'])
        if (typeof value.enabled !== 'boolean') throw new Error('enabled 必须为布尔值')
        return { projectId: id(value.projectId, 'projectId'), instanceId: id(value.instanceId, 'instanceId'), enabled: value.enabled }
      },
      handle: ({ projectId, instanceId, enabled }) => service.setEnabled(projectId, instanceId, enabled)
    }
  }, () => service.dispose())
}
