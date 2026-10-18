import { displayName } from '../../lib/display-path'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { SESSION_MESSAGE_MAX_LENGTH } from '@shared/ipc/session'
import { VIEW_NAMES } from '@shared/project/strings'
import type { ViewId } from '@shared/project/types'
import { selectRightArea } from '@shared/project/ui-rules'
import type { DraftKey, SkillCatalogResult } from '@shared/session/types'
import { cliName, draftId, FILE_REPLY_BLOCKED, replyBlockedByFiles, useSessions } from '../session/store'
import { useProjectShell } from '../project/store'
import { sessionApi } from '../session/api'
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
  const [skills, setSkills] = useState<SkillCatalogResult | null>(null)
  const [skillsLoading, setSkillsLoading] = useState(false)
  const skillRequest = useRef(0)
  const [contextMenu, setContextMenu] = useState(false), [notice, setNotice] = useState<string | null>(null)
  const contextRef = useRef<HTMLDivElement>(null), filesNote = useId()
  const text = draft?.text ?? '', provider = providers.find((p) => p.cli === cli)
  const unavailable = draftKey.kind === 'new_chat' && provider?.status !== 'available'
  const running = session?.activity === 'running', needsInput = session?.activity === 'needs_input'
  const stopping = session?.stopping || (session && pending[`stop:${session.id}`])
  const busy = !!pending[id] || !!(session && pending[`model:${session.id}`])
  const supportsRunningInput = running && !!provider && provider.capabilities.inputWhileRunning !== 'none'
  const stopButton = running || (needsInput && !text.trim())
  // A Needs Input reply is text only; file tags would be cleared without the CLI ever receiving them.
  const fileReplyBlocked = replyBlockedByFiles(session, draft)
  const canSend = !!draft && !!text.trim() && !unavailable && (!running || !!supportsRunningInput) && !stopping && !busy && !fileReplyBlocked
  const runningSend = !!supportsRunningInput && !!text.trim() && !stopping && !busy
  useEffect(() => { void useSessions.getState().loadDraft(draftKey) }, [id])
  useEffect(() => { if (cli) void useSessions.getState().loadModels(draftKey.projectId, cli) }, [cli, draftKey.projectId])
  useEffect(() => { if (active && draft) input.current?.focus() }, [id, active, !!draft])
  useEffect(() => { setNotice(null); setSkills(null); setSkillsLoading(false); skillRequest.current++ }, [id, cli])
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
  // Selecting the Files tool is a user action (a click here); adding the file itself happens in Files ("添加到对话").
  function openFiles() {
    setContextMenu(false)
    const shell = useProjectShell.getState(), ui = shell.uiStates[draftKey.projectId]
    if (ui) shell.updateUiState(draftKey.projectId, selectRightArea(ui, 'files'))
  }
  async function loadSkills() {
    if (!cli) return
    const request = ++skillRequest.current
    setSkillsLoading(true)
    try {
      const result = await sessionApi().getSkills({ cli, projectId: draftKey.projectId })
      if (request === skillRequest.current) setSkills(result)
    } catch (error) {
      if (request === skillRequest.current) setSkills({ skills: [], error: error instanceof Error ? error.message : String(error) })
    } finally { if (request === skillRequest.current) setSkillsLoading(false) }
  }
  async function send() {
    if (!canSend) return
    const created = await useSessions.getState().sendComposer(draftKey, originViewId)
    if (created && draftKey.kind === 'new_chat') {
      const shell = useProjectShell.getState()
      const canvas = shell.uiStates[draftKey.projectId]?.mainCanvas
      // A late acceptance must not pull the user back from another View.
      if (draftKey.viewId) {
        if (canvas?.mode === 'view' && canvas.viewId === draftKey.viewId && canvas.conversation.kind === 'draft') shell.setViewConversation(draftKey.projectId, { kind: 'session', sessionId: created.id })
      } else shell.openSession(draftKey.projectId, created.id)
    }
  }
  const knownModels = catalog?.models.filter((item) => !item.hidden || item.id === model) ?? []
  const nativeDefault = knownModels.find((item) => item.isDefault)
  const selectedModel = knownModels.find(item => model ? item.id === model : item.isDefault)
  const reasoningEffort = session ? session.reasoningEffort ?? null : draft?.reasoningEffort ?? null
  const effortLevels = selectedModel?.reasoningEfforts ?? []
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
        <button className="icon-button composer__add" aria-label="Context / Attachment" data-tip="添加上下文" aria-expanded={contextMenu} onClick={() => { setContextMenu(!contextMenu); if (!contextMenu && cli === 'codex') void loadSkills() }}><Icon name="plus" size={15} /></button>
        {contextMenu && <div className="composer__context-menu popover"><button className="menu-item" aria-describedby={filesNote} onClick={openFiles}>从 Files 添加文件</button><p className="menu-item__sub" id={filesNote}>在 Files 中选择文件后点击「添加到对话」</p>{cli === 'codex' && <>
          <p className="menu-item__sub">原生 Skill</p>
          {skillsLoading && <p className="menu-item__sub" role="status">正在读取…</p>}
          {skills?.error && <p className="menu-item__sub" role="status">{skills.error}</p>}
          {!skillsLoading && skills && !skills.skills.length && !skills.error && <p className="menu-item__sub">当前 Project 没有可用 Skill</p>}
          {skills?.skills.map(skill => <button className="menu-item" key={skill.id} title={skill.description} disabled={draft?.contextItems.some(item => item.type === 'skill' && item.id === skill.id)} onClick={() => {
            const current = useSessions.getState().drafts[id]
            if (current) useSessions.getState().updateDraft(draftKey, { contextItems: [...current.contextItems, { type: 'skill', id: skill.id, name: skill.name }] })
            setContextMenu(false)
          }}>{skill.name}</button>)}
        </>}</div>}
      </div>
      <div className="composer__tags">{draft?.contextItems.map((context, index) => <span className="composer__tag" key={`${context.type}:${index}`} title={context.type === 'file' || context.type === 'image' ? displayName(context.path) : undefined}>
        <Icon name={context.type === 'view' ? 'preview' : 'file'} size={12} /><span className="composer__tag-name">{context.type === 'view' ? `当前 View · ${VIEW_NAMES[context.viewId as ViewId] ?? context.viewId}` : context.type === 'skill' ? `Skill · ${context.name}` : `${context.type === 'image' ? '图片 · ' : ''}${displayName(context.path.split('/').at(-1) ?? context.path)}`}</span>
        <button aria-label={`移除上下文 ${context.type === 'view' ? context.viewId : context.type === 'skill' ? context.name : displayName(context.path)}`} onClick={() => useSessions.getState().updateDraft(draftKey, { contextItems: draft.contextItems.filter((_, itemIndex) => itemIndex !== index) })}><Icon name="close" size={10} /></button>
      </span>)}</div>
      <span className="composer__models-wrap"><select className="composer__models" aria-label="Model Selector" title={catalog?.error ?? (session && session.activity !== 'none' ? '选择的模型从下一轮开始生效' : '当前 CLI 的模型')} value={model ?? ''} disabled={!cli || !catalog || !!catalog.error || !!(session && pending[`model:${session.id}`])} onChange={(event) => {
        const selected = event.target.value || null
        if (session) void useSessions.getState().setModel(session.id, selected)
        else useSessions.getState().updateDraft(draftKey, { model: selected })
      }}>
        <option value="">{nativeDefault ? `${nativeDefault.displayName}（默认）` : 'CLI 默认'}</option>
        {knownModels.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        {model && !knownModels.some((item) => item.id === model) && <option value={model}>{model}{modelMissing ? '（目录未列出）' : ''}</option>}
      </select><Icon name="chevron" size={12} /></span>
      {runningSend && <button className="composer__send" aria-label="Send" disabled={!canSend} onClick={() => void send()}><Icon name="arrow-up" size={14} /></button>}
      <button className={`composer__send ${stopButton ? 'is-stop' : ''} ${stopping || busy ? 'is-busy' : ''}`} aria-label={stopping ? '停止中…' : stopButton ? 'Stop' : busy ? '发送中…' : 'Send'} data-tip={stopButton ? (stopping ? '停止中…' : '停止') : undefined} data-tip-align="end" disabled={stopButton ? !!stopping : !canSend} onClick={() => { if (stopButton && session) void useSessions.getState().stop(session.id); else void send() }}>
        {stopping || busy ? <span className="session-spinner session-spinner--inverse" aria-hidden="true" /> : <Icon name={stopButton ? 'stop' : 'arrow-up'} size={14} />}
      </button>
    </div>
    </div>
    {fileReplyBlocked && <p className="composer__notice" role="status">{FILE_REPLY_BLOCKED}</p>}
    {cli === 'codex' && (effortLevels.length > 0 || reasoningEffort) && <label className="composer__notice">推理强度 <select aria-label="Reasoning Effort" value={reasoningEffort ?? ''} disabled={!!(session && pending[`effort:${session.id}`])} onChange={event => {
      const value = event.target.value || null
      if (session) void useSessions.getState().setReasoningEffort(session.id, value)
      else useSessions.getState().updateDraft(draftKey, { reasoningEffort: value })
    }}>
      <option value="">CLI 默认</option>
      {reasoningEffort && !effortLevels.includes(reasoningEffort) && <option value={reasoningEffort}>{reasoningEffort}（目录未列出）</option>}
      {effortLevels.map(level => <option key={level} value={level}>{level}</option>)}
    </select></label>}
    {modelMissing && <p className="composer__notice">模型目录未列出当前选择，发送时仍交由 CLI 处理。</p>}
    {notice && <p className="composer__notice" role="status">{notice}</p>}
    {(errors[id] || (session && (errors[`stop:${session.id}`] || errors[`effort:${session.id}`] || errors[`model:${session.id}`]))) && <p className="error-message" role="alert">{errors[id] || (session && (errors[`stop:${session.id}`] || errors[`effort:${session.id}`] || errors[`model:${session.id}`]))}</p>}
  </div>
}
