import type { InlineReference } from '@shared/session/types'
import { displayName } from '../../lib/display-path'

export interface EditorValue { text: string; references: readonly InlineReference[] }
export interface ComposerInput {
  readonly element: HTMLElement
  readonly value: string
  readonly selectionStart: number
  readonly selectionEnd: number
  focus(): void
  setSelectionRange(start: number, end: number): void
  closest(selector: string): Element | null
}
export const valueKey = (value: EditorValue) => JSON.stringify(value)

/** The DOM is owned by the editor, never reconciled by React while the user composes text. */
export function paintEditor(root: HTMLElement, value: EditorValue): void {
  const fragment = document.createDocumentFragment()
  let offset = 0
  for (const [index, ref] of value.references.entries()) {
    if (ref.start < offset || ref.end > value.text.length || ref.end <= ref.start) continue
    fragment.append(document.createTextNode(value.text.slice(offset, ref.start)))
    const chip = document.createElement('span'), marker = document.createElement('span'), label = document.createElement('span')
    chip.contentEditable = 'false'; chip.dataset.reference = String(index); chip.dataset.label = value.text.slice(ref.start, ref.end)
    chip.className = `composer__reference composer__reference--${ref.item.type}`
    chip.setAttribute('role', 'button'); chip.tabIndex = 0; chip.setAttribute('aria-haspopup', 'dialog')
    const name = displayName(ref.item.type === 'file' ? ref.item.path : ref.item.name)
    chip.setAttribute('aria-label', `${ref.item.type === 'file' ? '文件引用' : 'Skill 引用'} ${name}`)
    marker.className = 'composer__reference-marker'; marker.textContent = ref.item.type === 'file' ? '@' : '$'; marker.setAttribute('aria-hidden', 'true')
    label.className = 'composer__reference-label'; label.textContent = displayName(chip.dataset.label.slice(1))
    chip.append(marker, label); fragment.append(chip)
    offset = ref.end
  }
  fragment.append(document.createTextNode(value.text.slice(offset)))
  root.replaceChildren(fragment)
}

/** Also accepts browser-created line wrappers and Range fragments (copy, IME and multiline input). */
export function readEditor(root: Node, identities: readonly InlineReference[]): EditorValue {
  let text = ''
  const references: InlineReference[] = []
  function visit(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) { text += node.textContent ?? ''; return }
    if (node instanceof HTMLElement) {
      const index = node.dataset.reference
      if (index !== undefined) {
        const ref = identities[Number(index)], label = node.dataset.label
        if (ref && label) { const start = text.length; text += label; references.push({ start, end: text.length, item: ref.item }); return }
      }
      if (/^(DIV|P|LI)$/.test(node.tagName)) {
        const previous = node.previousSibling
        const emptyPreviousLine = previous instanceof HTMLElement && /^(DIV|P|LI)$/.test(previous.tagName) && (!previous.childNodes.length || previous.childNodes.length === 1 && previous.firstChild instanceof HTMLBRElement)
        if (previous && (!text.endsWith('\n') || emptyPreviousLine)) text += '\n'
        if (node.childNodes.length === 1 && node.firstChild instanceof HTMLBRElement) return
      }
      if (node.tagName === 'BR') { text += '\n'; return }
    }
    for (const child of node.childNodes) visit(child)
  }
  if (!(root.childNodes.length === 1 && root.firstChild instanceof HTMLBRElement)) for (const child of root.childNodes) visit(child)
  return { text, references }
}

export function editorSelection(root: HTMLElement, identities: readonly InlineReference[]): [number, number] {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return [0, 0]
  const range = selection.getRangeAt(0)
  const prefix = document.createRange(); prefix.selectNodeContents(root); prefix.setEnd(range.startContainer, range.startOffset)
  const end = document.createRange(); end.selectNodeContents(root); end.setEnd(range.endContainer, range.endOffset)
  return [readEditor(prefix.cloneContents(), identities).text.length, readEditor(end.cloneContents(), identities).text.length]
}

/** Programmatic Range edits do not get the browser's native caret scrolling. Keep scrolling inside the editor. */
export function revealEditorCaret(root: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  if (!range.collapsed || !root.contains(range.endContainer)) return
  if (!range.getBoundingClientRect) return // A DOM without layout cannot measure caret geometry.
  const caret = range.getBoundingClientRect(), viewport = root.getBoundingClientRect()
  if (caret.height) {
    if (caret.bottom > viewport.bottom - 2) root.scrollTop += caret.bottom - viewport.bottom + 2
    else if (caret.top < viewport.top + 2) root.scrollTop -= viewport.top + 2 - caret.top
  } else {
    // An empty trailing text node / line can have no measurable caret rectangle.
    const remaining = document.createRange(); remaining.selectNodeContents(root); remaining.setStart(range.endContainer, range.endOffset)
    if (!remaining.toString()) root.scrollTop = root.scrollHeight
  }
}

/** paintEditor produces a flat text/token sequence, allowing exact model-to-DOM cursor mapping. */
export function selectEditor(root: HTMLElement, value: EditorValue, start: number, end: number): void {
  paintEditor(root, value)
  function point(offset: number): [Node, number] {
    let seen = 0
    for (const [index, child] of Array.from(root.childNodes).entries()) {
      const length = child instanceof HTMLElement && child.dataset.reference !== undefined ? (child.dataset.label?.length ?? 0) : child.textContent?.length ?? 0
      if (offset <= seen + length) return child.nodeType === Node.TEXT_NODE ? [child, Math.max(0, offset - seen)] : [root, index + (offset > seen ? 1 : 0)]
      seen += length
    }
    return [root, root.childNodes.length]
  }
  const range = document.createRange(), from = point(start), to = point(end)
  range.setStart(...from); range.setEnd(...to)
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
  revealEditorCaret(root)
}
