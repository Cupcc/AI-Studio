import { closeRightSidebar, selectRightArea } from '@shared/project/ui-rules'
import { currentTool } from '@shared/project/ui-state'
import { studio } from '../../lib/studio'
import { registerShellIntegration } from '../project/integration'
import { useProjectShell } from '../project/store'
import { useTerminals, watchTerminals } from './terminal-store'
import { installFilesIntegration } from './files/integration'
import { filesApi } from './files/api'
import { useFiles } from './files/files-store'
import { installDiffIntegration } from './diff/integration'
import { QuickOpen, useQuickOpen } from './quick-open/QuickOpen'
import { useSearch } from './search/search-store'
import { currentProjectId, showTool } from './show-tool'
import { Tools } from './Tools'
import './tools.css'

/** VS Code shortcuts from the application menu (DEC-25). They act on the Project of the current window tab only. */
function onToolCommand(command: string): void {
  const projectId = currentProjectId()
  if (!projectId) return
  switch (command) {
    case 'quickOpen': useQuickOpen.getState().show(projectId); break
    case 'showFiles': showTool(projectId, 'files'); break
    case 'showSearch': showTool(projectId, 'search'); useSearch.getState().focus(projectId); break
    case 'showDiff': showTool(projectId, 'diff'); break
    case 'showBrowser': showTool(projectId, 'browser'); break
    case 'toggleTerminal': {
      // ⌃`: shows the Terminal, or hides the panel when the Terminal is already showing (Session Mode).
      const shell = useProjectShell.getState(), ui = shell.uiStates[projectId]
      if (!ui) return
      const showing = ui.mainCanvas.mode === 'view' ? ui.viewRightArea === 'terminal' : ui.sidebarOpen && currentTool(ui) === 'terminal'
      if (showing) shell.updateUiState(projectId, ui.mainCanvas.mode === 'view' ? selectRightArea(ui, 'preview') : closeRightSidebar(ui))
      else showTool(projectId, 'terminal')
      break
    }
  }
}

export function installToolsIntegration(): () => void {
  const unwatch = watchTerminals()
  const uninstallFiles = installFilesIntegration()
  const uninstallDiff = installDiffIntegration()
  const unregister = registerShellIntegration({ Tool: Tools, Overlay: QuickOpen })
  const offMenu = studio().project.onMenuCommand(({ command }) => onToolCommand(command))
  // The Quick Open listing is refreshed after files change; opened files become "recent".
  const offChanged = filesApi().onChanged(event => useQuickOpen.getState().invalidate(event.projectId))
  const offOpened = useFiles.subscribe((state, previous) => {
    for (const [projectId, files] of Object.entries(state.projects)) {
      if (files.selected && files.selected !== previous.projects[projectId]?.selected) useQuickOpen.getState().opened(projectId, files.selected)
    }
  })
  const unsubscribe = useProjectShell.subscribe((state, previous) => {
    const open = new Set(state.windowState.tabs.filter(t => t.kind === 'project').map(t => t.projectId))
    for (const tab of previous.windowState.tabs) {
      if (tab.kind !== 'project' || open.has(tab.projectId)) continue
      useTerminals.getState().forget(tab.projectId)
      useSearch.getState().forget(tab.projectId)
      useQuickOpen.getState().forget(tab.projectId)
    }
  })
  return () => { unsubscribe(); offOpened(); offChanged(); offMenu(); unregister(); uninstallDiff(); uninstallFiles(); unwatch() }
}
