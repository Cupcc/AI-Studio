import { registerShellIntegration } from '../project/integration'
import { useProjectShell } from '../project/store'
import { WorkbenchPreview } from './WorkbenchPreview'
import { WorkbenchNavigation } from './WorkbenchNavigation'
import { WorkbenchConversation, WorkbenchConversationHeader } from './WorkbenchConversation'
import { useWorkbenches, watchWorkbenches } from './store'
import '../project-view/project-view.css'
import './workbench.css'

export function installWorkbenchIntegration(): () => void {
  const unwatch = watchWorkbenches()
  const unregister = registerShellIntegration({
    Preview: WorkbenchPreview, Workbenches: WorkbenchNavigation,
    ViewConversation: WorkbenchConversation, ViewConversationHeader: WorkbenchConversationHeader
  })
  for (const tab of useProjectShell.getState().windowState.tabs) {
    if (tab.kind === 'project') void useWorkbenches.getState().loadCatalog(tab.projectId)
  }
  const unsubscribe = useProjectShell.subscribe((state, previous) => {
    const open = new Set(state.windowState.tabs.filter(tab => tab.kind === 'project').map(tab => tab.projectId))
    const previousOpen = new Set(previous.windowState.tabs.filter(tab => tab.kind === 'project').map(tab => tab.projectId))
    for (const projectId of open) if (!previousOpen.has(projectId)) void useWorkbenches.getState().loadCatalog(projectId)
    for (const tab of previous.windowState.tabs) {
      if (tab.kind === 'project' && !open.has(tab.projectId)) useWorkbenches.getState().close(tab.projectId)
    }
  })
  return () => { unwatch(); unregister(); unsubscribe() }
}
