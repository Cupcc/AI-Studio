import { terminalContract } from '@shared/ipc/terminal'
import type { CoreServices } from '../core'
import { projectShellFor } from '../project'
import { createTerminalService, type TerminalService } from './service'

const services = new WeakMap<CoreServices, TerminalService>()

export function terminalFor(core: CoreServices): TerminalService {
  let service = services.get(core)
  if (!service) {
    const shell = projectShellFor(core)
    // The optional shape keeps workers independently type-checkable before integration.
    const lifecycle = shell as typeof shell & { isProjectClosing?(id: string): boolean; isQuitting?(): boolean }
    service = createTerminalService({
      projectPath: (id) => shell.projects.getProject(id)?.canonicalPath ?? null,
      canOperate: (id) => !lifecycle.isProjectClosing?.(id) && !lifecycle.isQuitting?.(),
      shellEnv: () => core.shellEnv.get(),
      output: (event) => core.broadcast(terminalContract.events.output, event),
      changed: (event) => core.broadcast(terminalContract.events.changed, event)
    })
    services.set(core, service)
  }
  return service
}

export type { TerminalService } from './service'
