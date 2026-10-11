import { registerShellIntegration } from '../project/integration'
import { useProjectShell } from '../project/store'
import { Preview } from './Preview'
import { ViewConversation, ViewConversationHeader } from './ProjectView'
import { useProjectViews, watchProjectViews } from './store'
import './project-view.css'
export function installProjectViewIntegration(): () => void {
  const unwatch = watchProjectViews()
  const unregister = registerShellIntegration({ Preview, ViewConversation, ViewConversationHeader })
  const unsubscribe = useProjectShell.subscribe((state, previous) => {
    const open = new Set(state.windowState.tabs.filter(t => t.kind === 'project').map(t => t.projectId))
    for (const tab of previous.windowState.tabs) if (tab.kind === 'project' && !open.has(tab.projectId)) useProjectViews.getState().close(tab.projectId)
  })
  return () => { unwatch(); unregister(); unsubscribe() }
}
