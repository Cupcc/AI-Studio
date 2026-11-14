import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatDuration } from '@shared/session/presentation'
import type { SessionSummary } from '@shared/session/types'
import { Icon } from '../../app/Icon'
import { displayName } from '../../lib/display-path'
import { useProjectShell } from '../project/store'
import { AgentMarkdown, CodeBlock } from './Markdown'
import { useOpen } from './disclosure'
import { describeStep, groupLabel, liveLabel, pathParts, type StepView } from './steps'
import { ErrorCard, InputRequestCard, TurnDiffButton, UserMessage, resolutionText } from './Transcript'
import type { AgentItem, ProcessEntry, RequestItem, StepItem, TurnBlock } from './turns'

// One turn of the conversation (Shell Spec v02 §6): the process folds into a single line once the
// turn ends, so the reply is what a finished turn shows. Three text levels keep the parts apart:
// the reply in body size, commentary one step quieter, steps as single rows.

/** Project directories, to show paths relative to the project. */
const Roots = createContext<readonly string[]>([])
const COPIED_MS = 1600

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return <>{formatDuration(now - since)}</>
}

/** A live body follows its newest line until the reader scrolls up inside it. */
function useFollow(active: boolean, content: unknown) {
  const ref = useRef<HTMLDivElement>(null), pinned = useRef(true)
  useEffect(() => {
    const node = ref.current
    if (node && active && pinned.current) node.scrollTop = node.scrollHeight
  }, [active, content])
  return { ref, onScroll: () => { const node = ref.current; if (node) pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24 } }
}

function PathText({ path }: { path: { name: string; directory: string } }) {
  return <>{path.name}{path.directory && <span className="transcript-step__directory"> {path.directory}</span>}</>
}

function StepSummary({ view, label }: { view: StepView; label?: string }) {
  return <>
    {view.running ? <span className="session-spinner" role="img" aria-label="进行中" /> : <Icon name={view.icon} size={14} />}
    {(label ?? view.verb) && <span className="transcript-step__verb">{label ?? view.verb}</span>}
    {!label && view.target && <span className={view.target.code ? 'transcript-step__target is-code' : 'transcript-step__target'}>{view.target.path ? <PathText path={view.target.path} /> : view.target.text}</span>}
    {!label && view.preview && <span className="transcript-step__target">{view.preview}</span>}
  </>
}

function StepMeta({ view, children }: { view?: StepView; children?: ReactNode }) {
  return <span className="transcript-step__meta">
    {view?.additions !== undefined && <span className="transcript-diffstat__add">+{view.additions}</span>}
    {view?.deletions !== undefined && <span className="transcript-diffstat__del">−{view.deletions}</span>}
    {view?.problem && <span className="transcript-step__problem">{view.problem}</span>}
    {view?.duration && <span>{view.duration}</span>}
    {children}
  </span>
}

const CHANGE_LABELS: Record<string, string> = { add: '新建', delete: '删除', rename: '重命名', modify: '修改' }

function json(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? ''
}

function StepDetail({ item, view }: { item: StepItem; view: StepView }) {
  const tool = item.item, roots = useContext(Roots)
  const follow = useFollow(view.running, tool.text ?? tool.command?.output)
  if (tool.kind === 'reasoning' || tool.kind === 'plan') return <div className="transcript-step__detail transcript-step__thinking" {...follow}><AgentMarkdown text={tool.text ?? ''} /></div>
  if (tool.files?.length) return <div className="transcript-step__detail">
    {tool.files.map((file) => {
      const path = pathParts(file.path, roots)
      return <div className="transcript-step__file" key={file.path}>
        <p className="transcript-step__path"><PathText path={path} />{CHANGE_LABELS[file.change] && <span className="transcript-step__directory"> · {CHANGE_LABELS[file.change]}</span>}</p>
        {file.diff && <CodeBlock code={file.diff.replace(/\n$/, '')} language="diff" />}
        {file.diffTruncated && <p className="muted">只显示了开头的改动，完整内容见本轮变更。</p>}
      </div>
    })}
    {tool.error && <p className="error-message">{tool.error}</p>}
  </div>
  if (tool.command) return <div className="transcript-step__detail">
    <div className="transcript-step__output" {...follow}>
      <pre><span className="transcript-step__prompt">$ {tool.command.command}</span>{tool.command.output ? `\n${tool.command.output.replace(/\n$/, '')}` : ''}</pre>
    </div>
    {tool.command.cwd && <p className="muted">{displayName(tool.command.cwd)}</p>}
    {tool.error && tool.error !== tool.command.output && <p className="error-message">{tool.error}</p>}
  </div>
  return <div className="transcript-step__detail">
    {tool.tool?.input !== undefined && <><p className="transcript-step__label">参数</p><div className="transcript-step__output"><pre>{json(tool.tool.input)}</pre></div></>}
    {tool.tool?.result !== undefined && <><p className="transcript-step__label">结果</p><div className="transcript-step__output" aria-label="工具结果"><pre>{json(tool.tool.result)}</pre></div></>}
    {tool.tool === undefined && tool.text && <div className="transcript-step__output"><pre>{tool.text}</pre></div>}
    {tool.error && <p className="error-message">{tool.error}</p>}
  </div>
}

const Chevron = () => <span className="transcript-chevron"><Icon name="chevron-right" size={12} /></span>

const Step = memo(function Step({ item }: { item: StepItem }) {
  const view = describeStep(item, useContext(Roots))
  // Thinking and command output are worth watching while they stream; a finished step folds back.
  const [open, toggle] = useOpen(`step:${item.id}`, view.running && view.detail && (!!item.item.text?.trim() || !!item.item.command?.output))
  const className = `transcript-step${view.failed ? ' is-failed' : ''}`
  if (!view.detail) return <div className={className} data-transcript-id={item.id}><StepSummary view={view} /><StepMeta view={view} /></div>
  return <>
    <button type="button" className={className} data-transcript-id={item.id} aria-expanded={open} onClick={toggle}><StepSummary view={view} /><StepMeta view={view}><Chevron /></StepMeta></button>
    {open && <StepDetail item={item} view={view} />}
  </>
})

function StepGroup({ id, items }: { id: string; items: StepItem[] }) {
  const roots = useContext(Roots)
  const [open, toggle] = useOpen(`group:${id}`, false)
  const views = items.map((item) => describeStep(item, roots))
  const view: StepView = { ...views[0]!, icon: views.every((each) => each.icon === 'search') ? 'search' : 'file', running: views.some((each) => each.running), failed: false }
  return <>
    <button type="button" className="transcript-step" aria-expanded={open} onClick={toggle}><StepSummary view={view} label={groupLabel(items)} /><StepMeta><Chevron /></StepMeta></button>
    {open && <div className="transcript-step__group">{items.map((item) => <Step key={item.id} item={item} />)}</div>}
  </>
}

/** An answered request is part of what happened; the card itself opens from its row. */
function ResolvedRequest({ item }: { item: RequestItem }) {
  const [open, toggle] = useOpen(`request:${item.id}`, false)
  const { request, resolution } = item
  const title = request.kind === 'approval' ? request.title : request.title ?? request.questions[0]?.prompt ?? ''
  return <>
    <button type="button" className="transcript-step" data-transcript-id={item.id} aria-expanded={open} onClick={toggle}>
      <Icon name={resolution?.status === 'cancelled' ? 'close' : 'check'} size={14} />
      <span className="transcript-step__verb">{request.kind === 'approval' ? '确认' : '提问'}</span>
      <span className="transcript-step__target">{title}</span>
      <StepMeta><span className="request-card__resolution">{resolutionText(request, resolution!, item.redacted)}</span><Chevron /></StepMeta>
    </button>
    {open && <div className="transcript-step__detail"><InputRequestCard item={item} /></div>}
  </>
}

function Entry({ entry }: { entry: ProcessEntry }) {
  if (entry.type === 'step') return <Step item={entry.item} />
  if (entry.type === 'group') return <StepGroup id={entry.key} items={entry.items} />
  if (entry.type === 'request') return <ResolvedRequest item={entry.item} />
  return <div className="transcript-commentary" data-transcript-id={entry.item.id}><AgentMarkdown text={entry.item.text} /></div>
}

function runningStep(entries: readonly ProcessEntry[]): StepItem | undefined {
  return entries.flatMap((entry) => entry.type === 'step' ? [entry.item] : entry.type === 'group' ? entry.items : []).findLast((item) => item.item.status === 'in_progress')
}

function ProcessHeader({ block, summary, live, open, toggle }: { block: TurnBlock; summary: SessionSummary | undefined; live: boolean; open: boolean; toggle: () => void }) {
  const roots = useContext(Roots)
  const steps = block.steps ? ` · ${block.steps} 步` : ''
  let content: ReactNode
  if (live) {
    const waiting = summary?.activity === 'needs_input' && !summary.stopping
    const step = runningStep(block.entries)
    const label = summary?.stopping ? '正在停止' : waiting ? (block.pending[0]?.request.kind === 'question' ? '等待你的回答' : '等待你的确认')
      : step ? liveLabel(step, roots) : block.answers.some((answer) => !answer.complete) ? '正在回复' : '正在处理'
    content = <>{waiting ? <span className="attention-dot attention-dot--needs_input" /> : <span className="session-spinner" role="img" aria-label="运行中" />}<span className="transcript-process__label">{label}</span><span>· <Elapsed since={block.startedAt} /></span></>
  } else if (block.end) content = <span>{block.end.outcome === 'completed' ? '已处理' : '已停止 ·'} <strong>{formatDuration(block.end.durationMs)}</strong>{steps}</span>
  else if (block.steps) content = <span>{block.errors.length ? '已中断' : '已处理'}{steps}</span>
  else return null
  if (!block.entries.length) return <p className="transcript-process__toggle">{content}</p>
  return <button type="button" className="transcript-process__toggle" aria-expanded={open} onClick={toggle}>{content}<Chevron /></button>
}

function CopyAnswer({ answers }: { answers: AgentItem[] }) {
  const [copied, setCopied] = useState(false), timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return <button type="button" className="transcript-action" aria-label="复制回答" data-tip={copied ? '已复制' : '复制'} onClick={() => {
    void navigator.clipboard.writeText(answers.map((answer) => answer.text).join('\n\n')).then(() => {
      clearTimeout(timer.current)
      setCopied(true)
      timer.current = setTimeout(() => setCopied(false), COPIED_MS)
    }, () => {})
  }}><Icon name={copied ? 'check' : 'copy'} size={14} /><span className="sr-only" role="status">{copied ? '已复制' : ''}</span></button>
}

export function TurnView({ block, summary, live }: { block: TurnBlock; summary: SessionSummary | undefined; live: boolean }) {
  const project = useProjectShell((state) => summary ? state.projects[summary.projectId] : undefined)
  const roots = useMemo(() => project ? [project.localPath, project.canonicalPath] : [], [project])
  // Open while the agent works, folded once the turn is over; the user's own toggle outlasts both.
  const [open, toggle] = useOpen(`turn:${block.key}`, live)
  return <Roots.Provider value={roots}>
    <section className="transcript-turn" data-live={live || undefined}>
      {block.user && <UserMessage item={block.user} />}
      <ProcessHeader block={block} summary={summary} live={live} open={open} toggle={toggle} />
      {open && block.entries.length > 0 && <div className="transcript-process">{block.entries.map((entry) => <Entry key={entry.type === 'group' ? `group:${entry.key}` : entry.item.id} entry={entry} />)}</div>}
      {block.pending.map((item) => <div key={item.id} data-transcript-id={item.id}><InputRequestCard item={item} /></div>)}
      {block.answers.map((item) => <article key={item.id} className="transcript-agent" data-transcript-id={item.id}><AgentMarkdown text={item.text} />{!item.complete && <span className="sr-only">正在输出</span>}</article>)}
      {block.errors.map((item) => <ErrorCard key={item.id} item={item} />)}
      {block.end && <div className="transcript-turn-end" data-outcome={block.end.outcome} data-transcript-id={block.end.id}>
        {block.answers.length > 0 && <CopyAnswer answers={block.answers} />}
        <TurnDiffButton item={block.end} />
      </div>}
    </section>
  </Roots.Provider>
}
