import type { ClosingResource } from '@shared/project/types'

/** Tool ownership remains separate from the Session Stop port (DEC-14). */
export interface MainToolPort {
  activeTerminals(projectId?: string): ClosingResource[]
  /** Open files with unsaved changes (TOOLS-Q13): asked about, never blocking once the close is confirmed. */
  unsavedFiles?(projectId?: string): ClosingResource[]
  closeProject(projectId: string): Promise<void>
  closeAll(): Promise<void>
}

export const stubMainToolPort: MainToolPort = {
  activeTerminals: () => [],
  closeProject: async () => {},
  closeAll: async () => {}
}
