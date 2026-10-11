import { VIEW_NAMES } from '@shared/project/strings'
import { sortSessions } from '@shared/session/presentation'
import type { ViewSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { Composer } from '../input/Composer'
import { SessionConversation } from '../session/Conversation'
import { draftId, useSessions } from '../session/store'
import { CliBadge } from '../session/Status'

export function ViewConversationHeader(props: ViewSlotProps) {
  const { canvas, viewId } = props
  const sessionId = canvas.mode === 'view' && canvas.conversation.kind === 'session' ? canvas.conversation.sessionId : null
  const key = { projectId: props.project.id, kind: 'new_chat' as const, viewId }
  const draft = useSessions(s => s.drafts[draftId(key)]), providers = useSessions(s => s.providers)
  const summary = useSessions(s => sessionId ? s.summaries[sessionId] : undefined)
  return <>{summary && <CliBadge cli={summary.cli} />}<span>{VIEW_NAMES[viewId]}</span><span className="grow" />{sessionId ?
    <button className="text-button" onClick={() => useProjectShell.getState().setViewConversation(props.project.id, { kind: 'draft' })}>新对话</button> :
    <select aria-label="View CLI" className="view-cli-select" value={draft?.cli ?? ''} disabled={!draft} onChange={event => useSessions.getState().updateDraft(key, { cli: event.target.value as 'codex' | 'claude-code', model: null })}>
      <option value="" disabled>选择 CLI</option>{providers.map(provider => <option key={provider.cli} value={provider.cli} disabled={provider.status !== 'available'}>{provider.displayName}{provider.status !== 'available' ? ' · 不可用' : ''}</option>)}
    </select>}</>
}
export function ViewConversation({ project, canvas, active, viewId }: ViewSlotProps) {
  const summaries = useSessions(s => s.summaries)
  const recent = sortSessions(Object.values(summaries).filter(s => s.projectId === project.id && s.originViewId === viewId)).slice(0, 3)
  if (canvas.mode === 'view' && canvas.conversation.kind === 'session') return <SessionConversation key={canvas.conversation.sessionId} projectId={project.id} sessionId={canvas.conversation.sessionId} active={active} />
  return <div className="view-conversation-draft">
    <div className="view-recent"><h3>最近对话</h3>{recent.length ? recent.map(session =>
      <button key={session.id} className="view-session-link" onClick={() => useProjectShell.getState().setViewConversation(project.id, { kind: 'session', sessionId: session.id })}>{session.title}</button>
    ) : <p className="muted">此 View 还没有对话。</p>}</div>
    <div className="view-draft-prompt"><h2>整理 {VIEW_NAMES[viewId]}</h2><p className="muted">通过普通 CLI 对话更新项目知识，右侧会显示文件的最新有效版本。</p></div>
    <Composer draftKey={{ projectId: project.id, kind: 'new_chat', viewId }} originViewId={viewId} active={active} />
  </div>
}
export function OverviewSessions({ projectId }: { projectId: string }) {
  const summaries = useSessions(s => s.summaries)
  const sessions = sortSessions(Object.values(summaries).filter(s => s.projectId === projectId))
  const groups = [
    ['Recent Sessions', sessions.slice(0, 3)],
    ['Needs Input', sessions.filter(s => s.activity === 'needs_input').slice(0, 3)],
    ['Recently Completed', sessions.filter(s => s.lastOutcome === 'completed' || s.status === 'completed_unread').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3)]
  ] as const
  return <div className="view-client-sessions" aria-label="项目 Session 摘要">{groups.map(([title, items]) => <section key={title}><h3>{title}</h3>{items.length ? items.map(session => <button className="view-session-link" key={session.id} onClick={() => useProjectShell.getState().setViewConversation(projectId, { kind: 'session', sessionId: session.id })}>{session.title}</button>) : <p className="muted">暂无</p>}</section>)}</div>
}
