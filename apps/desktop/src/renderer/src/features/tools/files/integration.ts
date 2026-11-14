import { FILES_UNSAVED_LIMIT } from '@shared/tools/files'
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
  void useFiles.getState().loadPreferences()
  // The main process asks about unsaved files when a Project closes or the app quits (TOOLS-Q13): keep it told.
  const reported = new Map<string, string>()
  const offUnsaved = useFiles.subscribe((state, previous) => {
    for (const projectId of new Set([...Object.keys(state.projects), ...Object.keys(previous.projects)])) {
      const drafts = state.projects[projectId]?.drafts
      if (drafts === previous.projects[projectId]?.drafts) continue
      // A forgotten Project was closed: the main process dropped its list with it.
      if (!drafts) { reported.delete(projectId); continue }
      const paths = [...drafts.keys()].sort().slice(0, FILES_UNSAVED_LIMIT), key = paths.join('\0')
      if ((reported.get(projectId) ?? '') === key) continue
      reported.set(projectId, key)
      try { void Promise.resolve(api.setUnsaved({ projectId, paths })).catch(() => {}) } catch { /* the close then simply does not ask */ }
    }
  })
  const offTabs = useProjectShell.subscribe((state, previous) => {
    const open = new Set(state.windowState.tabs.filter(t => t.kind === 'project').map(t => t.projectId))
    for (const tab of previous.windowState.tabs) if (tab.kind === 'project' && !open.has(tab.projectId)) useFiles.getState().forget(tab.projectId)
  })
  return () => { offChanged(); offWatch(); offTabs(); offUnsaved() }
}
