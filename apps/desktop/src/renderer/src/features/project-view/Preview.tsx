import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { hasRenderableContent } from '@shared/project-view/schema'
import { VIEW_NAMES } from '@shared/project/strings'
import type { ViewSnapshot } from '@shared/project-view/types'
import type { ViewSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { useSessions } from '../session/store'
import { Icon } from '../../app/Icon'
import { OverviewSessions } from './ProjectView'
import { MemoViewRenderer } from './renderer'
import { useProjectViews } from './store'

export class RenderBoundary extends Component<{ snapshot: ViewSnapshot; children?: ReactNode }, { failed: boolean; lastGood: ViewSnapshot | null }> {
  override state = { failed: false, lastGood: null as ViewSnapshot | null }
  static getDerivedStateFromError() { return { failed: true } }
  override componentDidCatch(_error: Error, _info: ErrorInfo) { /* Do not log Knowledge. */ }
  override componentDidMount() { if (!this.state.failed) this.setState({ lastGood: this.props.snapshot }) }
  override componentDidUpdate(previous: Readonly<{ snapshot: ViewSnapshot }>) {
    if (previous.snapshot !== this.props.snapshot) this.setState({ failed: false })
    else if (!this.state.failed && this.state.lastGood !== this.props.snapshot) this.setState({ lastGood: this.props.snapshot })
  }
  override render() {
    if (this.state.failed) return <><p role="alert">View 渲染失败，保留上一版。</p>{this.state.lastGood && <MemoViewRenderer snapshot={this.state.lastGood} />}</>
    return <MemoViewRenderer snapshot={this.props.snapshot} />
  }
}
export function Preview({ project, viewId }: ViewSlotProps) {
  const id = `${project.id}:${viewId}`
  const state = useProjectViews(s => s.states[id]), zoom = useProjectViews(s => s.zoom[id] ?? 1)
  useEffect(() => { void useProjectViews.getState().load(project.id, viewId) }, [project.id, viewId])
  const snapshot = state?.snapshot
  const content = snapshot && hasRenderableContent(snapshot.knowledge, snapshot.definition)
  async function generate() {
    const key = { projectId: project.id, kind: 'new_chat' as const, viewId }
    await useSessions.getState().loadDraft(key)
    useSessions.getState().updateDraft(key, { text: `请根据当前项目的实际文件生成 ${VIEW_NAMES[viewId]}，更新对应的 Project Knowledge；如需调整呈现，再更新 View Definition。不要编造事实。`, contextItems: [{ type: 'view', viewId }] })
    const canvas = useProjectShell.getState().uiStates[project.id]?.mainCanvas
    if (canvas?.mode === 'view' && canvas.viewId === viewId) useProjectShell.getState().setViewConversation(project.id, { kind: 'draft' })
  }
  return <div className="project-view-preview">
    <div className="view-preview-toolbar">
      <span className="muted" role="status">{!state || state.status === 'loading' ? '正在读取…' : state.status === 'stale' ? '更新中…' : snapshot ? `更新于 ${new Date(snapshot.updatedAt).toLocaleTimeString()}` : '只读 Preview'}</span>
      <span className="grow" />
      <button className="icon-button" aria-label="缩小 Preview" disabled={zoom <= .5} onClick={() => useProjectViews.getState().setZoom(project.id, viewId, zoom - .1)}>−</button>
      <button className="text-button" aria-label="重置 Preview 缩放" onClick={() => useProjectViews.getState().setZoom(project.id, viewId, 1)}>{Math.round(zoom * 100)}%</button>
      <button className="icon-button" aria-label="放大 Preview" disabled={zoom >= 2} onClick={() => useProjectViews.getState().setZoom(project.id, viewId, zoom + .1)}>+</button>
    </div>
    {state?.error && <div className="view-preview-error" role="alert"><strong>无法更新此 View</strong><p>{state.error}</p>{content && <p>仍显示上一版有效内容。请在左侧对话中修正文件。</p>}</div>}
    <div className="view-preview-scroll" tabIndex={0} aria-label={`${VIEW_NAMES[viewId]} Preview 内容`}>
      <div className="view-preview-document" style={{ zoom }}>
        {content && snapshot ? <RenderBoundary key={id} snapshot={snapshot} /> : state?.status !== 'loading' && state?.status !== 'error' && <div className="view-empty"><Icon name={viewId} size={28} /><h2>{VIEW_NAMES[viewId]}</h2><p>尚无项目知识。生成指令会填入左侧草稿，由你确认发送。</p><button className="primary-button" onClick={() => void generate()}>生成 {VIEW_NAMES[viewId]}</button></div>}
        {viewId === 'overview' && <OverviewSessions projectId={project.id} />}
      </div>
    </div>
  </div>
}
