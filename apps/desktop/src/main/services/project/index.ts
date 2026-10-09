// Main-process entry of the project shell for other features. Other modules
// reach the project service and register their seams through
// `projectShellFor(core)` instead of importing internals:
//
//   projectShellFor(core).projects.getProject(id)?.canonicalPath   // CLI cwd
//   projectShellFor(core).setSessionPort(port)                      // quit flow
import type { CoreServices } from '../core'
import { createProjectService, type ProjectService } from './project-service'
import type { QuitFlow } from './quit-flow'
import { stubMainSessionPort, type MainSessionPort } from './session-port'
import type { CloseProjectResult } from '@shared/project/types'
import { closeProjectWithSessions } from './close-flow'

export interface ProjectShellMain {
  readonly projects: ProjectService
  sessionPort(): MainSessionPort
  setSessionPort(port: MainSessionPort): void
  closeProject(projectId: string, confirmed: boolean): Promise<CloseProjectResult>
  quitFlow: QuitFlow | null
  onStateFlushed: (() => void) | null
}

const shells = new WeakMap<object, ProjectShellMain>()

export function projectShellFor(core: Pick<CoreServices, 'database'>): ProjectShellMain {
  let shell = shells.get(core)
  if (!shell) {
    let port = stubMainSessionPort
    shell = {
      projects: createProjectService(() => core.database().db),
      sessionPort: () => port,
      setSessionPort: (next) => {
        port = next
      },
      closeProject: (id, confirmed) => {
        if (!shell!.projects.getProject(id)) throw new Error('Unknown project')
        return closeProjectWithSessions(port, id, confirmed)
      },
      quitFlow: null,
      onStateFlushed: null
    }
    shells.set(core, shell)
  }
  return shell
}

export type { MainSessionPort } from './session-port'
export type { ProjectService } from './project-service'
