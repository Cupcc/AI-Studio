import { useViewTitle } from './use-view-title'
import { useWorkbenches } from './store'
import { sortSessions } from '@shared/session/presentation'
import type { ViewSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { Composer } from '../input/Composer'
import { SessionConversation } from '../session/Conversation'
import { draftId, useSessions } from '../session/store'
import { CliBadge } from '../session/Status'

export function WorkbenchConversationHeader(props: ViewSlotProps) {
  const { canvas, viewId } = props
  const title = useViewTitle(props.project.id, viewId)
  const sessionId = canvas.mode === 'view' && canvas.conversation.kind === 'session' ? canvas.conversation.sessionId : null
  const key = { projectId: props.project.id, kind: 'new_chat' as const, viewId }
  const draft = useSessions(s => s.drafts[draftId(key)]), providers = useSessions(s => s.providers)
  const summary = useSessions(s => sessionId ? s.summaries[sessionId] : undefined)
  return <>{summary && <CliBadge cli={summary.cli} />}
    <span className="session-header__title" title={sessionId ? summary?.title : '新对话'}>{sessionId ? summary?.title ?? '正在加载对话…' : '新对话'}</span>
    {!sessionId && <span className="view-header-context muted" title={title}>· {title}</span>}
    <span className="grow" />{sessionId ?
    <button className="text-button view-header-new-chat" onClick={() => useProjectShell.getState().setViewConversation(props.project.id, { kind: 'draft' })}>新对话</button> :
    <select aria-label="工作台 CLI" className="view-cli-select" value={draft?.cli ?? ''} disabled={!draft} onChange={event => {
      const cli = providers.find(provider => provider.cli === event.target.value)?.cli
      if (cli) useSessions.getState().updateDraft(key, { cli, ...(cli !== draft?.cli ? { model: null, reasoningEffort: null } : {}) })
    }}>
      <option value="" disabled>选择 CLI</option>{providers.filter(provider => provider.status !== 'disabled').map(provider => <option key={provider.cli} value={provider.cli} disabled={provider.status !== 'available'}>{provider.displayName}{provider.status !== 'available' ? ' · 不可用' : ''}</option>)}
    </select>}</>
}
export function WorkbenchConversation({ project, canvas, active, viewId }: ViewSlotProps) {
  const title = useViewTitle(project.id, viewId)
  const entry = useWorkbenches(s => s.catalogs[project.id]?.find(item => item.viewId === viewId))
  const isDraft = entry?.kind === 'draft'
  const summaries = useSessions(s => s.summaries)
  const recent = sortSessions(Object.values(summaries).filter(s => s.projectId === project.id && s.originViewId === viewId)).slice(0, 3)
  if (canvas.mode === 'view' && canvas.conversation.kind === 'session') return <SessionConversation key={canvas.conversation.sessionId} projectId={project.id} sessionId={canvas.conversation.sessionId} active={active} />
  return <div className="view-conversation-draft">
    <div className="view-draft-prompt"><h2>{isDraft ? '想创建怎样的工作台？' : `在 ${title} 中继续工作`}</h2><p className="muted">{isDraft ? '描述页面的用途与交互。AI 修改草稿文件，你可以在右侧预览后应用。' : entry?.editable ? '结合右侧页面继续对话。修改布局和交互，请使用“编辑工作台”。' : '描述目标，结合右侧工作台继续讨论。'}</p></div>
    {recent.length > 0 && <div className="view-recent"><h3>继续最近的对话</h3>{recent.map(session =>
      <button key={session.id} className="view-session-link" title={session.title} onClick={() => useProjectShell.getState().setViewConversation(project.id, { kind: 'session', sessionId: session.id })}>{session.title}</button>
    )}</div>}
    <Composer draftKey={{ projectId: project.id, kind: 'new_chat', viewId }} originViewId={viewId} active={active} />
  </div>
}
