import { workbenchContract } from '@shared/ipc/workbench'
import type { CoreServices } from '../core'
import { projectShellFor } from '../project'
import { WorkbenchService } from './workbench-service'

const services = new WeakMap<CoreServices, WorkbenchService>()
export function workbenchesFor(core: CoreServices): WorkbenchService {
  let service = services.get(core)
  if (!service) {
    service = new WorkbenchService({
      database: () => core.database().db,
      projectPath: id => {
        const project = projectShellFor(core).projects.getProject(id)
        if (!project) throw new Error('找不到 Project')
        return project.canonicalPath
      },
      changed: target => core.broadcast(workbenchContract.events.changed, { projectId: target.projectId, target })
    })
    services.set(core, service)
  }
  return service
}
