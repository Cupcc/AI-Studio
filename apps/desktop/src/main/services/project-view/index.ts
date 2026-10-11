import { projectViewContract } from '@shared/ipc/project-view'
import type { CoreServices } from '../core'
import { projectShellFor } from '../project'
import { ProjectViewService } from './project-view-service'
const services = new WeakMap<object, ProjectViewService>()
export function projectViewsFor(core: CoreServices): ProjectViewService {
  let service = services.get(core)
  if (!service) {
    service = new ProjectViewService({
      projectPath: id => {
        const project = projectShellFor(core).projects.getProject(id)
        if (!project) throw new Error('Unknown Project')
        return project.canonicalPath
      },
      changed: state => core.broadcast(state.status === 'error' ? projectViewContract.events.error : projectViewContract.events.snapshotChanged, state)
    })
    services.set(core, service)
  }
  return service
}
