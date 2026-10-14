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
import { stubMainToolPort, type MainToolPort } from './tool-port'

export interface ProjectShellMain {
  readonly projects: ProjectService
  sessionPort(): MainSessionPort
  setSessionPort(port: MainSessionPort): void
  toolPort(): MainToolPort
  setToolPort(port: MainToolPort): void
  isProjectClosing(projectId: string): boolean
  isQuitting(): boolean
  closeProject(projectId: string, confirmed: boolean): Promise<CloseProjectResult>
  quitFlow: QuitFlow | null
  onStateFlushed: (() => void) | null
  views?: { open(projectId: string): unknown; close(projectId: string): void }
  toolsChanged?: () => void
}

const shells = new WeakMap<object, ProjectShellMain>()

export function projectShellFor(core: Pick<CoreServices, 'database'>): ProjectShellMain {
  let shell = shells.get(core)
  if (!shell) {
    let port = stubMainSessionPort
    let tools = stubMainToolPort
    const closing = new Map<string, Promise<CloseProjectResult>>()
    const cleaning = new Map<string, Promise<CloseProjectResult>>()
    shell = {
      projects: createProjectService(() => core.database().db),
      sessionPort: () => port,
      setSessionPort: (next) => {
        port = next
      },
      toolPort: () => tools,
      setToolPort: next => { tools = next },
      isProjectClosing: id => closing.has(id) || cleaning.has(id),
      isQuitting: () => !!shell!.quitFlow?.cleanupPending || shell!.quitFlow?.state === 'stopping' || shell!.quitFlow?.state === 'approved',
      closeProject: async (id, confirmed) => {
        if (!shell!.projects.getProject(id)) throw new Error('Unknown project')
        const existing = closing.get(id)
        if (existing) return existing
        if (cleaning.has(id)) return { status: 'failed', failed: [{ sessionId: '', reason: '资源仍在清理，请稍后重试' }] }
        const operation = closeProjectWithSessions(port, id, confirmed, 10_000, tools, cleanup => {
          cleaning.set(id, cleanup)
          const finish = () => { if (cleaning.get(id) === cleanup) cleaning.delete(id) }
          void cleanup.then(finish, finish)
        })
          .then(result => {
            if (result.status === 'closed') shell!.views?.close(id)
            return result
          }).finally(() => closing.delete(id))
        closing.set(id, operation)
        return operation
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
