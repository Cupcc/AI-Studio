import { Component, Suspense, useEffect, useState, type ReactNode } from 'react'
import { imageTypeOf, projectPathName, type FileImageResult, type ProjectPath } from '@shared/tools/files'
import { Icon } from '../../../app/Icon'
import { below, popupMenu, separator, type MenuItemSpec } from '../../../lib/menu'
import { AgentMarkdown } from '../../session/Markdown'
import { LazyCodeViewer } from '../code/lazy'
import type { AddOutcome } from './add-to-conversation'
import { filesApi } from './api'
import { copyText, installedEditors, openWith, type ActionMessage } from './file-actions'
import { FileIcon } from './file-icon'
import type { FileTab, FileViewer as ViewerState } from './files-store'
import { displayName, encodingLabel, fileReasonText, FILES_MENU, FILES_TEXT, formatBytes, lineEndingLabel } from './strings'

const RETRYABLE = new Set(['unreadable', 'timeout', 'changed_while_reading', 'project_unavailable', 'project_closing'])
const MARKDOWN = /\.(md|mdx|markdown)$/i

/** Soft wrap and Markdown preview are viewer preferences for this app run, like VS Code's per-window toggles. */
let wrapPreference = false
const markdownPreview = new Set<ProjectPath>()

const Skeleton = ({ label }: { label: string }) => <div className="files-viewer__loading" role="status"><span className="files-skeleton" aria-hidden="true" /><span className="files-skeleton" aria-hidden="true" /><span className="files-skeleton" aria-hidden="true" /><span className="sr-only">{label}</span></div>

/** A failed lazy chunk or a throwing editor must not take the panel (or the app) down: the text stays readable. */
class ViewerBoundary extends Component<{ fallback: ReactNode; children?: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function FileContent({ viewKey, path, text, active, wordWrap, revealLine }: { viewKey: string; path: string; text: string; active: boolean; wordWrap: boolean; revealLine?: { line: number; nonce: number } }) {
  const [failure, setFailure] = useState<string | null>(null)
  const plain = <><p className="files-viewer__note" role="status">{FILES_TEXT.codeFailed}</p><pre className="files-viewer__plain" tabIndex={0} aria-label={displayName(path)}>{text}</pre></>
  if (failure !== null) return plain
  return <ViewerBoundary fallback={plain}>
    <Suspense fallback={<Skeleton label={FILES_TEXT.loadingViewer} />}>
      <LazyCodeViewer path={path} text={text} active={active} viewStateKey={viewKey} onError={setFailure} wordWrap={wordWrap} {...(revealLine ? { revealLine } : {})} />
    </Suspense>
  </ViewerBoundary>
}

/** Images are read as bytes (bounded in main) and shown with an <img>; an SVG therefore never runs its scripts. */
function ImagePreview({ projectId, path, version }: { projectId: string; path: ProjectPath; version: string }) {
  const [image, setImage] = useState<FileImageResult | null>(null)
  useEffect(() => {
    let current = true
    setImage(null)
    void filesApi().readImage({ projectId, path }).then(result => { if (current) setImage(result) })
      .catch(() => { if (current) setImage({ status: 'unavailable', path, reason: 'unreadable' }) })
    return () => { current = false }
  }, [projectId, path, version])
  if (!image) return <Skeleton label={FILES_TEXT.imageLoading} />
  if (image.status !== 'ok') return <div className="files-viewer__unavailable"><p>{image.reason === 'not_image' ? FILES_TEXT.imageFailed : fileReasonText(image.reason, image.size)}</p></div>
  return <div className="files-image"><img src={`data:${image.mime};base64,${image.base64}`} alt={displayName(projectPathName(path))} /></div>
}

export interface FileViewerProps {
  projectId: string
  viewer: ViewerState
  /** Offered only while the viewed path is the selected, regular file. */
  canAdd: boolean
  active: boolean
  message: AddOutcome | null
  adding: boolean
  tabs?: readonly FileTab[]
  reveal?: { path: ProjectPath; line: number; nonce: number } | null
  onAddImage?(): void
  onAdd(): void
  onClose(): void
  onRetry(): void
  onSelectTab?(path: ProjectPath, pinned: boolean): void
  onCloseTab?(path: ProjectPath): void
  onPinTab?(path: ProjectPath): void
  onNotice?(message: ActionMessage | null): void
}

export function FileViewer({ projectId, viewer, canAdd, active, message, adding, tabs = [], reveal = null, onAdd, onAddImage, onClose, onRetry, onSelectTab, onCloseTab, onPinTab, onNotice }: FileViewerProps) {
  const [wordWrap, setWordWrap] = useState(wrapPreference)
  const [previewing, setPreviewing] = useState(() => markdownPreview.has(viewer.path))
  useEffect(() => setPreviewing(markdownPreview.has(viewer.path)), [viewer.path])
  const name = displayName(projectPathName(viewer.path))
  const isImage = imageTypeOf(viewer.path) !== null
  const isMarkdown = MARKDOWN.test(viewer.path)
  const meta = viewer.phase === 'ready'
    ? [formatBytes(viewer.size), encodingLabel(viewer.encoding, viewer.bom), lineEndingLabel(viewer.lineEnding)].filter(Boolean).join(' · ')
    : viewer.phase === 'unavailable' && viewer.size !== undefined ? formatBytes(viewer.size) : ''

  function toggleWrap() { wrapPreference = !wordWrap; setWordWrap(wrapPreference) }
  function togglePreview() {
    if (previewing) markdownPreview.delete(viewer.path); else markdownPreview.add(viewer.path)
    setPreviewing(!previewing)
  }
  async function openMore(anchor: HTMLElement) {
    const editors = await installedEditors()
    const items: MenuItemSpec[] = [
      ...(editors.vscode ? [{ id: 'vscode', label: FILES_MENU.openVSCode }] : []),
      ...(editors.cursor ? [{ id: 'cursor', label: FILES_MENU.openCursor }] : []),
      { id: 'default', label: FILES_MENU.openDefault },
      { id: 'reveal', label: FILES_MENU.reveal },
      separator,
      { id: 'wrap', label: FILES_TEXT.wrap, type: 'checkbox', checked: wordWrap, accelerator: 'Alt+Z', enabled: !isImage },
      separator,
      { id: 'copy-relative', label: FILES_MENU.copyRelativePath }
    ]
    const choice = await popupMenu(items, below(anchor))
    if (choice === 'vscode' || choice === 'cursor' || choice === 'default') onNotice?.(await openWith(projectId, viewer.path, choice, reveal?.path === viewer.path ? reveal.line : undefined))
    else if (choice === 'reveal') onNotice?.(await openWith(projectId, viewer.path, 'finder'))
    else if (choice === 'wrap') toggleWrap()
    else if (choice === 'copy-relative') onNotice?.(await copyText(viewer.path, FILES_TEXT.copiedRelative))
  }

  const revealLine = reveal && reveal.path === viewer.path ? { line: reveal.line, nonce: reveal.nonce } : undefined
  return <section className="files-viewer" aria-label={FILES_TEXT.viewer}
    onKeyDown={event => { if (event.altKey && !event.metaKey && !event.ctrlKey && event.code === 'KeyZ' && !isImage) { event.preventDefault(); toggleWrap() } }}>
    {tabs.length > 1 && <div className="files-tabs" role="tablist" aria-label={FILES_TEXT.tabs}>
      {tabs.map(tab => {
        const tabName = displayName(projectPathName(tab.path)), current = tab.path === viewer.path
        return <div key={tab.path} className={`files-tab ${current ? 'is-current' : ''} ${tab.pinned ? '' : 'is-preview'}`} title={displayName(tab.path)}>
          <button role="tab" aria-selected={current} onClick={() => onSelectTab?.(tab.path, tab.pinned)} onDoubleClick={() => onPinTab?.(tab.path)}
            onAuxClick={event => { if (event.button === 1) onCloseTab?.(tab.path) }}>
            <FileIcon name={tab.path} kind="file" size={12} /><span>{tabName}</span>
          </button>
          <button className="files-tab__close" aria-label={FILES_TEXT.closeTab(tabName)} onClick={() => onCloseTab?.(tab.path)}><Icon name="close" size={10} /></button>
        </div>
      })}
    </div>}
    <header className="files-viewer__header">
      <div className="files-viewer__title">
        <span className="files-viewer__name" title={displayName(viewer.path)}>{name}</span>
        {meta && <span className="files-viewer__meta">{meta}</span>}
      </div>
      <div className="files-viewer__actions">
        {isMarkdown && viewer.phase === 'ready' && <button className={`secondary-button button--small ${previewing ? 'is-selected' : ''}`} aria-pressed={previewing} onClick={togglePreview}>{previewing ? FILES_TEXT.source : FILES_TEXT.preview}</button>}
        {!isImage && viewer.phase === 'ready' && !previewing && <button className={`icon-button ${wordWrap ? 'is-selected' : ''}`} aria-label={FILES_TEXT.wrap} aria-pressed={wordWrap} data-tip={`${FILES_TEXT.wrap} ⌥Z`} onClick={toggleWrap}><Icon name="wrap" size={14} /></button>}
        {canAdd && onAddImage && isImage && <button className="secondary-button button--small" disabled={adding} onClick={onAddImage}>作为图片附加</button>}
        {canAdd && <button className="primary-button button--small" disabled={adding} onClick={onAdd}>{adding ? FILES_TEXT.adding : FILES_TEXT.addToConversation}</button>}
        <button className="icon-button" aria-label={FILES_TEXT.more} data-tip={FILES_TEXT.more} onClick={event => void openMore(event.currentTarget)}><Icon name="dots" size={14} /></button>
        <button className="icon-button" aria-label={FILES_TEXT.closeViewer} data-tip={FILES_TEXT.closeViewer} data-tip-align="end" onClick={onClose}><Icon name="close" size={14} /></button>
      </div>
    </header>
    <p className="files-viewer__message" role="status" aria-live="polite" data-tone={message?.tone}>{message?.text}</p>
    <div className="files-viewer__body">
      {viewer.phase === 'loading' && !isImage && <Skeleton label={FILES_TEXT.loadingFile} />}
      {/* An image is binary for the text reader; the image preview reads it on its own. */}
      {isImage && active && (viewer.phase !== 'unavailable' || viewer.reason === 'binary') && <ImagePreview projectId={projectId} path={viewer.path} version={viewer.phase === 'ready' ? viewer.version : viewer.phase} />}
      {viewer.phase === 'unavailable' && !(isImage && viewer.reason === 'binary') && <div className="files-viewer__unavailable" data-reason={viewer.reason}>
        <p>{fileReasonText(viewer.reason, viewer.size)}</p>
        <span className="muted">{displayName(viewer.path)}</span>
        {RETRYABLE.has(viewer.reason) && <button className="secondary-button button--small" onClick={onRetry}>{FILES_TEXT.retry}</button>}
      </div>}
      {viewer.phase === 'ready' && active && !isImage && previewing && isMarkdown && <div className="files-markdown"><AgentMarkdown text={viewer.text} /></div>}
      {/* One editor per path: new text for the same path is pushed into it (view state kept). No instance while hidden. */}
      {viewer.phase === 'ready' && active && !isImage && !previewing && <FileContent key={viewer.path} viewKey={`${projectId}:${viewer.path}`} path={viewer.path} text={viewer.text} active={active} wordWrap={wordWrap} {...(revealLine ? { revealLine } : {})} />}
    </div>
  </section>
}
