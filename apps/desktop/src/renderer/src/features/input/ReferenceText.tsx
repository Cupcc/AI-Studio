import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject, type HTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ClipboardEvent as ReactClipboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { InlineReference, SessionCli } from '@shared/session/types'
import { Icon } from '../../app/Icon'
import { displayName } from '../../lib/display-path'
import { readReference, openReference, type ReferenceContent } from './reference-preview'
import { editorSelection, paintEditor, readEditor, revealEditorCaret, selectEditor, valueKey, type ComposerInput, type EditorValue } from './reference-editor-dom'
import { SESSION_MESSAGE_MAX_LENGTH } from '@shared/ipc/session'

/** Actual atomic chips occupy layout space, including padding, while the model keeps ordinary text offsets. */
export function ReferenceText({ projectId, cli, text, references, input, onChange, onKeyDown, onPaste, onCaret, onBlur, onComposition, disabled, label = '消息', placeholder = '', attributes = {}, report }: {
  projectId: string; cli: SessionCli | null; text: string; references: readonly InlineReference[]
  input: RefObject<ComposerInput | null>; onChange?: (value: EditorValue) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void; onPaste?: (event: ReactClipboardEvent<HTMLElement>) => void
  onCaret?: () => void; onBlur?: () => void; onComposition?: (active: boolean) => void
  disabled?: boolean; label?: string; placeholder?: string; attributes?: HTMLAttributes<HTMLDivElement>; report?: (message: string) => void
}) {
  const root = useRef<HTMLDivElement>(null), painted = useRef<EditorValue>({ text, references }), composing = useRef(false)
  const latest = useRef({ text, references, onChange }); latest.current = { text, references, onChange }
  const history = useRef<{ value: EditorValue; selection: [number, number] }[]>([{ value: { text, references }, selection: [text.length, text.length] }]), historyIndex = useRef(0)
  const remember = (value: EditorValue, selection: [number, number]) => {
    if (valueKey(history.current[historyIndex.current]!.value) === valueKey(value)) return
    history.current = [...history.current.slice(0, historyIndex.current + 1), { value, selection }].slice(-100)
    historyIndex.current = history.current.length - 1
  }
  useLayoutEffect(() => {
    const node = root.current
    if (!node || composing.current) return
    const value = { text, references }
    if (valueKey(readEditor(node, painted.current.references)) !== valueKey(value)) {
      paintEditor(node, value); painted.current = value; remember(value, [text.length, text.length])
    }
  }, [text, references])
  useLayoutEffect(() => {
    const node = root.current!
    const handle: ComposerInput = {
      element: node, get value() { return latest.current.text },
      get selectionStart() { return editorSelection(node, painted.current.references)[0] },
      get selectionEnd() { return editorSelection(node, painted.current.references)[1] },
      focus: () => node.focus(), closest: selector => node.closest(selector),
      setSelectionRange(start, end) { const value = { text: latest.current.text, references: latest.current.references }; selectEditor(node, value, start, end); painted.current = value; history.current[historyIndex.current]!.selection = [start, end] }
    }
    input.current = handle
    return () => { if (input.current === handle) input.current = null }
  }, [input])
  const caret = () => {
    if (root.current) history.current[historyIndex.current]!.selection = editorSelection(root.current, painted.current.references)
    onCaret?.()
  }
  const publish = () => {
    if (!root.current || composing.current) return
    const value = readEditor(root.current, painted.current.references), selection = editorSelection(root.current, painted.current.references)
    if (value.text.length > SESSION_MESSAGE_MAX_LENGTH) { painted.current = { text: latest.current.text, references: latest.current.references }; paintEditor(root.current, painted.current); report?.('超过消息长度限制。'); return }
    remember(value, selection); latest.current.onChange?.(value); onCaret?.()
  }
  const insertText = (value: string) => {
    const node = root.current!, selection = window.getSelection()
    if (!selection?.rangeCount || !node.contains(selection.anchorNode)) return
    const range = selection.getRangeAt(0); range.deleteContents()
    const textNode = document.createTextNode(value.replace(/\r\n?/g, '\n')); range.insertNode(textNode); range.setStart(textNode, textNode.length); range.collapse(true)
    selection.removeAllRanges(); selection.addRange(range); publish(); revealEditorCaret(node)
  }
  const undo = (direction: number) => {
    const index = historyIndex.current + direction, entry = history.current[index]
    if (!entry) return
    historyIndex.current = index; painted.current = entry.value
    selectEditor(root.current!, entry.value, ...entry.selection); latest.current.onChange?.(entry.value); onCaret?.()
  }
  const referenceAt = (target: EventTarget | null) => {
    const anchor = target instanceof Element ? target.closest<HTMLElement>('[data-reference]') : null
    const ref = anchor && painted.current.references[Number(anchor.dataset.reference)]
    return anchor && ref ? { ref, anchor } : null
  }
  const [hover, setHover] = useState<{ ref: InlineReference; anchor: HTMLElement } | null>(null)
  const [content, setContent] = useState<ReferenceContent | null>(null), [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; height: number }>({ left: 8, top: 8, width: 360, height: 280 })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), popupId = useId()
  const close = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setHover(null), 140) }
  const show = (ref: InlineReference, anchor: HTMLElement) => {
    clearTimeout(timer.current)
    setHover(current => current?.ref === ref ? current : { ref, anchor })
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { setHover(null) }, [projectId, cli, text])
  useEffect(() => {
    if (!hover) return
    let current = true
    setContent(null); setError(null)
    const delay = setTimeout(() => {
      void readReference(projectId, cli ?? 'codex', hover.ref.item).then(result => { if (current) setContent(result) })
        .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : String(reason)) })
    }, 160)
    return () => { current = false; clearTimeout(delay) }
  }, [hover, projectId, cli])
  useLayoutEffect(() => {
    if (!hover) return
    const box = hover.anchor.getBoundingClientRect(), width = Math.min(400, window.innerWidth - 24)
    const above = box.top > 170
    const height = Math.min(310, Math.max(100, above ? box.top - 20 : window.innerHeight - box.bottom - 20))
    setPosition({ left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)), ...(above ? { bottom: window.innerHeight - box.top + 8 } : { top: box.bottom + 8 }), width, height })
    const dismiss = (event: Event) => { if (!(event.target instanceof Node) || !document.getElementById(popupId)?.contains(event.target)) setHover(null) }
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setHover(null); input.current?.focus() } }
    document.addEventListener('keydown', key)
    return () => { window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss, true); document.removeEventListener('keydown', key) }
  }, [hover, input, popupId])
  const title = hover && displayName(hover.ref.item.type === 'file' ? hover.ref.item.path : `${hover.ref.item.name}/SKILL.md`)
  const preview = content?.text.split('\n').slice(0, 28).join('\n').slice(0, 6000) ?? ''
  return <>
    <div ref={root} className="composer__editable" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-label={label} aria-multiline="true" aria-disabled={disabled || undefined} data-placeholder={placeholder} data-empty={text.length === 0 || undefined} {...attributes}
      onInput={publish} onScroll={() => setHover(null)} onKeyUp={caret} onMouseUp={caret}
      onCompositionStart={() => { composing.current = true; onComposition?.(true) }}
      onCompositionEnd={() => { composing.current = false; onComposition?.(false); publish() }}
      onBeforeInput={event => { const type = (event.nativeEvent as InputEvent).inputType; if (!composing.current && (type === 'insertParagraph' || type === 'insertLineBreak')) { event.preventDefault(); insertText('\n') } }}
      onPaste={event => { onPaste?.(event); if (event.defaultPrevented) return; event.preventDefault(); insertText(event.clipboardData.getData('text/plain')) }}
      onCopy={event => { const [start, end] = editorSelection(root.current!, painted.current.references); if (start !== end) { event.preventDefault(); event.clipboardData.setData('text/plain', readEditor(root.current!, painted.current.references).text.slice(start, end)) } }}
      onCut={event => { const [start, end] = editorSelection(root.current!, painted.current.references); if (start !== end) { event.preventDefault(); event.clipboardData.setData('text/plain', readEditor(root.current!, painted.current.references).text.slice(start, end)); insertText('') } }}
      onMouseOver={event => { const target = referenceAt(event.target); if (target) show(target.ref, target.anchor) }} onMouseOut={close}
      onFocus={event => { const target = referenceAt(event.target); if (target) show(target.ref, target.anchor) }} onBlur={() => { close(); onBlur?.() }}
      onMouseDown={event => { if (referenceAt(event.target)) event.preventDefault() }}
      onClick={event => { const target = referenceAt(event.target); if (target) { setHover(null); openReference(projectId, cli ?? 'codex', target.ref.item) } else caret() }}
      onKeyDown={event => {
        if (!composing.current && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); input.current?.setSelectionRange(0, text.length); return }
        if (!composing.current && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey ? 1 : -1); return }
        const target = referenceAt(event.target)
        if (target && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setHover(null); openReference(projectId, cli ?? 'codex', target.ref.item); return }
        onKeyDown?.(event)
        if (!event.defaultPrevented && event.key === 'Enter' && event.shiftKey && !composing.current) { event.preventDefault(); insertText('\n') }
      }} />
    {hover && createPortal(<div id={popupId} role="dialog" aria-label={`引用预览 ${title}`} className="composer__reference-preview popover"
      style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width, maxHeight: position.height }} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={close}>
      <header><Icon name={hover.ref.item.type === 'file' ? 'file' : 'terminal'} size={15} /><strong>{title}</strong></header>
      {error ? <p role="status">{error}</p> : content ? <pre>{preview || '空文件'}</pre> : <p role="status">正在读取…</p>}
      <footer><span>{content && (content.truncated || preview.length < content.text.length) ? '部分内容' : hover.ref.item.type === 'skill' ? 'Skill' : '项目文件'}</span><button type="button" className="text-button" onClick={() => { openReference(projectId, cli ?? 'codex', hover.ref.item); setHover(null) }}>在侧边栏打开 <Icon name="chevron" size={12} /></button></footer>
    </div>, document.body)}
  </>
}
