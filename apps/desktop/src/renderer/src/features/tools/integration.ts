import { registerShellIntegration } from '../project/integration'
import { useProjectShell } from '../project/store'
import { useTerminals, watchTerminals } from './terminal-store'
import { Tools } from './Tools'
import './tools.css'

export function installToolsIntegration(): () => void {
  const unwatch = watchTerminals()
  const unregister = registerShellIntegration({ Tool: Tools })
  const unsubscribe = useProjectShell.subscribe((state, previous) => {
    const open = new Set(state.windowState.tabs.filter(t => t.kind === 'project').map(t => t.projectId))
    for (const tab of previous.windowState.tabs) if (tab.kind === 'project' && !open.has(tab.projectId)) useTerminals.getState().forget(tab.projectId)
  })
  return () => { unwatch(); unregister(); unsubscribe() }
}
