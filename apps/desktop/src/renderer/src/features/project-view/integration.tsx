import { registerShellIntegration } from '../project/integration'
import { useProjectShell } from '../project/store'
import { Preview } from './Preview'
import { isWorkbenchViewId } from '@shared/workbench/types'
import type { ViewSlotProps } from '../project/integration'
import { WorkbenchPreview } from '../workbench/WorkbenchPreview'
import { WorkbenchNavigation } from '../workbench/WorkbenchNavigation'
import { useWorkbenches, watchWorkbenches } from '../workbench/store'
import { ViewConversation, ViewConversationHeader } from './ProjectView'
import { useProjectViews, watchProjectViews } from './store'
import './project-view.css'
function ProjectPreview(props: ViewSlotProps) {
  return isWorkbenchViewId(props.viewId) ? <WorkbenchPreview {...props} viewId={props.viewId} /> : <Preview {...props} viewId={props.viewId} />
}
export function installProjectViewIntegration(): () => void {
  const unwatch = watchProjectViews()
  const unwatchWorkbenches = watchWorkbenches()
  const unregister = registerShellIntegration({ Preview: ProjectPreview, ViewConversation, ViewConversationHeader, Workbenches: WorkbenchNavigation })
  const unsubscribe = useProjectShell.subscribe((state, previous) => {
    const open = new Set(state.windowState.tabs.filter(t => t.kind === 'project').map(t => t.projectId))
    for (const tab of previous.windowState.tabs) if (tab.kind === 'project' && !open.has(tab.projectId)) { useProjectViews.getState().close(tab.projectId); useWorkbenches.getState().close(tab.projectId) }
  })
  return () => { unwatch(); unwatchWorkbenches(); unregister(); unsubscribe() }
}
