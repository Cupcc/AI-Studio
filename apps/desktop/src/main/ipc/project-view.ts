import { projectViewContract } from '@shared/ipc/project-view'
import { catalogEntry } from '@shared/project-view/defaults'
import type { CoreServices } from '../services/core'
import { projectViewsFor } from '../services/project-view'
import { projectShellFor } from '../services/project'
import { defineHandlers } from './registry'
import { expectOnlyKeys, expectRecord, expectString } from './validate'
export function createProjectViewFeature(core: CoreServices) {
  const service = projectViewsFor(core)
  const shell = projectShellFor(core)
  shell.views = service
  function ref(raw: unknown) {
    const value = expectRecord(raw)
    expectOnlyKeys(value, ['projectId', 'viewId'])
    const projectId = expectString(value.projectId, 'projectId', { minLength: 1, maxLength: 100 })
    const viewId = expectString(value.viewId, 'viewId', { minLength: 1, maxLength: 100 })
    catalogEntry(viewId)
    return { projectId, viewId }
  }
  return defineHandlers(projectViewContract, {
    list: {
      parse: raw => {
        const value = expectRecord(raw); expectOnlyKeys(value, ['projectId'])
        return { projectId: expectString(value.projectId, 'projectId', { minLength: 1, maxLength: 100 }) }
      },
      handle: ({ projectId }) => service.list(projectId)
    },
    getSnapshot: { parse: ref, handle: ({ projectId, viewId }) => service.getSnapshot(projectId, viewId) },
    getContext: { parse: ref, handle: ({ projectId, viewId }) => service.buildContext(projectId, viewId) }
  }, () => { service.dispose(); shell.views = undefined })
}
