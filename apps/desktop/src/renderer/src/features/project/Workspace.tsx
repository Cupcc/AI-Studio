import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { S, TOOL_NAMES } from '@shared/project/strings'
import { TOOL_IDS, type UiState, type ViewId } from '@shared/project/types'
import { currentTool, SIDEBAR_WIDTH, VIEW_CONVERSATION_WIDTH } from '@shared/project/ui-state'
import { canvasLayout } from '@shared/project/layout'
import { closeRightSidebar, selectTool, toggleWorkbench } from '@shared/project/ui-rules'
import { Icon } from '../../app/Icon'
import { useViewTitle } from '../workbench/use-view-title'
import { Navigation } from '../navigation/Navigation'
import { useProjectShell } from './store'
import { useShellIntegration, type ShellSlotProps } from './integration'

function ResizeHandle({ width, min, max, direction, label, onPreview, onCommit }: {
  width: number; min: number; max: number; direction: 1 | -1; label: string
  onPreview(width: number | null): void; onCommit(width: number): void
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)))
  return <div className="resize-handle" role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={Math.round(width)} aria-valuemin={min} aria-valuemax={Math.floor(max)} tabIndex={0}
    onKeyDown={(event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); onCommit(clamp(width + (event.key === 'ArrowRight' ? 10 : -10) * direction))
      }
    }} onPointerDown={(event) => {
      event.preventDefault()
      const target = event.currentTarget, start = event.clientX
      target.setPointerCapture(event.pointerId)
      let next = width
      const move = (e: PointerEvent) => { next = clamp(width + (e.clientX - start) * direction); onPreview(next) }
      const finish = () => {
        target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', finish); target.removeEventListener('pointercancel', cancel)
        onCommit(next); onPreview(null)
      }
      const cancel = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', finish); target.removeEventListener('pointercancel', cancel); onPreview(null) }
      target.addEventListener('pointermove', move); target.addEventListener('pointerup', finish); target.addEventListener('pointercancel', cancel)
    }} />
}
/** Right tool sidebar: the same column in Session and Project View Mode (DEC-33). */
function ToolSidebar({ props, ui, fileViewerHost }: { props: ShellSlotProps; ui: UiState; fileViewerHost: HTMLElement | null }) {
  const slots = useShellIntegration(), shell = useProjectShell()
  const tool = currentTool(ui)
  return <section className="right-area" aria-label={TOOL_NAMES[tool]}>
    <header className="canvas-header right-area__header">
      <div className="tool-switcher" aria-label="右侧工具">{TOOL_IDS.map((id) => <button key={id} className={`icon-button ${tool === id ? 'is-selected' : ''}`} aria-label={TOOL_NAMES[id]} aria-pressed={tool === id} data-tip={TOOL_NAMES[id]} onClick={() => { slots.toolSelected?.(props.project.id, id); shell.updateUiState(props.project.id, selectTool(ui, id)) }}><Icon name={id} /></button>)}</div>
      <span className="right-area__title">{TOOL_NAMES[tool]}</span><span className="grow" />
      <button className="icon-button" aria-label={S.closeSidebar} data-tip={S.close} data-tip-align="end" onClick={() => shell.updateUiState(props.project.id, closeRightSidebar(ui))}><Icon name="close" size={15} /></button>
    </header>
    <div className="right-area__content">{slots.Tool ? <slots.Tool {...props} area={tool} fileViewerHost={fileViewerHost} /> : <div className="canvas-placeholder"><Icon name={tool} size={28} /><h2>{TOOL_NAMES[tool]}</h2><p>{S.placeholderTool(TOOL_NAMES[tool])}</p></div>}</div>
  </section>
}

/** Workbench column of Project View Mode: the page with its host header; closing it gives the space to the conversation (DEC-33). */
function WorkbenchColumn({ props, ui, viewId }: { props: ShellSlotProps; ui: UiState; viewId: ViewId }) {
  const slots = useShellIntegration(), shell = useProjectShell()
  const viewTitle = useViewTitle(props.project.id, viewId)
  const Header = slots.PreviewHeader
  return <section className="workbench-pane" aria-label={S.workbenchColumn}>
    <header className="canvas-header workbench-pane__header">
      <span className="workbench-pane__title">{viewTitle}</span>{Header && <Header {...props} viewId={viewId} part="status" />}<span className="grow" />
      {Header && <><Header {...props} viewId={viewId} part="actions" /><Header {...props} viewId={viewId} part="menu" /></>}
      <button className="icon-button" aria-label={S.closeWorkbench} data-tip={S.closeWorkbench} data-tip-align="end" onClick={() => shell.updateUiState(props.project.id, toggleWorkbench(ui))}><Icon name="close" size={15} /></button>
    </header>
    <div className="workbench-pane__content">{slots.Preview ? <slots.Preview {...props} viewId={viewId} /> : <div className="canvas-placeholder"><Icon name={viewId} size={28} /><h2>{viewTitle}</h2><p>{S.placeholderPreview(viewTitle)}</p></div>}</div>
  </section>
}

export function Workspace({ projectId, active }: { projectId: string; active: boolean }) {
  const shell = useProjectShell(), slots = useShellIntegration()
  const project = shell.projects[projectId]!, ui = shell.uiStates[projectId]!
  const props = { project, canvas: ui.mainCanvas, active }
  const viewTitle = useViewTitle(projectId, ui.mainCanvas.mode === 'view' ? ui.mainCanvas.viewId : 'overview')
  const root = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLElement>(null)
  const [size, setSize] = useState({ workspace: window.innerWidth, gutter: 0, measured: false })
  const [drag, setDrag] = useState<{ conversation?: number | null; sidebar?: number | null }>({})
  const [fileViewerHost, setFileViewerHost] = useState<HTMLDivElement | null>(null)
  // Measured before paint so an automatic navigation collapse does not flash.
  useLayoutEffect(() => {
    const node = root.current!, canvas = canvasRef.current!
    const measure = () => {
      if (!node.clientWidth) return
      const workspace = node.clientWidth, gutter = parseFloat(getComputedStyle(canvas).marginRight) || 0
      setSize((prev) => prev.measured && prev.workspace === workspace && prev.gutter === gutter ? prev : { workspace, gutter, measured: true })
    }
    // The canvas is observed too: a theme change alters its gutter without resizing the workspace.
    const observer = new ResizeObserver(measure); observer.observe(node); observer.observe(canvas); measure()
    return () => observer.disconnect()
  }, [])
  const view = ui.mainCanvas.mode === 'view'
  const workbench = ui.mainCanvas.mode === 'view' && ui.workbenchOpen
  const layout = canvasLayout({
    workspace: size.workspace, gutter: size.gutter, navExpanded: !shell.windowState.navCollapsed, navKeptOpen: shell.navKeptOpen || !size.measured,
    workbench, sidebar: ui.sidebarOpen, conversationWidth: drag.conversation ?? ui.viewConversationWidth, sidebarWidth: drag.sidebar ?? ui.sidebarWidth
  })
  const { setNavSpaceShort } = shell
  useEffect(() => { if (active && size.measured) setNavSpaceShort(layout.spaceShort) }, [active, size.measured, layout.spaceShort, setNavSpaceShort])
  return <div className="project-workspace" ref={root} hidden={!active} data-project-id={projectId}>
    {layout.nav && <Navigation {...props} />}
    <main className={`canvas-mode ${view ? 'canvas-mode--view' : 'canvas-mode--session'} ${workbench ? 'canvas-mode--split' : 'canvas-mode--single'}${layout.overlay ? ' canvas-mode--overlay' : ''}`} ref={canvasRef} style={{ '--conversation-width': `${layout.conversation}px`, '--sidebar-width': `${layout.sidebar}px` } as CSSProperties}>
      <section className="conversation-pane" aria-label={view ? '工作台对话' : '对话'}>
        <header className="canvas-header">{ui.mainCanvas.mode === 'view' && slots.ViewConversationHeader
          ? <slots.ViewConversationHeader {...props} viewId={ui.mainCanvas.viewId} />
          : !view && slots.ConversationHeader ? <slots.ConversationHeader {...props} />
          : <span>{ui.mainCanvas.mode === 'view' ? `${ui.mainCanvas.conversation.kind === 'draft' ? S.draftTitle : ui.mainCanvas.conversation.sessionId} · ${viewTitle}` : ui.mainCanvas.mode === 'draft' ? S.draftTitle : ui.mainCanvas.sessionId}</span>}
          {view && <button className={`icon-button workbench-toggle ${ui.workbenchOpen ? 'is-selected' : ''}`} aria-label={S.workbench} aria-pressed={ui.workbenchOpen} data-tip={S.workbench} data-tip-align="end" onClick={() => shell.updateUiState(projectId, toggleWorkbench(ui))}><Icon name="preview" /></button>}
        </header>
        <div className="conversation-pane__content">{view && ui.mainCanvas.mode === 'view'
          ? slots.ViewConversation ? <slots.ViewConversation {...props} viewId={ui.mainCanvas.viewId} /> : <div className="canvas-placeholder"><Icon name="chat" size={28} /><h2>{S.draftTitle}</h2><p>{S.placeholderViewConversation}</p></div>
          : slots.Conversation ? <slots.Conversation {...props} /> : <div className="canvas-placeholder"><Icon name="chat" size={28} /><h2>{ui.mainCanvas.mode === 'draft' ? S.draftTitle : '对话'}</h2><p>{ui.mainCanvas.mode === 'draft' ? S.placeholderDraft : S.placeholderConversation}</p></div>}
        </div>
        {workbench && <ResizeHandle width={layout.conversation} min={VIEW_CONVERSATION_WIDTH.min} max={layout.conversationMax} direction={1} label={S.resizeConversation} onPreview={(w) => setDrag({ conversation: w })} onCommit={(w) => shell.updateUiState(projectId, { viewConversationWidth: w })} />}
      </section>
      {ui.mainCanvas.mode === 'view' && workbench && <WorkbenchColumn props={props} ui={ui} viewId={ui.mainCanvas.viewId} />}
      <div className="file-viewer-column" ref={setFileViewerHost} />
      {ui.sidebarOpen && <div className="right-pane">
        <ResizeHandle width={layout.sidebar} min={SIDEBAR_WIDTH.min} max={layout.sidebarMax} direction={-1} label={S.resizeSidebar} onPreview={(w) => setDrag({ sidebar: w })} onCommit={(w) => shell.updateUiState(projectId, { sidebarWidth: w })} />
        <ToolSidebar props={props} ui={ui} fileViewerHost={fileViewerHost} />
      </div>}
    </main>
  </div>
}
