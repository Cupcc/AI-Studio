import { closeRightSidebar } from '@shared/project/ui-rules'
import { currentTool } from '@shared/project/ui-state'
import { studio } from '../../lib/studio'
import { registerShellIntegration, shellIntegration } from '../project/integration'
import { useReferenceInspector } from '../input/reference-preview'
import { useProjectShell } from '../project/store'
import { useTerminals, watchTerminals } from './terminal-store'
import { installFilesIntegration } from './files/integration'
import { filesApi } from './files/api'
import { useFiles } from './files/files-store'
import { saveFailureText } from './files/strings'
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
      // ⌃`: shows the Terminal, or hides the sidebar when the Terminal is already showing.
      const shell = useProjectShell.getState(), ui = shell.uiStates[projectId]
      if (!ui) return
      if (ui.sidebarOpen && currentTool(ui) === 'terminal') shell.updateUiState(projectId, closeRightSidebar(ui))
      else showTool(projectId, 'terminal')
      break
    }
  }
}

export function installToolsIntegration(): () => void {
  const unwatch = watchTerminals()
  const uninstallFiles = installFilesIntegration()
  const uninstallDiff = installDiffIntegration()
  const previousToolSelected = shellIntegration().toolSelected
  const unregister = registerShellIntegration({ Tool: Tools, Overlay: QuickOpen, toolSelected(projectId, area) {
    previousToolSelected?.(projectId, area)
    if (area === 'files' && useReferenceInspector.getState().current?.projectId === projectId) useReferenceInspector.setState({ current: null })
  }, async saveFiles(projectId) {
    const failures = await useFiles.getState().saveAll(projectId)
    return failures.map(item => `${item.path}：${saveFailureText(item.outcome)}`)
  } })
  const offMenu = studio().project.onMenuCommand(({ command }) => onToolCommand(command))
  // The Quick Open listing is refreshed after files change; opened files become "recent".
  const offChanged = filesApi().onChanged(event => useQuickOpen.getState().invalidate(event.projectId))
  const offOpened = useFiles.subscribe((state, previous) => {
    for (const [projectId, files] of Object.entries(state.projects)) {
      if (files.selected && files.selected !== previous.projects[projectId]?.selected) useQuickOpen.getState().opened(projectId, files.selected)
    }
  })
  const unsubscribe = useProjectShell.subscribe((state, previous) => {
    // In View Mode the file content takes the workbench's place; entering a workbench shows the workbench again.
    for (const [projectId, ui] of Object.entries(state.uiStates)) {
      const before = previous.uiStates[projectId]?.mainCanvas, now = ui.mainCanvas
      if (before && before !== now && now.mode === 'view' && (before.mode !== 'view' || before.viewId !== now.viewId)) useFiles.getState().hideViewer(projectId)
    }
    const open = new Set(state.windowState.tabs.filter(t => t.kind === 'project').map(t => t.projectId))
    for (const tab of previous.windowState.tabs) {
      if (tab.kind !== 'project' || open.has(tab.projectId)) continue
      useTerminals.getState().forget(tab.projectId)
      useSearch.getState().forget(tab.projectId)
      useQuickOpen.getState().forget(tab.projectId)
      if (useReferenceInspector.getState().current?.projectId === tab.projectId) useReferenceInspector.setState({ current: null })
    }
  })
  return () => { unsubscribe(); offOpened(); offChanged(); offMenu(); unregister(); uninstallDiff(); uninstallFiles(); unwatch() }
}
