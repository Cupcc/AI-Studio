import type { ToolId } from '@shared/project/types'
import { selectRightArea } from '@shared/project/ui-rules'
import { shellIntegration } from '../project/integration'
import { useProjectShell } from '../project/store'

/**
 * Shows a tool in the Project's right area, as the tool switcher would. Only for user actions (a menu item, a shortcut,
 * a link the user clicked): Agent activity never changes the layout (02 Context Panel 操作原则).
 */
export function showTool(projectId: string, tool: ToolId): void {
  const shell = useProjectShell.getState()
  const ui = shell.uiStates[projectId]
  if (!ui) return
  shellIntegration().toolSelected?.(projectId, tool)
  const patch = selectRightArea(ui, tool)
  if (patch) shell.updateUiState(projectId, patch)
}

/** The Project shown in the current window tab, if any. */
export function currentProjectId(): string | null {
  const { windowState } = useProjectShell.getState()
  const tab = windowState.tabs.find(item => item.id === windowState.currentTabId)
  return tab?.kind === 'project' ? tab.projectId : null
}
