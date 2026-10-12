import { useEffect } from 'react'
import { currentTab } from '@shared/project/tabs'
import { useProjectShell } from '../features/project/store'
import { SettingsDialog } from '../features/settings/SettingsDialog'
import { useSettings } from '../features/settings/store'
import { Launcher } from '../features/project/Launcher'
import { Workspace } from '../features/project/Workspace'
import { ConfirmDialogs } from './ConfirmDialog'
import { TopBar } from './TopBar'
import '../styles/primitives.css'
import './shell.css'

export function App() {
  const shell = useProjectShell()
  const tab = currentTab(shell.windowState)
  const settingsOpen = useSettings((state) => state.dialogOpen)
  // Close and quit confirmations take precedence over settings (specs/settings/spec.md FR-SET-001 §3).
  const confirming = !!(shell.closeDialog || shell.quitRequest)
  useEffect(() => { void shell.bootstrap(); return shell.watchEvents() }, [])
  return (
    <><div className="shell" inert={confirming || settingsOpen}>
      <TopBar /><div className="shell__body">
        {shell.status !== 'ready' ? <div className="canvas-placeholder">{shell.error ?? '正在恢复 Workspace…'}</div> : <>
          {tab?.kind === 'launcher' && <Launcher />}
          {shell.windowState.tabs.map((t) => t.kind === 'project' && <Workspace key={t.projectId} projectId={t.projectId} active={t.id === shell.windowState.currentTabId} />)}
        </>}
      </div>
    </div><ConfirmDialogs />{settingsOpen && !confirming && <SettingsDialog />}</>
  )
}
