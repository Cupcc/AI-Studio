/// <reference types="vite/client" />
import type { StudioApi } from '@shared/ipc/contracts'

declare global {
  interface Window {
    /** Typed API exposed by the preload bridge; the only way to reach the main process. */
    readonly studio: StudioApi
  }
}
