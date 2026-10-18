import { Component, Suspense, useState, type ReactNode } from 'react'
import { projectPathName } from '@shared/tools/files'
import { Icon } from '../../../app/Icon'
import { LazyCodeViewer } from '../code/lazy'
import type { AddOutcome } from './add-to-conversation'
import type { FileViewer as ViewerState } from './files-store'
import { displayName, encodingLabel, fileReasonText, FILES_TEXT, formatBytes, lineEndingLabel } from './strings'

const RETRYABLE = new Set(['unreadable', 'timeout', 'changed_while_reading', 'project_unavailable', 'project_closing'])

const Skeleton = ({ label }: { label: string }) => <div className="files-viewer__loading" role="status"><span className="files-skeleton" aria-hidden="true" /><span className="files-skeleton" aria-hidden="true" /><span className="files-skeleton" aria-hidden="true" /><span className="sr-only">{label}</span></div>

/** A failed lazy chunk or a throwing editor must not take the panel (or the app) down: the text stays readable. */
class ViewerBoundary extends Component<{ fallback: ReactNode; children?: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function FileContent({ viewKey, path, text, active }: { viewKey: string; path: string; text: string; active: boolean }) {
  const [failure, setFailure] = useState<string | null>(null)
  const plain = <><p className="files-viewer__note" role="status">{FILES_TEXT.codeFailed}</p><pre className="files-viewer__plain" tabIndex={0} aria-label={displayName(path)}>{text}</pre></>
  if (failure !== null) return plain
  return <ViewerBoundary fallback={plain}>
    <Suspense fallback={<Skeleton label={FILES_TEXT.loadingViewer} />}>
      <LazyCodeViewer path={path} text={text} active={active} viewStateKey={viewKey} onError={setFailure} />
    </Suspense>
  </ViewerBoundary>
}

export interface FileViewerProps {
  projectId: string
  viewer: ViewerState
  /** Offered only while the viewed path is the selected, regular file. */
  canAdd: boolean
  active: boolean
  message: AddOutcome | null
  adding: boolean
  onAddImage?(): void
  onAdd(): void
  onClose(): void
  onRetry(): void
}

export function FileViewer({ projectId, viewer, canAdd, active, message, adding, onAdd, onAddImage, onClose, onRetry }: FileViewerProps) {
  const name = displayName(projectPathName(viewer.path))
  const meta = viewer.phase === 'ready'
    ? [formatBytes(viewer.size), encodingLabel(viewer.encoding, viewer.bom), lineEndingLabel(viewer.lineEnding)].filter(Boolean).join(' · ')
    : viewer.phase === 'unavailable' && viewer.size !== undefined ? formatBytes(viewer.size) : ''
  return <section className="files-viewer" aria-label={FILES_TEXT.viewer}>
    <header className="files-viewer__header">
      <div className="files-viewer__title">
        <span className="files-viewer__name" title={displayName(viewer.path)}>{name}</span>
        {meta && <span className="files-viewer__meta">{meta}</span>}
      </div>
      <div className="files-viewer__actions">
        {canAdd && onAddImage && <button className="secondary-button button--small" disabled={adding} onClick={onAddImage}>作为图片附加</button>}
        {canAdd && <button className="primary-button button--small" disabled={adding} onClick={onAdd}>{adding ? FILES_TEXT.adding : FILES_TEXT.addToConversation}</button>}
        <button className="icon-button" aria-label={FILES_TEXT.closeViewer} data-tip={FILES_TEXT.closeViewer} data-tip-align="end" onClick={onClose}><Icon name="close" size={14} /></button>
      </div>
    </header>
    <p className="files-viewer__message" role="status" aria-live="polite" data-tone={message?.tone}>{message?.text}</p>
    <div className="files-viewer__body">
      {viewer.phase === 'loading' && <Skeleton label={FILES_TEXT.loadingFile} />}
      {viewer.phase === 'unavailable' && <div className="files-viewer__unavailable" data-reason={viewer.reason}>
        <p>{fileReasonText(viewer.reason, viewer.size)}</p>
        <span className="muted">{displayName(viewer.path)}</span>
        {RETRYABLE.has(viewer.reason) && <button className="secondary-button button--small" onClick={onRetry}>{FILES_TEXT.retry}</button>}
      </div>}
      {/* One editor per path: new text for the same path is pushed into it (view state kept). No instance while hidden. */}
      {viewer.phase === 'ready' && active && <FileContent key={viewer.path} viewKey={`${projectId}:${viewer.path}`} path={viewer.path} text={viewer.text} active={active} />}
    </div>
  </section>
}
