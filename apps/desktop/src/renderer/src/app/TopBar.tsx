import { useEffect, useRef } from 'react'
import { canCloseTab, currentProjectId, tabLabels } from '@shared/project/tabs'
import { S } from '@shared/project/strings'
import { isRightSidebarActive } from '@shared/project/ui-state'
import { toggleRightSidebar } from '@shared/project/ui-rules'
import type { WindowTab } from '@shared/project/types'
import { AttentionDot } from '../features/project/AttentionDot'
import { useProjectAttention } from '../features/project/integration'
import { useProjectShell } from '../features/project/store'
import { Icon } from './Icon'

function ProjectTab({ tab, label }: { tab: WindowTab; label: string }) {
  const shell = useProjectShell()
  const active = shell.windowState.currentTabId === tab.id
  const attention = useProjectAttention(tab.kind === 'project' ? tab.projectId : null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (active) ref.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) }, [active])
  const project = tab.kind === 'project' ? shell.projects[tab.projectId] : null
  return <div className={`project-tab ${active ? 'is-selected' : ''}`} ref={ref}>
    <button role="tab" aria-selected={active} aria-label={`${label}${!active && attention ? `，${S.tabAttention[attention]}` : ''}`}
      title={project ? `${project.name}\n${project.localPath}` : label} className="project-tab__activate" onClick={() => shell.activateTab(tab.id)}>
      {!active && tab.kind === 'project' && <AttentionDot projectId={tab.projectId} />}
      <span>{label}</span>
    </button>
    <button className="project-tab__close" aria-label={S.closeTab(label)} disabled={!canCloseTab(shell.windowState, tab.id)} onClick={() => void shell.requestClose(tab.id)}><Icon name="close" size={12} /></button>
  </div>
}

export function TopBar() {
  const shell = useProjectShell()
  const id = currentProjectId(shell.windowState)
  const ui = id ? shell.uiStates[id] : null
  const labels = tabLabels(shell.windowState.tabs.flatMap((tab) => tab.kind === 'project' && shell.projects[tab.projectId] ? [shell.projects[tab.projectId]!] : []))
  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar__traffic-lights" aria-hidden="true" />
      <button className="icon-button no-drag topbar__nav" aria-label={shell.windowState.navCollapsed ? S.expandNav : S.collapseNav} data-tip={id ? (shell.windowState.navCollapsed ? S.expandNav : S.collapseNav) : S.availableAfterOpen} disabled={!id} onClick={shell.toggleNav}>
        <Icon name="navigation" />{shell.windowState.navCollapsed && <AttentionDot projectId={id} />}
      </button>
      {shell.windowState.navCollapsed && <button className="icon-button no-drag" aria-label={S.newChat} data-tip={id ? S.newChat : S.availableAfterOpen} disabled={!id} onClick={() => id && shell.startDraft(id)}><Icon name="pencil" size={15} /></button>}
      <div className="topbar__tabs no-drag" role="tablist" aria-label="Projects">
        {shell.windowState.tabs.map((tab) => <ProjectTab key={tab.id} tab={tab} label={tab.kind === 'launcher' ? S.launcherTabTitle : labels.get(tab.projectId) ?? ''} />)}
      </div>
      <button className="topbar__add no-drag" aria-label={S.newTab} data-tip={S.newTab} onClick={shell.newTab}><Icon name="plus" size={14} /></button>
      <div className="topbar__drag-space" />
      <button className={`icon-button no-drag topbar__sidebar ${ui && isRightSidebarActive(ui) ? 'is-selected' : ''}`} aria-label={S.rightSidebar} aria-pressed={ui ? isRightSidebarActive(ui) : false} data-tip={id ? S.rightSidebar : S.availableAfterOpen} data-tip-align="end" disabled={!id} onClick={() => id && ui && shell.updateUiState(id, toggleRightSidebar(ui))}><Icon name="sidebar" /></button>
    </header>
  )
}
