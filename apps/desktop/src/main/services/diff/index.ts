import { diffContract } from '@shared/ipc/diff'
import type { CoreServices } from '../core'
import { projectShellFor } from '../project'
import { createGitLocator } from './git-locate'
import { createGitRunner } from './git-runner'
import { createDiffService, type DiffService } from './service'

const services = new WeakMap<CoreServices, DiffService>()

export function diffFor(core: CoreServices): DiffService {
  let service = services.get(core)
  if (!service) {
    const shell = projectShellFor(core)
    // The optional shape keeps workers independently type-checkable before integration.
    const lifecycle = shell as typeof shell & { isProjectClosing?(id: string): boolean; isQuitting?(): boolean }
    // Git runs with the login-shell environment (a Finder launch has a minimal PATH), scrubbed of GIT_* by the runner.
    const environment = async () => (await core.shellEnv.get()).env
    const locate = createGitLocator({ env: environment })
    service = createDiffService({
      projectPath: (id) => shell.projects.getProject(id)?.canonicalPath ?? null,
      canOperate: (id) => !lifecycle.isProjectClosing?.(id) && !lifecycle.isQuitting?.(),
      runner: createGitRunner({ locate, environment }),
      invalidated: (event) => core.broadcast(diffContract.events.invalidated, event),
      watchChanged: (event) => core.broadcast(diffContract.events.watchChanged, event)
    })
    services.set(core, service)
  }
  return service
}

export type { DiffService } from './service'
