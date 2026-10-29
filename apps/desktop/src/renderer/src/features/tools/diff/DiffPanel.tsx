import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import type { DiffAvailability, DiffFileEntry, DiffSnapshot } from '@shared/tools/diff'
import { Icon } from '../../../app/Icon'
import { baselineLabel, totals } from './diff-format'
import { LIST_RATIO, useDiff, type ProjectDiff } from './diff-store'
import { FileDiffView } from './FileDiffView'
import { FileList } from './FileList'
import { InlineText } from './InlineText'
import { AVAILABILITY, D, type StateMessage } from './strings'
import './diff.css'
import { useTurnDiff } from './turn-diff-store'
import { useDiffViewPrefs } from './diff-view-prefs'
import { TurnDiffPanel } from './TurnDiffPanel'

export interface DiffPanelProps {
  projectId: string
  /** The panel is visible: only then are there queries, a subscription and a code viewer. */
  active: boolean
  /** Accepted for parity with Terminal / Browser (native views); the Diff panel is plain DOM and ignores it. */
  overlayBlocked?: boolean
}

/** These statuses describe the working tree; every other status is a failure shown as a message. */
const DESCRIBES_TREE: ReadonlySet<DiffAvailability> = new Set<DiffAvailability>(['ready', 'clean', 'no_head'])

function Message({ message, detail, onRetry }: { message: StateMessage; detail?: string | null; onRetry?: () => void }) {
  return <div className="diff-state" role="status">
    <Icon name="diff" size={28} />
    <h3>{message.title}</h3>
    {message.body.map(line => <p key={line}><InlineText text={line} /></p>)}
    {detail && <p className="diff-state__detail"><span className="muted">{D.detailLabel}</span><code>{detail}</code></p>}
    {onRetry && <button className="secondary-button" onClick={onRetry}>{D.retry}</button>}
  </div>
}

function Splitter({ ratio, container, onPreview, onCommit }: {
  ratio: number; container: RefObject<HTMLDivElement | null>; onPreview(ratio: number | null): void; onCommit(ratio: number): void
}) {
  const clamp = (value: number) => Math.max(LIST_RATIO.min, Math.min(LIST_RATIO.max, value))
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    onCommit(clamp(ratio + (event.key === 'ArrowDown' ? 0.05 : -0.05)))
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = container.current?.getBoundingClientRect()
    if (!bounds || bounds.height <= 0) return
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture?.(event.pointerId)
    let next = ratio
    const move = (moved: globalThis.PointerEvent) => { next = clamp((moved.clientY - bounds.top) / bounds.height); onPreview(next) }
    const stop = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', finish); target.removeEventListener('pointercancel', cancel) }
    const finish = () => { stop(); onCommit(next); onPreview(null) }
    const cancel = () => { stop(); onPreview(null) }
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', finish); target.addEventListener('pointercancel', cancel)
  }
  return <div className="diff-splitter" role="separator" aria-orientation="horizontal" aria-label={D.splitterLabel} tabIndex={0}
    aria-valuenow={Math.round(ratio * 100)} aria-valuemin={Math.round(LIST_RATIO.min * 100)} aria-valuemax={Math.round(LIST_RATIO.max * 100)}
    onKeyDown={onKeyDown} onPointerDown={onPointerDown} />
}

function Changes({ projectId, active, project, snapshot }: { projectId: string; active: boolean; project: ProjectDiff; snapshot: DiffSnapshot }) {
  const container = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const select = useCallback((entry: DiffFileEntry) => useDiff.getState().select(projectId, entry), [projectId])
  const { selected } = project
  const ratio = preview ?? project.listRatio
  const entry = selected ? snapshot.files.find(file => file.path === selected.path) ?? null : null
  const tree = useDiffViewPrefs(state => state.tree)
  return <div className="diff-split" ref={container}>
    <div className="diff-split__list" style={selected ? { flex: `0 1 ${ratio * 100}%` } : undefined}>
      <FileList files={snapshot.files} tree={tree} selectedPath={selected?.path ?? null} showUntracked={snapshot.status !== 'no_head'} stale={project.error !== null} onSelect={select} />
      {!selected && <p className="diff-hint">{D.selectHint}</p>}
    </div>
    {selected && <>
      <Splitter ratio={ratio} container={container} onPreview={setPreview} onCommit={value => useDiff.getState().setListRatio(projectId, value)} />
      <FileDiffView projectId={projectId} active={active} path={selected.path} entry={entry} file={project.file}
        onClose={() => useDiff.getState().select(projectId, null)} onRetry={() => useDiff.getState().retryFile(projectId)} />
    </>}
  </div>
}

function Notices({ projectId, project, snapshot }: { projectId: string; project: ProjectDiff; snapshot: DiffSnapshot | null }) {
  const describes = snapshot !== null && DESCRIBES_TREE.has(snapshot.status)
  return <>
    {/* Without a snapshot the failure is the whole body (see Body), so it is not repeated here. */}
    {project.error && snapshot && <div className="diff-banner diff-banner--error" role="alert">
      <span>{D.loadFailed(project.error)}{describes && ` ${D.staleResult}`}</span>
      <button className="secondary-button button--small" onClick={() => useDiff.getState().reload(projectId)}>{D.retry}</button>
    </div>}
    {snapshot && describes && snapshot.repoPrefix !== '' && <div className="diff-banner" role="status"><span><InlineText text={D.repoPrefix(snapshot.repoPrefix)} /></span></div>}
    {snapshot && !snapshot.settled && <div className="diff-banner diff-banner--warn" role="status">{D.unsettled}</div>}
    {snapshot && snapshot.truncated && snapshot.files.length > 0 && <div className="diff-banner diff-banner--warn" role="status">{D.truncated(snapshot.files.length)}</div>}
    {project.clearedPath !== null && <div className="diff-banner" role="status">
      <span><InlineText text={D.selectionCleared(project.clearedPath)} /></span>
      <button className="secondary-button button--small" onClick={() => useDiff.getState().clearNotice(projectId)}>{D.dismiss}</button>
    </div>}
  </>
}

function Body({ projectId, active, project }: { projectId: string; active: boolean; project: ProjectDiff | undefined }) {
  const retry = () => useDiff.getState().reload(projectId)
  const snapshot = project?.snapshot ?? null
  if (!project || !snapshot) {
    if (project?.error) return <div className="diff-state" role="alert"><Icon name="diff" size={28} /><h3>{D.loadFailed(project.error)}</h3><button className="secondary-button" onClick={retry}>{D.retry}</button></div>
    return <div className="diff-state" role="status"><p className="muted">{active ? D.loading : D.inactive}</p></div>
  }
  const { status, files } = snapshot
  if (status === 'clean' || (status === 'ready' && files.length === 0 && !snapshot.truncated)) return <Message message={AVAILABILITY.clean} />
  if (status === 'no_head' && files.length === 0) return <Message message={D.noHeadEmpty} />
  if (status === 'ready' || status === 'no_head') return <>
    {status === 'no_head' && <div className="diff-banner diff-banner--warn diff-banner--block" role="status">
      <strong>{AVAILABILITY.no_head.title}</strong>
      {AVAILABILITY.no_head.body.map(line => <span key={line}>{line}</span>)}
    </div>}
    <Changes projectId={projectId} active={active} project={project} snapshot={snapshot} />
  </>
  return <Message message={AVAILABILITY[status]} detail={snapshot.detail} onRetry={retry} />
}

function ProjectDiffPanel({ projectId, active }: DiffPanelProps) {
  const project = useDiff(s => s.projects[projectId])
  // Subscribe and query only while visible; hiding (or a tool switch) releases the subscription.
  useEffect(() => (active ? useDiff.getState().activate(projectId) : undefined), [projectId, active])
  // The service also watches files; coming back to the window re-queries as a fallback.
  useEffect(() => {
    if (!active) return undefined
    const onFocus = () => useDiff.getState().refresh(projectId)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [projectId, active])
  const snapshot = project?.snapshot ?? null
  const describes = snapshot === null || DESCRIBES_TREE.has(snapshot.status)
  const complete = snapshot !== null && !snapshot.truncated && snapshot.status === 'ready' && snapshot.files.length > 0
  const sums = complete ? totals(snapshot.files) : null
  const title = describes ? `${D.title} · ${baselineLabel(snapshot)}` : D.title
  const watchDown = project?.watch === 'degraded' || project?.watch === 'stopped'
  const tree = useDiffViewPrefs(state => state.tree)
  return <section className="diff-tool" aria-label={D.title}>
    <header className="diff-header">
      <div className="diff-header__row">
        <h2 className="diff-header__title" title={title}>{title}</h2>
        <button className="icon-button" aria-label={tree ? D.listView : D.treeView} data-tip={tree ? D.listView : D.treeView} onClick={() => useDiffViewPrefs.getState().set({ tree: !tree })}><Icon name={tree ? 'view-list' : 'view-tree'} size={15} /></button>
        <button className={`icon-button ${project?.loading ? 'is-loading' : ''}`} aria-label={D.refresh} data-tip={D.refresh} data-tip-align="end" disabled={!active} onClick={() => useDiff.getState().reload(projectId)}><Icon name="refresh" size={15} /></button>
      </div>
      {(snapshot && describes && snapshot.files.length > 0 || watchDown || project?.loading) && <div className="diff-header__meta">
        {snapshot && describes && snapshot.files.length > 0 && <span>{snapshot.truncated ? D.fileCountTruncated(snapshot.files.length) : D.fileCount(snapshot.files.length)}</span>}
        {sums && <span className="diff-header__sums"><span className="diff-count diff-count--add">{D.additions(sums.additions)}</span><span className="diff-count diff-count--del">{D.deletions(sums.deletions)}</span></span>}
        {watchDown && <span className="diff-watch" role="status" title={D.watchUnavailableTip}>{D.watchUnavailable}</span>}
        {project?.loading && <span role="status">{D.refreshing}</span>}
      </div>}
    </header>
    {project && <Notices projectId={projectId} project={project} snapshot={snapshot} />}
    <div className="diff-body" aria-busy={project?.loading ?? false}>
      <Body projectId={projectId} active={active} project={project} />
    </div>
  </section>
}

export function DiffPanel(props: DiffPanelProps) {
  const source = useTurnDiff(state => state.sources[props.projectId])
  return source ? <TurnDiffPanel source={source} active={props.active} /> : <ProjectDiffPanel {...props} />
}

export default DiffPanel
