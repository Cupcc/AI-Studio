// Core services shared by all main-process features. Feature modules get
// this object from src/main/ipc/index.ts and create their own services.
import type { AppInfo } from '@shared/ipc/app'
import type { AnyEventChannel, PayloadOf } from '@shared/ipc/contract'
import { openDatabase, type StudioDatabase } from './database/database'
import { migrations } from './database/migrations'
import { createShellEnvService, type ShellEnvService } from './shell-env/login-env'

export interface CoreServices {
  appInfo(): AppInfo
  /** Opens the database on first use and runs pending migrations. */
  database(): StudioDatabase
  /** Login-shell environment for spawning CLIs and terminals. */
  shellEnv: ShellEnvService
  /** Sends a typed event to every application window. */
  broadcast<E extends AnyEventChannel>(channel: E, payload: PayloadOf<E>): void
  dispose(): void
}

export interface CoreServicesOptions {
  userDataDir: string
  appInfo: () => AppInfo
  broadcast: CoreServices['broadcast']
}

export function createCoreServices(options: CoreServicesOptions): CoreServices {
  let database: StudioDatabase | null = null
  return {
    appInfo: options.appInfo,
    database: () => (database ??= openDatabase({ userDataDir: options.userDataDir, migrations })),
    shellEnv: createShellEnvService(),
    broadcast: options.broadcast,
    dispose: () => {
      database?.close()
      database = null
    }
  }
}
