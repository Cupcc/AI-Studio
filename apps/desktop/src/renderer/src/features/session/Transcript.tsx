import { displayName } from '../../lib/display-path'
import { useEffect, useState } from 'react'
import type { InputRequest, InputResolution, InputResponse, TranscriptItem } from '@shared/session/types'
import { formatWorkedFor } from '@shared/session/presentation'
import { AgentMarkdown } from './Markdown'
import { useSessions } from './store'
import { shellIntegration } from '../project/integration'

function TurnDiffButton({ item }: { item: TranscriptItem }) {
  const projectId = useSessions(state => state.summaries[item.sessionId]?.projectId)
  if (!projectId || !item.turnId) return null
  return <button className="transcript-diff-link" onClick={() => shellIntegration().openTurnDiff?.({ projectId, sessionId: item.sessionId, turnId: item.turnId! })}>查看本轮变更</button>
}

function resolutionText(request: InputRequest, resolution: InputResolution, redacted?: boolean): string {
  if (resolution.status === 'declined_with_text' || (resolution.status === 'answered' && resolution.viaText)) return '已在输入框回复'
  if (resolution.status === 'cancelled') return resolution.reason === 'turn_stopping' || resolution.reason === 'disposed' ? '已停止' : '已失效'
  if (redacted) return '已答复（私密内容不保存）'
  const response = resolution.response
  if (request.kind === 'approval' && response.kind === 'approval') return `已选择：${request.options.find((option) => option.id === response.optionId)?.label ?? response.optionId}`
  if (request.kind === 'question' && response.kind === 'answers') return `已答复：${request.questions.map((question) => {
    if (question.secret) return '••••••'
    const answer = response.answers[question.id]
    return [answer?.optionIds?.map((id) => question.options.find((option) => option.id === id)?.label ?? id).join('、'), answer?.text].filter(Boolean).join('；')
  }).filter(Boolean).join(' · ')}`
  return '已答复'
}

export function InputRequestCard({ item }: { item: Extract<TranscriptItem, { kind: 'input_request' }> }) {
  const { request, resolution } = item
  const [answers, setAnswers] = useState<Record<string, { optionIds?: string[]; text?: string }>>({})
  const [message, setMessage] = useState('')
  const summary = useSessions((s) => s.summaries[item.sessionId]), pending = useSessions((s) => s.pending[`answer:${request.requestId}`]), error = useSessions((s) => s.errors[`answer:${request.requestId}`])
  const readOnly = !!resolution || !!summary?.stopping || summary?.activity !== 'needs_input'
  useEffect(() => { if (resolution) { setAnswers({}); setMessage('') } }, [resolution])
  const answer = (response: InputResponse) => { void useSessions.getState().answer(item.sessionId, request.requestId, response) }
  const primaryId = request.kind === 'approval' ? (request.options.find((option) => option.primary) ?? request.options[0])?.id : undefined
  const canAnswer = request.kind === 'question' && request.questions.every((question) => {
    const current = answers[question.id]
    return !!current?.optionIds?.length || (question.allowFreeText && !!current?.text?.trim())
  })
  return <section className={`request-card ${resolution ? 'request-card--resolved' : ''}`} aria-label={request.kind === 'approval' ? '等待你的确认' : '等待你的回答'}>
    <h3>{!resolution && <span className="attention-dot attention-dot--needs_input" />}{request.kind === 'approval' ? '等待你的确认' : '等待你的回答'}</h3>
    {request.kind === 'approval' ? <>
      <p className="request-card__title">{request.title}</p>
      {request.description && <p>{request.description}</p>}
      {request.command && <pre>{request.command}</pre>}
      {request.cwd && <p className="muted">{request.cwd}</p>}
      {request.paths?.length && <ul>{request.paths.map((path) => <li key={path}><code>{path}</code></li>)}</ul>}
      {request.toolName && <p><code>{request.toolName}</code></p>}
      {request.toolInput !== undefined && <details><summary>工具参数</summary><pre>{JSON.stringify(request.toolInput, null, 2)}</pre></details>}
      {!resolution && <>
        {request.allowsMessage && <input aria-label="决定说明（可选）" placeholder="说明（可选）" value={message} disabled={readOnly || pending} onChange={(event) => setMessage(event.target.value)} />}
        <div className="request-card__actions">{request.options.map((option) => <button key={option.id} className={option.id === primaryId ? 'primary-button' : 'secondary-button'} title={option.description} disabled={readOnly || pending} onClick={() => answer({ kind: 'approval', optionId: option.id, ...(message.trim() ? { message } : {}) })}>{option.label}</button>)}<span className="request-card__hint muted">也可以在下方直接回复</span></div>
      </>}
    </> : <>
      {request.title && <p className="request-card__title">{request.title}</p>}
      {request.questions.map((question) => <fieldset key={question.id} disabled={readOnly || pending}>
        <legend>{question.header && <strong>{question.header} · </strong>}{question.prompt}</legend>
        {!resolution && <>
          {question.options.map((option) => <label className="question-option" key={option.id}>
            <input type={question.multiSelect ? 'checkbox' : 'radio'} name={`${request.requestId}:${question.id}`} checked={answers[question.id]?.optionIds?.includes(option.id) ?? false} onChange={(event) => {
              setAnswers((previous) => ({ ...previous, [question.id]: { ...previous[question.id], optionIds: question.multiSelect ? (event.target.checked ? [...(previous[question.id]?.optionIds ?? []), option.id] : previous[question.id]?.optionIds?.filter((id) => id !== option.id) ?? []) : [option.id], ...(question.multiSelect ? {} : { text: '' }) } }))
            }} /><span>{option.label}{option.description && <small>{option.description}</small>}</span>
          </label>)}
          {question.allowFreeText && <input type={question.secret ? 'password' : 'text'} autoComplete="off" aria-label={question.prompt} placeholder="输入回答" value={answers[question.id]?.text ?? ''} onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: { text: event.target.value, optionIds: [] } }))} />}
          {question.secret && <p className="muted">私密回答不会保存到对话记录。</p>}
        </>}
      </fieldset>)}
      {!resolution && <div className="request-card__actions"><button className="primary-button" disabled={readOnly || pending || !canAnswer} onClick={() => answer({ kind: 'answers', answers })}>提交回答</button><span className="request-card__hint muted">也可以在下方直接回复</span></div>}
    </>}
    {resolution && <p className="request-card__resolution">{resolutionText(request, resolution, item.redacted)}</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </section>
}

export function Transcript({ item }: { item: TranscriptItem }) {
  if (item.kind === 'user_message') return <article className="transcript-user" data-transcript-id={item.id}>
    {item.viewContextAttached && <details className="transcript-user__context"><summary>当前 View</summary><ul>{item.viewContextPaths?.map(path => <li key={path}><code>{path}</code></li>)}</ul></details>}
    {item.contextItems.length > 0 && <div className="transcript-user__context">{item.contextItems.filter(context => context.type !== 'view' || !item.viewContextAttached).map((context, index) => <span key={index}>{context.type === 'view' ? context.viewId : displayName(context.path)}</span>)}</div>}
    <p>{item.redacted ? '••••••（私密回复不保存）' : item.text}</p>
  </article>
  if (item.kind === 'agent_message') return <article className="transcript-agent" data-transcript-id={item.id}><AgentMarkdown text={item.text} />{!item.complete && <span className="sr-only">正在输出</span>}</article>
  if (item.kind === 'tool_activity') {
    const tool = item.item
    const label = tool.activity?.label ?? tool.command?.command ?? tool.tool?.name ?? tool.text ?? tool.nativeType ?? '工具活动'
    return <details className="transcript-tool" data-transcript-id={item.id}>
      <summary>{tool.status === 'in_progress' ? <span className="session-spinner" aria-label="工具运行中" /> : <span aria-hidden="true">{tool.status === 'completed' ? '✓' : tool.status === 'failed' ? '!' : '—'}</span>}<span>{label}</span></summary>
      {tool.command?.cwd && <p className="muted">{tool.command.cwd}</p>}
      {tool.command?.output && <pre>{tool.command.output}</pre>}
      {tool.files?.map((file) => <p key={file.path}>{file.change} · {file.path}</p>)}
      {tool.text && tool.text !== label && <pre>{tool.text}</pre>}
      {tool.tool?.input !== undefined && <pre>{JSON.stringify(tool.tool.input, null, 2)}</pre>}
      {tool.error && <p className="error-message">{tool.error}</p>}
    </details>
  }
  if (item.kind === 'input_request') return <div data-transcript-id={item.id}><InputRequestCard item={item} /></div>
  if (item.kind === 'turn_end') return <div className="transcript-turn-end" data-transcript-id={item.id}><span>Worked for {formatWorkedFor(item.durationMs)} · {item.outcome === 'completed' ? 'Done' : '已停止'}</span><TurnDiffButton item={item} /></div>
  return <ErrorCard item={item} />
}

function ErrorCard({ item }: { item: Extract<TranscriptItem, { kind: 'error' }> }) {
  const summary = useSessions((s) => s.summaries[item.sessionId]), pending = useSessions((s) => s.pending[`retry:${item.sessionId}`]), error = useSessions((s) => s.errors[`retry:${item.sessionId}`])
  const [details, setDetails] = useState(false)
  return <section className="transcript-error" aria-label="执行错误" data-transcript-id={item.id}>
    <h3><span className="attention-dot attention-dot--error" />{item.summary}</h3>
    {details && <pre>{item.details}</pre>}
    <div className="request-card__actions">
      {item.retryable && <button className="primary-button" disabled={pending || summary?.activity !== 'none' || summary?.stopping} onClick={() => void useSessions.getState().retry(item.sessionId)}>{pending ? '重试中…' : '重试'}</button>}
      <button className="secondary-button" aria-expanded={details} onClick={() => setDetails(!details)}>{details ? '收起详情' : '查看详情'}</button>
      <TurnDiffButton item={item} />
    </div>
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>
}
