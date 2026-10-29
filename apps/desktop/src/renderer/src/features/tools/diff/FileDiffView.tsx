import { displayName } from '../../../lib/display-path'
import { Component, Suspense, useMemo, type ReactNode } from 'react'
import type { DiffFileEntry, DiffFileResult } from '@shared/tools/diff'
import { Icon } from '../../../app/Icon'
import { LazyCodeDiffViewer } from '../code/lazy'
import { classifyPatch, isModeOnly, omissionNotes, splitPath, twoSidedTexts } from './diff-format'
import type { DiffFileState } from './diff-store'
import { InlineText } from './InlineText'
import { useDiffViewPrefs } from './diff-view-prefs'
import { showTool } from '../show-tool'
import { useFiles } from '../files/files-store'
import { AVAILABILITY, D, KIND_LABEL, KIND_LETTER } from './strings'

/** The stored patch is bounded by the service (1 MiB); this bounds what is turned into elements. */
export const MAX_PATCH_LINES = 4000

type OkResult = Extract<DiffFileResult, { status: 'ok' }>

export function PatchView({ text, truncated }: { text: string; truncated: boolean }) {
  const { lines, kinds, hidden } = useMemo(() => {
    const all = text.split('\n')
    if (all.at(-1) === '') all.pop()
    const shown = all.slice(0, MAX_PATCH_LINES)
    return { lines: shown, kinds: classifyPatch(shown), hidden: all.length - shown.length }
  }, [text])
  return <div className="diff-patch-wrap">
    {truncated && <p className="diff-note diff-note--warn" role="status">{D.patchTruncated}</p>}
    <pre className="diff-patch" tabIndex={0} aria-label={D.patchLabel}>
      {lines.map((line, index) => <span key={index} className={`diff-patch__line diff-patch__line--${kinds[index]}`}>{line}{'\n'}</span>)}
    </pre>
    {hidden > 0 && <p className="diff-note" role="status">{D.patchLinesHidden(hidden)}</p>}
  </div>
}

/** A viewer that cannot load (its chunk is missing) falls back to the stored patch instead of taking the panel down. */
class ViewerBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override render() {
    return this.state.failed
      ? <>{<p className="diff-note diff-note--warn" role="alert">{D.viewerFailed}</p>}{this.props.fallback}</>
      : this.props.children
  }
}

function PatchOrEmpty({ patch }: { patch: OkResult['patch'] }) {
  return patch && patch.text ? <PatchView text={patch.text} truncated={patch.truncated} /> : <p className="diff-note" role="status">{D.noContent}</p>
}

function OkView({ projectId, active, result }: { projectId: string; active: boolean; result: OkResult }) {
  const { entry, original, modified, patch } = result
  const prefs = useDiffViewPrefs()
  const sides = twoSidedTexts(entry, original, modified)
  const notes = omissionNotes(entry, original, modified)
  const modeChange = entry.oldMode !== null && entry.newMode !== null && entry.oldMode !== entry.newMode
  const unchanged = sides !== null && sides.original === sides.modified
  return <>
    {!result.settled && <p className="diff-note diff-note--warn" role="status">{D.fileUnsettled}</p>}
    {entry.kind === 'conflicted' && <p className="diff-note diff-note--warn">{D.fileConflicted}</p>}
    {modeChange && <p className="diff-note">{D.modeChange(entry.oldMode!, entry.newMode!)}</p>}
    {notes.map(note => <p className="diff-note" key={note}>{note}</p>)}
    {sides === null ? <PatchOrEmpty patch={patch} />
      : unchanged ? <p className="diff-note" role="status">{isModeOnly(entry) ? D.modeOnly : D.contentUnchanged}</p>
      : !active ? <p className="diff-note" role="status">{D.viewerInactive}</p>
      : <div className="diff-viewer">
        <ViewerBoundary key={entry.path} fallback={<PatchOrEmpty patch={patch} />}>
          <Suspense fallback={<div className="diff-note" role="status">{D.viewerLoading}</div>}>
            <LazyCodeDiffViewer path={entry.path} original={sides.original} modified={sides.modified} active={active} viewStateKey={`${projectId}:${entry.path}`}
              sideBySide={prefs.sideBySide} hideUnchanged={prefs.hideUnchanged} {...(prefs.navigate ? { navigate: prefs.navigate } : {})} />
          </Suspense>
        </ViewerBoundary>
      </div>}
  </>
}

export interface FileDiffViewProps {
  projectId: string
  active: boolean
  path: string
  /** The entry of the current list, used until (and instead of) the result's own. */
  entry: DiffFileEntry | null
  file: DiffFileState
  onClose(): void
  onRetry(): void
}

/** The single-file diff under the list. Content is only shown for the selected path and never survives an error. */
export function FileDiffView({ projectId, active, path, entry, file, onClose, onRetry }: FileDiffViewProps) {
  const result = file.path === path ? file.result : null
  const shown = result?.status === 'ok' ? result.entry : entry
  const { name, dir } = splitPath(path)
  const refreshing = file.loading && result !== null
  const prefs = useDiffViewPrefs()
  const twoSided = result?.status === 'ok' && twoSidedTexts(result.entry, result.original, result.modified) !== null
  const exists = shown?.kind !== 'deleted'
  return <section className="diff-file" aria-label={D.fileTitle(path)} aria-busy={file.loading}
    onKeyDown={event => { if (twoSided && event.altKey && event.key === 'F5') { event.preventDefault(); prefs.go(event.shiftKey ? 'previous' : 'next') } }}>
    <header className="diff-file__header">
      {shown && <span className={`diff-badge diff-badge--${shown.kind}`} title={KIND_LABEL[shown.kind]} aria-hidden="true">{KIND_LETTER[shown.kind]}</span>}
      <span className="diff-file__path" title={displayName(path)}><span className="diff-row__name">{displayName(name)}</span>{dir && <span className="diff-row__dir">{displayName(dir)}</span>}</span>
      {refreshing && <span className="diff-file__busy" role="status">{D.refreshing}</span>}
      {twoSided && <span className="diff-file__tools" role="toolbar" aria-label={D.viewTools}>
        <button className="icon-button" aria-label={D.previousChange} data-tip={`${D.previousChange} ⇧⌥F5`} onClick={() => prefs.go('previous')}><Icon name="chevron-up" size={14} /></button>
        <button className="icon-button" aria-label={D.nextChange} data-tip={`${D.nextChange} ⌥F5`} onClick={() => prefs.go('next')}><Icon name="chevron" size={14} /></button>
        <button className={`icon-button ${prefs.sideBySide ? '' : 'is-selected'}`} aria-label={D.inline} aria-pressed={!prefs.sideBySide} data-tip={D.inline} onClick={() => prefs.set({ sideBySide: !prefs.sideBySide })}><Icon name="split" size={14} /></button>
        <button className={`icon-button ${prefs.hideUnchanged ? 'is-selected' : ''}`} aria-label={D.hideUnchanged} aria-pressed={prefs.hideUnchanged} data-tip={D.hideUnchanged} onClick={() => prefs.set({ hideUnchanged: !prefs.hideUnchanged })}><Icon name="collapse" size={14} /></button>
      </span>}
      {exists && <button className="icon-button" aria-label={D.openFile} data-tip={D.openFile} onClick={() => { showTool(projectId, 'files'); void useFiles.getState().open(projectId, path, { pin: true }) }}><Icon name="file" size={14} /></button>}
      <button className="icon-button" aria-label={D.closeFile} data-tip={D.closeFile} data-tip-align="end" onClick={onClose}><Icon name="close" size={14} /></button>
    </header>
    <div className={`diff-file__body ${refreshing ? 'is-refreshing' : ''}`}>
      {file.error ? <div className="diff-note diff-note--error" role="alert">
        <p>{D.fileLoadFailed(file.error)}</p>
        <button className="secondary-button button--small" onClick={onRetry}>{D.retry}</button>
      </div>
        : !result ? <p className="diff-note" role="status">{D.fileLoading}</p>
        : result.status === 'unchanged' ? <div className="diff-note" role="status"><p>{D.fileUnchanged}</p><p className="muted">{D.fileUnchangedHint}</p></div>
        : result.status === 'unavailable' ? <div className="diff-note" role="status">
          <p><strong>{AVAILABILITY[result.availability].title}</strong></p>
          {AVAILABILITY[result.availability].body.map(line => <p key={line}><InlineText text={line} /></p>)}
        </div>
        : <OkView projectId={projectId} active={active} result={result} />}
    </div>
  </section>
}
