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
import { ControlMenu } from './ControlMenu'
import { EffortSignal } from './EffortSignal'
import { useSuggestions } from './useSuggestions'
import './composer.css'

export interface ComposerProps { draftKey: DraftKey; active: boolean; originViewId?: string | null }
export function Composer({ draftKey, active, originViewId = null }: ComposerProps) {
  const id = draftId(draftKey)
  const draft = useSessions(s => s.drafts[id]), loading = useSessions(s => s.draftLoading[id])
  const session = useSessions(s => draftKey.kind === 'session' ? s.summaries[draftKey.sessionId] : undefined)
  const providers = useSessions(s => s.providers), pending = useSessions(s => s.pending), errors = useSessions(s => s.errors)
  const cli = session?.cli ?? draft?.cli ?? null
  const catalog = useSessions(s => cli ? s.catalogs[`${draftKey.projectId}:${cli}`] : undefined)
  const model = session ? session.model : draft?.model ?? null
  const root = useRef<HTMLDivElement>(null), retryButton = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLTextAreaElement>(null), composing = useRef(false), justComposedAt = useRef(0)
  const [skills, setSkills] = useState<SkillCatalogResult | null>(null), [skillsLoading, setSkillsLoading] = useState(false)
  const skillRequest = useRef(0), catalogRequest = useRef(0), filesNote = useId()
  const [notice, setNotice] = useState<string | null>(null), [catalogLoading, setCatalogLoading] = useState(false)
  const text = draft?.text ?? '', provider = providers.find(p => p.cli === cli)
  const unavailable = draftKey.kind === 'new_chat' && provider?.status !== 'available'
  const running = session?.activity === 'running', needsInput = session?.activity === 'needs_input'
  const stopping = !!session?.stopping || !!(session && pending[`stop:${session.id}`])
  const busy = !!pending[id] || !!(session && (pending[`model:${session.id}`] || pending[`effort:${session.id}`]))
  const supportsRunningInput = running && !!provider && provider.capabilities.inputWhileRunning !== 'none'
  const fileReplyBlocked = replyBlockedByFiles(session, draft)
  const canSend = !!draft && !!text.trim() && !unavailable && (!running || !!supportsRunningInput) && !stopping && !busy && !fileReplyBlocked
  useEffect(() => { void useSessions.getState().loadDraft(draftKey) }, [id])
  useEffect(() => { if (cli) void useSessions.getState().loadModels(draftKey.projectId, cli) }, [cli, draftKey.projectId])
  useEffect(() => { if (active && draft) input.current?.focus() }, [id, active, !!draft])
  useEffect(() => {
    setNotice(null); setSkills(null); setSkillsLoading(false); setCatalogLoading(false)
    skillRequest.current++; catalogRequest.current++
    return () => { skillRequest.current++; catalogRequest.current++ }
  }, [id, cli])
  useLayoutEffect(() => {
    const node = input.current
    if (!node) return
    node.style.height = 'auto'
    const line = Number.parseFloat(getComputedStyle(node).lineHeight) || 20
    node.style.height = `${Math.min(line * 8, Math.max(line, node.scrollHeight))}px`
  }, [text])
  function openFiles() {
    const shell = useProjectShell.getState(), ui = shell.uiStates[draftKey.projectId]
    if (ui) shell.updateUiState(draftKey.projectId, selectRightArea(ui, 'files'))
  }
  async function loadSkills() {
    if (cli !== 'codex') return
    const request = ++skillRequest.current
    setSkillsLoading(true)
    try {
      const result = await sessionApi().getSkills({ cli, projectId: draftKey.projectId })
      if (request === skillRequest.current) setSkills(result)
    } catch (error) {
      if (request === skillRequest.current) setSkills({ skills: [], error: error instanceof Error ? error.message : String(error) })
    } finally { if (request === skillRequest.current) setSkillsLoading(false) }
  }
  async function retryCatalog() {
    if (!cli) return
    const request = ++catalogRequest.current, key = `${draftKey.projectId}:${cli}`, startedFocused = document.activeElement === retryButton.current
    setCatalogLoading(true)
    try {
      const result = await sessionApi().getModels({ projectId: draftKey.projectId, cli })
      if (request === catalogRequest.current) {
        const restoreFocus = !result.error && startedFocused && (document.activeElement === retryButton.current || document.activeElement === document.body)
        useSessions.setState(state => ({ catalogs: { ...state.catalogs, [key]: result } }))
        if (restoreFocus) requestAnimationFrame(() => {
          if (request === catalogRequest.current && !root.current?.closest('[hidden]')) root.current?.querySelector<HTMLButtonElement>('.composer__model-control > button')?.focus()
        })
      }
    } catch (error) {
      if (request === catalogRequest.current) useSessions.setState(state => ({ catalogs: { ...state.catalogs, [key]: { models: [], error: String(error) } } }))
    } finally { if (request === catalogRequest.current) setCatalogLoading(false) }
  }
  async function send() {
    if (!canSend) return
    const created = await useSessions.getState().sendComposer(draftKey, originViewId)
    if (created && draftKey.kind === 'new_chat') {
      const shell = useProjectShell.getState(), canvas = shell.uiStates[draftKey.projectId]?.mainCanvas
      if (draftKey.viewId) {
        if (canvas?.mode === 'view' && canvas.viewId === draftKey.viewId && canvas.conversation.kind === 'draft') shell.setViewConversation(draftKey.projectId, { kind: 'session', sessionId: created.id })
      } else shell.openSession(draftKey.projectId, created.id)
    }
  }
  function setModel(value: string | null) {
    if (session) void useSessions.getState().setModel(session.id, value)
    else useSessions.getState().updateDraft(draftKey, { model: value })
  }
  function setEffort(value: string | null) {
    if (session) void useSessions.getState().setReasoningEffort(session.id, value)
    else useSessions.getState().updateDraft(draftKey, { reasoningEffort: value })
  }
  function addSkill(skill: NonNullable<SkillCatalogResult>['skills'][number]) {
    const current = useSessions.getState().drafts[id]
    if (current && !current.contextItems.some(item => item.type === 'skill' && item.id === skill.id)) useSessions.getState().updateDraft(draftKey, { contextItems: [...current.contextItems, { type: 'skill', id: skill.id, name: skill.name }] })
  }
  const knownModels = catalog?.models.filter(item => !item.hidden || item.id === model) ?? []
  const nativeDefault = knownModels.find(item => item.isDefault)
  const selectedModel = knownModels.find(item => model ? item.id === model : item.isDefault)
  const reasoningEffort = session ? session.reasoningEffort ?? null : draft?.reasoningEffort ?? null
  const effortLevels = selectedModel?.reasoningEfforts ?? []
  const modelMissing = !!model && !!catalog && !catalog.error && !catalog.models.some(item => item.id === model)
  const effortMissing = !!reasoningEffort && !!catalog && !catalog.error && !effortLevels.includes(reasoningEffort)
  const modelLabel = model ? selectedModel?.displayName ?? model : nativeDefault ? `${nativeDefault.displayName}（默认）` : 'CLI 默认'
  const suggestions = useSuggestions({ draftKey, text, input, active, cli, skills, loadSkills, report: setNotice })
  const operationError = errors[id] || (session && (errors[`stop:${session.id}`] || errors[`effort:${session.id}`] || errors[`model:${session.id}`]))
  const status = unavailable ? provider?.reason ?? (!cli ? '请选择已安装并已登录的 CLI。' : '正在检查 CLI…')
    : fileReplyBlocked ? FILE_REPLY_BLOCKED : stopping ? '正在停止…' : needsInput ? '等待回复'
    : running ? supportsRunningInput ? '正在处理 · 可补充当前任务' : '运行中不可追加输入' : ''
  return <div className="composer" ref={root}>
    <div className="composer__box">
      {suggestions.popup}
      <textarea ref={input} {...suggestions.attributes} aria-label={needsInput ? '回复 Agent' : '消息'} placeholder={needsInput ? '回复 Agent…' : `向 ${cliName(cli)} 发送消息…`} value={text} maxLength={SESSION_MESSAGE_MAX_LENGTH} disabled={!!loading || !draft} rows={1}
        onChange={event => { useSessions.getState().updateDraft(draftKey, { text: event.target.value }); suggestions.updateCaret() }}
        onClick={suggestions.updateCaret} onSelect={suggestions.updateCaret} onBlur={suggestions.dismiss}
        onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false; justComposedAt.current = performance.now(); suggestions.updateCaret() }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229 || performance.now() - justComposedAt.current < 50) return
          if (suggestions.onKeyDown(event)) return
          if (event.key !== 'Enter' || event.shiftKey) return
          event.preventDefault(); if (canSend) void send()
        }} />
      {!!draft?.contextItems.length && <div className="composer__tags">{draft.contextItems.map((context, index) => <span className="composer__tag" key={`${context.type}:${index}`} title={context.type === 'file' || context.type === 'image' ? displayName(context.path) : undefined}>
        <Icon name={context.type === 'view' ? 'preview' : context.type === 'skill' ? 'terminal' : 'file'} size={12} /><span className="composer__tag-name">{context.type === 'view' ? `当前 View · ${VIEW_NAMES[context.viewId as ViewId] ?? context.viewId}` : context.type === 'skill' ? `Skill · ${context.name}` : `${context.type === 'image' ? '图片 · ' : ''}${displayName(context.path.split('/').at(-1) ?? context.path)}`}</span>
        <button aria-label={`移除上下文 ${context.type === 'view' ? context.viewId : context.type === 'skill' ? context.name : displayName(context.path)}`} onClick={() => useSessions.getState().updateDraft(draftKey, { contextItems: draft.contextItems.filter((_, itemIndex) => itemIndex !== index) })}><Icon name="close" size={10} /></button>
      </span>)}</div>}
      <div className="composer__toolbar">
        <ControlMenu key={`add:${id}:${cli}`} label="Context / Attachment" title="添加上下文" trigger={<Icon name="plus" size={15} />} className="composer__add-control" disabled={!draft} onOpen={() => { if (cli === 'codex') void loadSkills() }}>
          <div className="composer__menu-heading">Add</div>
          <div className="composer__menu-heading">文件</div>
          <button className="menu-item composer__add-item" aria-label="从 Files 添加文件" aria-describedby={filesNote} onClick={openFiles}><Icon name="files" /><span>从 Files 添加文件<small id={filesNote}>在 Files 中选择文件后点击「添加到对话」</small></span></button>
          {originViewId && !draft?.contextItems.some(item => item.type === 'view' && item.viewId === originViewId) && <><div className="composer__menu-heading">Project View</div><button className="menu-item" onClick={() => {
            const current = useSessions.getState().drafts[id]
            if (current) useSessions.getState().updateDraft(draftKey, { contextItems: [...current.contextItems, { type: 'view', viewId: originViewId }] })
          }}><Icon name="preview" />当前 View · {VIEW_NAMES[originViewId as ViewId] ?? originViewId}</button></>}
          <div className="composer__menu-heading">Skills</div>
          {cli !== 'codex' ? <p className="composer__menu-empty">当前 CLI 未提供 Skill 目录</p> : <>
            {skillsLoading && <p className="composer__menu-empty" role="status">正在读取…</p>}
            {skills?.error && <p className="composer__menu-empty" role="status">{skills.error}<button data-keep-open className="text-button" onClick={() => void loadSkills()}>重试</button></p>}
            {!skillsLoading && skills && !skills.skills.length && !skills.error && <p className="composer__menu-empty">当前 Project 没有可用 Skill</p>}
            {skills?.skills.map(skill => {
              const added = draft?.contextItems.some(item => item.type === 'skill' && item.id === skill.id)
              return <button className="menu-item composer__add-item" key={skill.id} title={skill.description} disabled={added} onClick={() => addSkill(skill)}><Icon name="terminal" /><span>{skill.name}{skill.description && <small>{skill.description}</small>}</span>{added && <small>已添加</small>}</button>
            })}
          </>}
          <div className="composer__menu-heading">Plugins</div><p className="composer__menu-empty">当前 CLI 未提供 Plugin 目录</p>
        </ControlMenu>
        <div className="composer__settings">
          <ControlMenu key={`model:${id}:${cli}`} label="Model Selector" title={modelLabel} className="composer__model-control" disabled={!cli || !catalog || !!catalog.error || catalogLoading || !!(session && pending[`model:${session.id}`])} trigger={<><span className="composer__model-name">{modelLabel}</span><Icon name="chevron" size={12} /></>}>
            <div className="composer__menu-heading">模型</div>
            <button className="menu-item" aria-pressed={model === null} onClick={() => setModel(null)}><span>{nativeDefault ? `${nativeDefault.displayName}（默认）` : 'CLI 默认'}</span>{model === null && <Icon name="check" size={13} />}</button>
            {knownModels.map(item => <button className="menu-item" key={item.id} aria-pressed={model === item.id} onClick={() => setModel(item.id)}><span>{item.displayName}</span>{model === item.id && <Icon name="check" size={13} />}</button>)}
            {model && !knownModels.some(item => item.id === model) && <button className="menu-item" aria-pressed onClick={() => setModel(model)}>{model}（目录未列出）<Icon name="check" size={13} /></button>}
          </ControlMenu>
          {cli === 'codex' && (effortLevels.length > 0 || reasoningEffort) && <ControlMenu key={`effort:${id}:${cli}`} label="Reasoning Effort" title={`思考强度 · ${reasoningEffort ?? '默认'}`} className="composer__effort-control" disabled={!catalog || !!catalog.error || catalogLoading || !!(session && (pending[`effort:${session.id}`] || pending[`model:${session.id}`]))} trigger={<EffortSignal effort={reasoningEffort} />}>
            <div className="composer__menu-heading">思考强度</div>
            {[null, ...effortLevels, ...(effortMissing ? [reasoningEffort] : [])].map(level => <button className="menu-item composer__effort-option" key={level ?? 'default'} aria-pressed={reasoningEffort === level} onClick={() => setEffort(level)}><EffortSignal effort={level} /><span>{level ?? '默认'}{level !== null && effortMissing && level === reasoningEffort ? '（目录未列出）' : ''}</span>{reasoningEffort === level && <Icon name="check" size={13} />}</button>)}
          </ControlMenu>}
        </div>
        {(running || needsInput) && <button className={`composer__send is-stop ${stopping ? 'is-busy' : ''}`} aria-label={stopping ? '停止中…' : 'Stop'} data-tip={stopping ? '停止中…' : '停止'} disabled={stopping} onClick={() => { if (session) void useSessions.getState().stop(session.id) }}>{stopping ? <span className="session-spinner session-spinner--inverse" aria-hidden="true" /> : <Icon name="stop" size={14} />}</button>}
        <button className={`composer__send ${busy ? 'is-busy' : ''}`} aria-label={busy ? '发送中…' : 'Send'} data-tip="Enter 发送 · Shift + Enter 换行" data-tip-align="end" disabled={!canSend} onClick={() => void send()}>{busy ? <span className="session-spinner session-spinner--inverse" aria-hidden="true" /> : <Icon name="arrow-up" size={14} />}</button>
      </div>
      {catalog?.error && <p className="composer__notice" role="status">模型目录不可用 · 可发送 <button ref={retryButton} className="text-button" disabled={catalogLoading} onClick={() => void retryCatalog()}>{catalogLoading ? '正在重试…' : '重试'}</button></p>}
      {modelMissing && <p className="composer__notice">模型目录未列出当前选择，发送时仍交由 CLI 处理。</p>}
      {effortMissing && <p className="composer__notice">“{reasoningEffort}”不在当前模型目录中。<button className="text-button" onClick={() => setEffort(null)}>使用默认</button></p>}
      {notice && <p className="composer__notice" role="status">{notice}</p>}
      {operationError && <p className="error-message" role="alert">{operationError}{errors[id] && <button className="text-button" disabled={!canSend} onClick={() => void send()}>重试发送</button>}</p>}
    </div>
    <div className="composer__status" role="status">{status}{unavailable && !cli && providers.filter(item => item.status === 'available').map(item => <button className="text-button" key={item.cli} onClick={() => useSessions.getState().updateDraft(draftKey, { cli: item.cli, model: null, reasoningEffort: null })}>{item.displayName}</button>)}</div>
  </div>
}
