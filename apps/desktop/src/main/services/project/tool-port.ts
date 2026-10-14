import type { ClosingResource } from '@shared/project/types'

/** Tool ownership remains separate from the Session Stop port (DEC-14). */
export interface MainToolPort {
  activeTerminals(projectId?: string): ClosingResource[]
  closeProject(projectId: string): Promise<void>
  closeAll(): Promise<void>
}

export const stubMainToolPort: MainToolPort = {
  activeTerminals: () => [],
  closeProject: async () => {},
  closeAll: async () => {}
}
