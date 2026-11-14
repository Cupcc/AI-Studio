import { Component, Suspense, useEffect, useState, type ReactNode } from 'react'
import { imageTypeOf, projectPathName, type FileImageResult, type FilesPreferences, type ProjectPath } from '@shared/tools/files'
import { Icon } from '../../../app/Icon'
import { below, popupMenu, separator, type MenuItemSpec } from '../../../lib/menu'
import { AgentMarkdown } from '../../session/Markdown'
import { LazyCodeDiffViewer, LazyCodeViewer } from '../code/lazy'
import type { AddOutcome } from './add-to-conversation'
import { filesApi } from './api'
import { copyText, installedEditors, openWith, type ActionMessage } from './file-actions'
import { FileIcon } from './file-icon'
import { isMarkdownPath, NO_DRAFTS, type FileDraft, type FileTab, type FileViewer as ViewerState } from './files-store'
import { displayName, encodingLabel, fileReasonText, FILES_MENU, FILES_TEXT, formatBytes, lineEndingLabel, saveFailureText } from './strings'

const RETRYABLE = new Set(['unreadable', 'timeout', 'changed_while_reading', 'project_unavailable', 'project_closing'])

const Skeleton = ({ label }: { label: string }) => <div className="files-viewer__loading" role="status"><span className="files-skeleton" aria-hidden="true" /><span className="files-skeleton" aria-hidden="true" /><span className="files-skeleton" aria-hidden="true" /><span className="sr-only">{label}</span></div>

/** A failed lazy chunk or a throwing editor must not take the panel (or the app) down: the text stays readable. */
class ViewerBoundary extends Component<{ fallback: ReactNode; children?: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override render() { return this.state.failed ? this.props.fallback : this.props.children }
}

interface FileContentProps {
  viewKey: string; path: string; text: string; active: boolean; wordWrap: boolean; revealLine?: { line: number; nonce: number }
  /** The file has unsaved changes (a draft in the store). */
  dirty: boolean
  onChange(text: string): void
  onSave(): void
}

/** The editor of one file. Without a working editor the text is still shown, read-only. */
function FileContent({ viewKey, path, text, active, wordWrap, revealLine, dirty, onChange, onSave }: FileContentProps) {
  const [failure, setFailure] = useState<string | null>(null)
  const plain = <><p className="files-viewer__note" role="status">{FILES_TEXT.codeFailed}</p><pre className="files-viewer__plain" tabIndex={0} aria-label={displayName(path)}>{text}</pre></>
  if (failure !== null) return plain
  return <ViewerBoundary fallback={plain}>
    <Suspense fallback={<Skeleton label={FILES_TEXT.loadingViewer} />}>
      <LazyCodeViewer path={path} text={text} active={active} viewStateKey={viewKey} onError={setFailure} wordWrap={wordWrap} editable dirty={dirty} onChange={onChange} onSave={onSave} {...(revealLine ? { revealLine } : {})} />
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
  /** Unsaved changes of the open files (TOOLS-Q13). */
  drafts?: ReadonlyMap<ProjectPath, FileDraft>
  prefs?: FilesPreferences
  reveal?: { path: ProjectPath; line: number; nonce: number } | null
  onAddImage?(): void
  onAdd(): void
  onClose(): void
  onRetry(): void
  onSelectTab?(path: ProjectPath, pinned: boolean): void
  onCloseTab?(path: ProjectPath): void
  onPinTab?(path: ProjectPath): void
  onNotice?(message: ActionMessage | null): void
  onEdit?(path: ProjectPath, text: string, base?: FileDraft['base']): void
  onSave?(path: ProjectPath, options?: { overwrite?: boolean }): void
  onRevert?(path: ProjectPath): void
  onSetPreview?(path: ProjectPath, preview: boolean): void
  onSetWrap?(wrap: boolean): void
}

const NO_PREFS: FilesPreferences = { markdownPreview: false, wordWrap: false }

export function FileViewer({
  projectId, viewer, canAdd, active, message, adding, tabs = [], drafts = NO_DRAFTS, prefs = NO_PREFS, reveal = null,
  onAdd, onAddImage, onClose, onRetry, onSelectTab, onCloseTab, onPinTab, onNotice, onEdit, onSave, onRevert, onSetPreview, onSetWrap
}: FileViewerProps) {
  const path = viewer.path
  const draft = drafts.get(path) ?? null
  const ready = viewer.phase === 'ready' ? viewer : null
  const name = displayName(projectPathName(path))
  const isImage = imageTypeOf(path) !== null
  const isMarkdown = isMarkdownPath(path)
  // What the editor shows: the unsaved text, or the file as read. A file with unsaved changes stays editable while it is
  // read again, and even after it was deleted on disk.
  const text = isImage ? undefined : draft?.text ?? ready?.text
  const base: FileDraft['base'] | undefined = draft?.base ?? (ready ? { version: ready.version, text: ready.text, encoding: ready.encoding, bom: ready.bom } : undefined)
  const tab = tabs.find(item => item.path === path)
  const previewing = isMarkdown && text !== undefined && (tab?.preview ?? prefs.markdownPreview)
  const wordWrap = prefs.wordWrap
  const conflict = draft?.conflict ?? null
  // Comparing needs the disk copy that conflicts, read by the viewer.
  const diskText = conflict && conflict.version !== null && ready?.version === conflict.version ? ready.text : null
  const [comparing, setComparing] = useState(false)
  useEffect(() => { if (diskText === null) setComparing(false) }, [diskText, path])
  const meta = ready || draft
    ? [ready ? formatBytes(ready.size) : '', base ? encodingLabel(base.encoding, base.bom) : '', ready ? lineEndingLabel(ready.lineEnding) : ''].filter(Boolean).join(' · ')
    : viewer.phase === 'unavailable' && viewer.size !== undefined ? formatBytes(viewer.size) : ''

  const save = (overwrite = false) => { if (draft) onSave?.(path, overwrite ? { overwrite } : undefined) }
  function toggleWrap() { onSetWrap?.(!wordWrap) }
  function setPreview(preview: boolean) { if (isMarkdown && text !== undefined) onSetPreview?.(path, preview) }
  async function openMore(anchor: HTMLElement) {
    const editors = await installedEditors()
    const items: MenuItemSpec[] = [
      { id: 'save', label: FILES_MENU.save, accelerator: 'Cmd+S', enabled: !!draft && !draft.saving },
      { id: 'revert', label: FILES_MENU.revert, enabled: !!draft && !draft.saving },
      separator,
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
    if (choice === 'save') save()
    else if (choice === 'revert') onRevert?.(path)
    else if (choice === 'vscode' || choice === 'cursor' || choice === 'default') onNotice?.(await openWith(projectId, path, choice, reveal?.path === path ? reveal.line : undefined))
    else if (choice === 'reveal') onNotice?.(await openWith(projectId, path, 'finder'))
    else if (choice === 'wrap') toggleWrap()
    else if (choice === 'copy-relative') onNotice?.(await copyText(path, FILES_TEXT.copiedRelative))
  }

  const revealLine = reveal && reveal.path === path ? { line: reveal.line, nonce: reveal.nonce } : undefined
  const dirtyTabs = tabs.filter(item => drafts.has(item.path)).length
  return <section className="files-viewer" aria-label={FILES_TEXT.viewer}
    onKeyDown={event => {
      if (event.defaultPrevented) return
      const command = event.metaKey && !event.ctrlKey
      if (event.altKey && !event.metaKey && !event.ctrlKey && event.code === 'KeyZ' && !isImage) { event.preventDefault(); toggleWrap() }
      // ⌘S inside the editor is the editor's own command; this covers the header, the preview and the tabs.
      else if (command && !event.altKey && !event.shiftKey && event.code === 'KeyS') { event.preventDefault(); save() }
      else if (command && !event.altKey && event.shiftKey && event.code === 'KeyV' && isMarkdown) { event.preventDefault(); setPreview(!previewing) }
    }}>
    {tabs.length > 1 && <div className="files-tabs" role="tablist" aria-label={FILES_TEXT.tabs} data-dirty={dirtyTabs || undefined}>
      {tabs.map(item => {
        const tabName = displayName(projectPathName(item.path)), current = item.path === path, dirty = drafts.has(item.path)
        return <div key={item.path} className={`files-tab ${current ? 'is-current' : ''} ${item.pinned ? '' : 'is-preview'} ${dirty ? 'is-dirty' : ''}`} title={displayName(item.path)}>
          <button role="tab" aria-selected={current} onClick={() => onSelectTab?.(item.path, item.pinned)} onDoubleClick={() => onPinTab?.(item.path)}
            onAuxClick={event => { if (event.button === 1) onCloseTab?.(item.path) }}>
            <FileIcon name={item.path} kind="file" size={12} /><span>{tabName}</span>
          </button>
          <button className="files-tab__close" aria-label={FILES_TEXT.closeTab(tabName, dirty)} onClick={() => onCloseTab?.(item.path)}>
            {dirty && <span className="files-tab__dirty" aria-hidden="true" />}<Icon name="close" size={10} />
          </button>
        </div>
      })}
    </div>}
    <header className="files-viewer__header">
      <div className="files-viewer__title">
        <span className="files-viewer__name" title={displayName(path)}>
          {name}{draft && <span className="files-viewer__dirty" role="img" aria-label={FILES_TEXT.unsaved} data-tip={FILES_TEXT.unsavedTip} />}
        </span>
        {meta && <span className="files-viewer__meta">{meta}</span>}
      </div>
      <div className="files-viewer__actions">
        {isMarkdown && text !== undefined && <div className="files-mode" role="group" aria-label={FILES_TEXT.mode} data-tip={FILES_TEXT.previewShortcut}>
          <button className={`files-mode__option ${previewing ? '' : 'is-selected'}`} aria-pressed={!previewing} onClick={() => setPreview(false)}>{FILES_TEXT.edit}</button>
          <button className={`files-mode__option ${previewing ? 'is-selected' : ''}`} aria-pressed={previewing} onClick={() => setPreview(true)}>{FILES_TEXT.preview}</button>
        </div>}
        {draft && <button className="secondary-button button--small" disabled={draft.saving} onClick={() => save()}>{draft.saving ? FILES_TEXT.saving : FILES_TEXT.save}</button>}
        {text !== undefined && !previewing && <button className={`icon-button ${wordWrap ? 'is-selected' : ''}`} aria-label={FILES_TEXT.wrap} aria-pressed={wordWrap} data-tip={`${FILES_TEXT.wrap} ⌥Z`} onClick={toggleWrap}><Icon name="wrap" size={14} /></button>}
        {canAdd && onAddImage && isImage && <button className="secondary-button button--small" disabled={adding} onClick={onAddImage}>作为图片附加</button>}
        {canAdd && <button className="primary-button button--small" disabled={adding} onClick={onAdd}>{adding ? FILES_TEXT.adding : FILES_TEXT.addToConversation}</button>}
        <button className="icon-button" aria-label={FILES_TEXT.more} data-tip={FILES_TEXT.more} onClick={event => void openMore(event.currentTarget)}><Icon name="dots" size={14} /></button>
        <button className="icon-button" aria-label={FILES_TEXT.closeViewer} data-tip={FILES_TEXT.closeViewer} data-tip-align="end" onClick={onClose}><Icon name="close" size={14} /></button>
      </div>
    </header>
    <p className="files-viewer__message" role="status" aria-live="polite" data-tone={message?.tone}>{message?.text}</p>
    {draft && (conflict || draft.error) && <div className="files-conflict" role="alert" data-kind={conflict ? conflict.version === null ? 'deleted' : 'changed' : 'error'}>
      <p>{comparing ? FILES_TEXT.comparing : conflict ? conflict.version === null ? FILES_TEXT.deletedOnDisk : FILES_TEXT.changedOnDisk : FILES_TEXT.saveFailed(saveFailureText(draft.error!))}</p>
      <div className="files-conflict__actions">
        {conflict && conflict.version !== null && !comparing && <button className="secondary-button button--small" disabled={diskText === null} onClick={() => setComparing(true)}>{FILES_TEXT.compare}</button>}
        {comparing && <button className="secondary-button button--small" onClick={() => setComparing(false)}>{FILES_TEXT.backToEdit}</button>}
        <button className="secondary-button button--small" disabled={draft.saving} onClick={() => onRevert?.(path)}>{FILES_TEXT.discardMine}</button>
        {conflict && conflict.version !== null && <button className="primary-button button--small" disabled={draft.saving} onClick={() => save(true)}>{comparing ? FILES_TEXT.overwriteDisk : FILES_TEXT.overwrite}</button>}
        {!conflict && draft.error && <button className="primary-button button--small" disabled={draft.saving} onClick={() => save()}>{FILES_TEXT.retry}</button>}
      </div>
    </div>}
    <div className="files-viewer__body">
      {viewer.phase === 'loading' && text === undefined && !isImage && <Skeleton label={FILES_TEXT.loadingFile} />}
      {/* An image is binary for the text reader; the image preview reads it on its own. */}
      {isImage && active && (viewer.phase !== 'unavailable' || viewer.reason === 'binary') && <ImagePreview projectId={projectId} path={path} version={viewer.phase === 'ready' ? viewer.version : viewer.phase} />}
      {viewer.phase === 'unavailable' && !draft && !(isImage && viewer.reason === 'binary') && <div className="files-viewer__unavailable" data-reason={viewer.reason}>
        <p>{fileReasonText(viewer.reason, viewer.size)}</p>
        <span className="muted">{displayName(path)}</span>
        {RETRYABLE.has(viewer.reason) && <button className="secondary-button button--small" onClick={onRetry}>{FILES_TEXT.retry}</button>}
      </div>}
      {active && comparing && draft && diskText !== null && <Suspense fallback={<Skeleton label={FILES_TEXT.loadingViewer} />}>
        <LazyCodeDiffViewer path={path} original={diskText} modified={draft.text} active={active} viewStateKey={`${projectId}:${path}:compare`} />
      </Suspense>}
      {active && !comparing && text !== undefined && previewing && <div className="files-markdown"><AgentMarkdown text={text} /></div>}
      {/* One editor per path: new text for the same path is pushed into it (view state and undo history kept). No instance while hidden. */}
      {active && !comparing && text !== undefined && !previewing && <FileContent key={path} viewKey={`${projectId}:${path}`} path={path} text={text} active={active} wordWrap={wordWrap} dirty={!!draft}
        onChange={value => onEdit?.(path, value, base)} onSave={() => onSave?.(path)} {...(revealLine ? { revealLine } : {})} />}
    </div>
  </section>
}
