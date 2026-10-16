import { useProjectShell } from '../../project/store'
import { filesApi } from './api'
import { useFiles } from './files-store'

/**
 * Connects the Files store to the main process events and to the Project tabs. Returns the uninstaller.
 * The state of a closed Project tab is dropped (the panel itself only unsubscribes when hidden); `stopped` watch events
 * make the store subscribe again, so a cancelled Project close does not leave the tree without live updates.
 */
export function installFilesIntegration(): () => void {
  const api = filesApi()
  const offChanged = api.onChanged(event => useFiles.getState().changed(event))
  const offWatch = api.onWatchChanged(event => useFiles.getState().watchChanged(event))
  const offTabs = useProjectShell.subscribe((state, previous) => {
    const open = new Set(state.windowState.tabs.filter(t => t.kind === 'project').map(t => t.projectId))
    for (const tab of previous.windowState.tabs) if (tab.kind === 'project' && !open.has(tab.projectId)) useFiles.getState().forget(tab.projectId)
  })
  return () => { offChanged(); offWatch(); offTabs() }
}
