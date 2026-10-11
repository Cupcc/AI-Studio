import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { DEFAULT_VIEW_IDS, type ViewId } from '@shared/project/types'
import { VIEW_NAMES } from '@shared/project/strings'
import type { ShellSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { Composer } from '../input/Composer'
import { cliName, useSessions } from './store'
import { CliBadge } from './Status'
import { Transcript } from './Transcript'

export function ConversationHeader({ project, canvas }: ShellSlotProps) {
  const sessionId = canvas.mode === 'session' ? canvas.sessionId : null
  const summary = useSessions((s) => sessionId ? s.summaries[sessionId] : undefined)
  const draft = useSessions((s) => s.drafts[`${project.id}:draft`])
  const origin = summary?.originViewId
  return <>
    {(summary?.cli ?? draft?.cli) && <CliBadge cli={(summary?.cli ?? draft?.cli)!} />}
    <span className="session-header__title">{sessionId ? summary?.title ?? '正在加载对话…' : '新对话'}</span>
    {sessionId && <span className="session-header__cli muted">{cliName(summary?.cli ?? null)}</span>}
    {origin && <><span className="session-header__from muted">· 来自 {VIEW_NAMES[origin as ViewId] ?? origin}</span>
      <button className="link-button" disabled={!DEFAULT_VIEW_IDS.includes(origin as ViewId)} onClick={() => useProjectShell.getState().enterView(project.id, origin as ViewId)} title={origin}>在 View 中打开</button></>}
  </>
}

function SessionConversation({ sessionId, projectId, active }: { sessionId: string; projectId: string; active: boolean }) {
  const conversation = useSessions((s) => s.conversations[sessionId]), latestRequest = useSessions((s) => s.latestRequests[sessionId] ?? 0)
  const summary = useSessions((s) => s.summaries[sessionId]), openError = useSessions((s) => s.errors[`open:${sessionId}`])
  const ref = useRef<HTMLDivElement>(null), contentRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const lastScrollTop = useRef(0)
  const [away, setAway] = useState(!following.current), [positioned, setPositioned] = useState(false), [gutter, setGutter] = useState(0)
  const previousLatestRequest = useRef(latestRequest)
  const prepend = useRef<{ height: number; top: number } | null>(null)
  useEffect(() => { void useSessions.getState().loadConversation(sessionId) }, [sessionId])
  function latest() {
    const node = ref.current
    if (!node) return
    following.current = true; node.scrollTop = node.scrollHeight; lastScrollTop.current = node.scrollTop; setAway(false)
  }
  async function older() {
    const node = ref.current
    if (!node || conversation?.loading || !conversation?.hasMore) return
    prepend.current = { height: node.scrollHeight, top: node.scrollTop }
    await useSessions.getState().loadConversation(sessionId, true)
  }
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || !conversation?.loaded || !active) return
    const requestedLatest = latestRequest !== previousLatestRequest.current
    // History clicks jump to latest. Tab returns retain the existing following
    // state and scroll position; their read acknowledgement is independent.
    if (!positioned) {
      node.scrollTop = node.scrollHeight
      setPositioned(true)
    } else if (requestedLatest) latest()
    else if (prepend.current && !conversation.loading) {
      node.scrollTop = prepend.current.top + node.scrollHeight - prepend.current.height
      prepend.current = null
    } else if (following.current) node.scrollTop = node.scrollHeight
    lastScrollTop.current = node.scrollTop
    setAway(!following.current)
    previousLatestRequest.current = latestRequest
  }, [conversation?.items, conversation?.loaded, conversation?.loading, active, latestRequest, positioned])
  // Classic scrollbars reserve a gutter on both edges of the feed; the composer gets the same inset so their edges stay aligned (Shell Spec v02 §2.2).
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => setGutter((node.offsetWidth - node.clientWidth) / 2)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const content = contentRef.current, node = ref.current
    if (!content || !node) return
    const observer = new ResizeObserver(() => { if (active && following.current && positioned) latest() })
    observer.observe(content)
    // Composer autosizing and window resizing change the viewport independently
    // of transcript growth, so following must respond to both sizes.
    observer.observe(node)
    return () => observer.disconnect()
  }, [active, positioned])
  return <div className="session-conversation" style={{ '--scrollbar-gutter': `${gutter}px` } as CSSProperties}>
    <div ref={ref} className="session-conversation__scroll" aria-label="对话记录" tabIndex={0} onScroll={(event) => {
      if (!active || !positioned || prepend.current) return
      const node = event.currentTarget
      const moved = node.scrollTop !== lastScrollTop.current
      lastScrollTop.current = node.scrollTop
      // A queued programmatic scroll can arrive after the viewport shrinks.
      // Its larger bottom gap is not a user scroll; leave following enabled
      // so the resize observer can restore the latest position.
      if (following.current && !moved) return
      following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48
      setAway(!following.current)
      if (node.scrollTop < 80 && !following.current) void older()
    }}>
      {!conversation?.loaded && !conversation?.error && <div className="conversation-skeleton" aria-label="正在加载对话"><span /><span /><span /></div>}
      {conversation?.error && <div className="conversation-load-error" role="alert"><p>{conversation.error}</p><button className="secondary-button" onClick={() => void useSessions.getState().loadConversation(sessionId, conversation.loaded)}>重试加载</button></div>}
      <div ref={contentRef} className="session-conversation__transcript" style={{ visibility: positioned ? 'visible' : 'hidden' }}>
        {conversation?.hasMore && <button className="conversation-older" disabled={conversation.loading} onClick={() => void older()}>{conversation.loading ? '正在加载…' : '加载更早的消息'}</button>}
        {conversation?.items.map((item) => <Transcript key={item.id} item={item} />)}
        {conversation?.loaded && !conversation.items.length && <p className="muted">还没有消息</p>}
        {summary?.activity === 'running' && !conversation?.items.some((item) => item.kind === 'agent_message' && !item.complete) && <p className="conversation-working"><span className="session-spinner" />{summary.stopping ? '正在停止当前一轮…' : 'Agent 正在执行…'}</p>}
        {openError && <p role="alert" className="error-message">{openError}</p>}
      </div>
    </div>
    {away && <button className="conversation-latest" onClick={latest}>回到最新 ↓</button>}
    <Composer draftKey={{ projectId, kind: 'session', sessionId }} active={active} />
  </div>
}

export function Conversation({ project, canvas, active }: ShellSlotProps) {
  if (canvas.mode === 'session') return <SessionConversation key={canvas.sessionId} projectId={project.id} sessionId={canvas.sessionId} active={active} />
  return <NewChatDraft project={project} active={active} />
}

/** Session Mode draft: greeting and composer centred together; after the first send the Session layout takes over (Shell Spec v02 §6). */
function NewChatDraft({ project, active }: Pick<ShellSlotProps, 'project' | 'active'>) {
  const cli = useSessions((s) => s.drafts[`${project.id}:draft`]?.cli ?? null)
  return <div className="session-conversation session-conversation--draft">
    <div className="session-draft">
      <div className="session-draft__greeting"><h2>今天要在 {project.name} 中做什么？</h2><p>{cli ? cliName(cli) : 'Agent'} 会直接在 {project.displayPath} 中执行</p></div>
      <Composer draftKey={{ projectId: project.id, kind: 'new_chat' }} active={active} />
    </div>
  </div>
}
