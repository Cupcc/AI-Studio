import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SESSION_MESSAGE_MAX_LENGTH } from '@shared/ipc/session'
import { VIEW_NAMES } from '@shared/project/strings'
import type { ViewId } from '@shared/project/types'
import type { DraftKey } from '@shared/session/types'
import { cliName, draftId, useSessions } from '../session/store'
import { useProjectShell } from '../project/store'
import { Icon } from '../../app/Icon'

export interface ComposerProps { draftKey: DraftKey; active: boolean; originViewId?: string | null }
export function Composer({ draftKey, active, originViewId = null }: ComposerProps) {
  const id = draftId(draftKey)
  const draft = useSessions((s) => s.drafts[id]), loading = useSessions((s) => s.draftLoading[id])
  const session = useSessions((s) => draftKey.kind === 'session' ? s.summaries[draftKey.sessionId] : undefined)
  const providers = useSessions((s) => s.providers), pending = useSessions((s) => s.pending), errors = useSessions((s) => s.errors)
  const cli = session?.cli ?? draft?.cli ?? null
  const catalog = useSessions((s) => cli ? s.catalogs[`${draftKey.projectId}:${cli}`] : undefined)
  const model = session ? session.model : draft?.model ?? null
  const input = useRef<HTMLTextAreaElement>(null), composing = useRef(false), justComposedAt = useRef(0)
  const [contextMenu, setContextMenu] = useState(false), [notice, setNotice] = useState<string | null>(null)
  const contextRef = useRef<HTMLDivElement>(null)
  const text = draft?.text ?? '', provider = providers.find((p) => p.cli === cli)
  const unavailable = draftKey.kind === 'new_chat' && provider?.status !== 'available'
  const running = session?.activity === 'running', needsInput = session?.activity === 'needs_input'
  const stopping = session?.stopping || (session && pending[`stop:${session.id}`])
  const busy = !!pending[id] || !!(session && pending[`model:${session.id}`])
  const stopButton = running || (needsInput && !text.trim())
  const canSend = !!draft && !!text.trim() && !unavailable && !running && !stopping && !busy
  useEffect(() => { void useSessions.getState().loadDraft(draftKey) }, [id])
  useEffect(() => { if (cli) void useSessions.getState().loadModels(draftKey.projectId, cli) }, [cli, draftKey.projectId])
  useEffect(() => { if (active && draft) input.current?.focus() }, [id, active, !!draft])
  useEffect(() => { setNotice(null) }, [id])
  useEffect(() => {
    if (!contextMenu) return
    const outside = (event: PointerEvent) => { if (!contextRef.current?.contains(event.target as Node)) setContextMenu(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [contextMenu])
  useLayoutEffect(() => {
    const node = input.current
    if (!node) return
    node.style.height = 'auto'
    const line = Number.parseFloat(getComputedStyle(node).lineHeight) || 20
    node.style.height = `${Math.min(line * 8, Math.max(line, node.scrollHeight))}px`
  }, [text])
  async function send() {
    if (!canSend) return
    if (model && catalog && !catalog.error && !catalog.models.some((item) => item.id === model)) {
      const name = model
      if (session) { if (!await useSessions.getState().setModel(session.id, null)) return }
      else useSessions.getState().updateDraft(draftKey, { model: null })
      setNotice(`模型 ${name} 已不可用，本轮使用 CLI 默认。`)
    }
    const created = await useSessions.getState().sendComposer(draftKey, originViewId)
    if (created && draftKey.kind === 'new_chat') useProjectShell.getState().openSession(draftKey.projectId, created.id)
  }
  const knownModels = catalog?.models.filter((item) => !item.hidden || item.id === model) ?? []
  const nativeDefault = knownModels.find((item) => item.isDefault)
  const modelMissing = !!model && !!catalog && !catalog.error && !catalog.models.some((item) => item.id === model)
  return <div className="composer">
    {unavailable && <div className="composer__availability" role="status">
      {provider?.reason ?? (!cli ? '请选择已安装并已登录的 CLI。' : '正在检查 CLI…')}
      {!cli && providers.filter((item) => item.status === 'available').map((item) => <button className="text-button" key={item.cli} onClick={() => useSessions.getState().updateDraft(draftKey, { cli: item.cli, model: null })}>{item.displayName}</button>)}
    </div>}
    <div className="composer__box">
    <textarea ref={input} aria-label={needsInput ? '回复 Agent' : '消息'} placeholder={needsInput ? '回复 Agent…' : `向 ${cliName(cli)} 发送消息…`} value={text} maxLength={SESSION_MESSAGE_MAX_LENGTH} disabled={!!loading || !draft} rows={1}
      onChange={(event) => useSessions.getState().updateDraft(draftKey, { text: event.target.value })}
      onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false; justComposedAt.current = performance.now() }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey) return
        if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229 || performance.now() - justComposedAt.current < 50) return
        event.preventDefault()
        if (canSend) void send()
      }} />
    <div className="composer__toolbar">
      <div className="composer__context" ref={contextRef} onKeyDown={(event) => { if (event.key === 'Escape') setContextMenu(false) }}>
        <button className="icon-button composer__add" aria-label="Context / Attachment" data-tip="添加上下文" aria-expanded={contextMenu} onClick={() => setContextMenu(!contextMenu)}><Icon name="plus" size={15} /></button>
        {contextMenu && <div className="composer__context-menu popover"><button className="menu-item" disabled>从 Files 添加文件</button><p className="menu-item__sub">暂不支持添加附件</p></div>}
      </div>
      <div className="composer__tags">{draft?.contextItems.map((context, index) => <span className="composer__tag" key={`${context.type}:${index}`}>
        <Icon name={context.type === 'view' ? 'preview' : 'file'} size={12} /><span className="composer__tag-name">{context.type === 'view' ? VIEW_NAMES[context.viewId as ViewId] ?? context.viewId : context.path.split('/').at(-1)}</span>
        <button aria-label={`移除上下文 ${context.type === 'view' ? context.viewId : context.path}`} onClick={() => useSessions.getState().updateDraft(draftKey, { contextItems: draft.contextItems.filter((_, itemIndex) => itemIndex !== index) })}><Icon name="close" size={10} /></button>
      </span>)}</div>
      <span className="composer__models-wrap"><select className="composer__models" aria-label="Model Selector" title={catalog?.error ?? (session && session.activity !== 'none' ? '选择的模型从下一轮开始生效' : '当前 CLI 的模型')} value={model ?? ''} disabled={!cli || !catalog || !!catalog.error || !!(session && pending[`model:${session.id}`])} onChange={(event) => {
        const selected = event.target.value || null
        if (session) void useSessions.getState().setModel(session.id, selected)
        else useSessions.getState().updateDraft(draftKey, { model: selected })
      }}>
        <option value="">{nativeDefault ? `${nativeDefault.displayName}（默认）` : 'CLI 默认'}</option>
        {knownModels.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        {model && !knownModels.some((item) => item.id === model) && <option value={model}>{model}{modelMissing ? '（不可用）' : ''}</option>}
      </select><Icon name="chevron" size={12} /></span>
      <button className={`composer__send ${stopButton ? 'is-stop' : ''} ${stopping || busy ? 'is-busy' : ''}`} aria-label={stopping ? '停止中…' : stopButton ? 'Stop' : busy ? '发送中…' : 'Send'} data-tip={stopButton ? (stopping ? '停止中…' : '停止') : undefined} data-tip-align="end" disabled={stopButton ? !!stopping : !canSend} onClick={() => { if (stopButton && session) void useSessions.getState().stop(session.id); else void send() }}>
        {stopping || busy ? <span className="session-spinner session-spinner--inverse" aria-hidden="true" /> : <Icon name={stopButton ? 'stop' : 'arrow-up'} size={14} />}
      </button>
    </div>
    </div>
    {modelMissing && <p className="composer__notice">该模型已不可用，下一轮将使用 CLI 默认。</p>}
    {notice && <p className="composer__notice" role="status">{notice}</p>}
    {(errors[id] || (session && (errors[`stop:${session.id}`] || errors[`model:${session.id}`]))) && <p className="error-message" role="alert">{errors[id] || (session && (errors[`stop:${session.id}`] || errors[`model:${session.id}`]))}</p>}
  </div>
}
