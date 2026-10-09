import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { S, TOOL_NAMES, VIEW_NAMES } from '@shared/project/strings'
import { TOOL_IDS, type RightArea, type UiState } from '@shared/project/types'
import { currentTool, SIDEBAR_WIDTH, VIEW_CONVERSATION_WIDTH } from '@shared/project/ui-state'
import { effectiveConversationWidth, effectiveSidebarWidth } from '@shared/project/layout'
import { closeRightSidebar, selectRightArea } from '@shared/project/ui-rules'
import { Icon } from '../../app/Icon'
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
function RightArea({ props, ui, area, viewMode }: { props: ShellSlotProps; ui: UiState; area: RightArea; viewMode: boolean }) {
  const slots = useShellIntegration(), shell = useProjectShell()
  const viewId = props.canvas.mode === 'view' ? props.canvas.viewId : 'overview'
  const title = <span className="right-area__title">{area === 'preview' ? VIEW_NAMES[viewId] : TOOL_NAMES[area]}</span>
  const tools = TOOL_IDS.map((tool, i) => <button key={tool} className={`icon-button ${area === tool ? 'is-selected' : ''}`} aria-label={TOOL_NAMES[tool]} aria-pressed={area === tool} data-tip={TOOL_NAMES[tool]} data-tip-align={viewMode && i === TOOL_IDS.length - 1 && area === 'preview' ? 'end' : undefined} onClick={() => shell.updateUiState(props.project.id, selectRightArea(ui, tool))}><Icon name={tool} /></button>)
  return <section className={`right-area ${viewMode ? 'right-area--view' : ''} ${area === 'preview' ? 'right-area--preview' : ''}`} aria-label={area === 'preview' ? S.preview : TOOL_NAMES[area]}>
    <header className="canvas-header right-area__header">
      {viewMode ? <>
        {title}<span className="grow" />
        <div className="tool-switcher" aria-label="右侧工具">
          <button className={`icon-button ${area === 'preview' ? 'is-selected' : ''}`} aria-label={S.preview} aria-pressed={area === 'preview'} data-tip={`${S.preview} · ${VIEW_NAMES[viewId]}`} onClick={() => shell.updateUiState(props.project.id, selectRightArea(ui, 'preview'))}><Icon name="preview" /></button><span className="tool-switcher__divider" />
          {tools}
        </div>
      </> : <><div className="tool-switcher" aria-label="右侧工具">{tools}</div>{title}<span className="grow" /></>}
      {area !== 'preview' && <button className="icon-button" aria-label="关闭右侧工具" data-tip={S.close} data-tip-align="end" onClick={() => shell.updateUiState(props.project.id, closeRightSidebar(ui))}><Icon name="close" size={15} /></button>}
    </header>
    <div className="right-area__content">{area === 'preview'
      ? slots.Preview ? <slots.Preview {...props} viewId={viewId} /> : <div className="canvas-placeholder"><Icon name={viewId} size={28} /><h2>{VIEW_NAMES[viewId]}</h2><p>{S.placeholderPreview(VIEW_NAMES[viewId])}</p></div>
      : slots.Tool ? <slots.Tool {...props} area={area} /> : <div className="canvas-placeholder"><Icon name={area} size={28} /><h2>{TOOL_NAMES[area]}</h2><p>{S.placeholderTool(TOOL_NAMES[area])}</p></div>}
    </div>
  </section>
}

export function Workspace({ projectId, active }: { projectId: string; active: boolean }) {
  const shell = useProjectShell(), slots = useShellIntegration()
  const project = shell.projects[projectId]!, ui = shell.uiStates[projectId]!
  const props = { project, canvas: ui.mainCanvas, active }
  const ref = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(window.innerWidth - (shell.windowState.navCollapsed ? 0 : 248))
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  useEffect(() => {
    const node = ref.current!
    const measure = () => { if (node.clientWidth) setAvailable(node.clientWidth) }
    const observer = new ResizeObserver(measure); observer.observe(node); measure()
    return () => observer.disconnect()
  }, [])
  const view = ui.mainCanvas.mode === 'view'
  const width = view ? effectiveConversationWidth(available, dragWidth ?? ui.viewConversationWidth) : effectiveSidebarWidth(available, dragWidth ?? ui.sidebarWidth)
  return <div className="project-workspace" hidden={!active} data-project-id={projectId}>
    {!shell.windowState.navCollapsed && <Navigation {...props} />}
    <main className={`canvas-mode ${view ? 'canvas-mode--view' : 'canvas-mode--session'}`} ref={ref} style={{ '--pane-width': `${width}px` } as CSSProperties}>
      <section className="conversation-pane" aria-label={view ? 'Project View 对话' : 'Conversation'}>
        <header className="canvas-header">{ui.mainCanvas.mode === 'view' && slots.ViewConversationHeader
          ? <slots.ViewConversationHeader {...props} viewId={ui.mainCanvas.viewId} />
          : !view && slots.ConversationHeader ? <slots.ConversationHeader {...props} />
          : <span>{ui.mainCanvas.mode === 'view' ? `${ui.mainCanvas.conversation.kind === 'draft' ? S.draftTitle : ui.mainCanvas.conversation.sessionId} · ${VIEW_NAMES[ui.mainCanvas.viewId]}` : ui.mainCanvas.mode === 'draft' ? S.draftTitle : ui.mainCanvas.sessionId}</span>}</header>
        <div className="conversation-pane__content">{view && ui.mainCanvas.mode === 'view'
          ? slots.ViewConversation ? <slots.ViewConversation {...props} viewId={ui.mainCanvas.viewId} /> : <div className="canvas-placeholder"><Icon name="chat" size={28} /><h2>{S.draftTitle}</h2><p>{S.placeholderViewConversation}</p></div>
          : slots.Conversation ? <slots.Conversation {...props} /> : <div className="canvas-placeholder"><Icon name="chat" size={28} /><h2>{ui.mainCanvas.mode === 'draft' ? S.draftTitle : 'Conversation'}</h2><p>{ui.mainCanvas.mode === 'draft' ? S.placeholderDraft : S.placeholderConversation}</p></div>}
        </div>
        {view && <ResizeHandle width={width} min={VIEW_CONVERSATION_WIDTH.min} max={Math.min(VIEW_CONVERSATION_WIDTH.max, available - 400)} direction={1} label={S.resizeConversation} onPreview={setDragWidth} onCommit={(w) => shell.updateUiState(projectId, { viewConversationWidth: w })} />}
      </section>
      {(view || ui.sidebarOpen) && <div className="right-pane">
        {!view && <ResizeHandle width={width} min={SIDEBAR_WIDTH.min} max={Math.min(SIDEBAR_WIDTH.max, available - 400)} direction={-1} label={S.resizeSidebar} onPreview={setDragWidth} onCommit={(w) => shell.updateUiState(projectId, { sidebarWidth: w })} />}
        <RightArea props={props} ui={ui} area={view ? ui.viewRightArea : currentTool(ui)} viewMode={view} />
      </div>}
    </main>
  </div>
}
