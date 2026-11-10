import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRef, type RefObject } from 'react'
import type { DraftKey } from '@shared/session/types'
import { defaultUiState } from '@shared/project/ui-state'
import { useProjectShell } from '../project/store'
import { draftId, emptyDraft, useSessions } from '../session/store'
import { ReferenceText } from './ReferenceText'
import { editorSelection, type ComposerInput } from './reference-editor-dom'
import { useSuggestions } from './useSuggestions'

const key: DraftKey = { projectId: 'p', kind: 'new_chat' }
const otherKey: DraftKey = { projectId: 'p', kind: 'session', sessionId: 'other' }
const originalSessions = useSessions.getState(), originalShell = useProjectShell.getState()
let frames: Map<number, FrameRequestCallback>, frameId: number

function Harness({ draftKey = key, active = true, input }: { draftKey?: DraftKey; active?: boolean; input: RefObject<ComposerInput | null> }) {
  const draft = useSessions(s => s.drafts[draftId(draftKey)])!
  const suggestions = useSuggestions({ draftKey, text: draft.text, input, active, cli: 'codex', skills: null, loadSkills: async () => {}, report: () => {}, inlineReferences: draft.inlineReferences ?? [] })
  return <><button>Outside editor</button>{suggestions.popup}<ReferenceText key={draftId(draftKey)} projectId="p" cli="codex" text={draft.text} references={draft.inlineReferences ?? []} input={input} attributes={suggestions.attributes}
    onCaret={suggestions.updateCaret} onBlur={suggestions.dismiss} onKeyDown={suggestions.onKeyDown}
    onChange={value => useSessions.getState().updateDraft(draftKey, { text: value.text, inlineReferences: [...value.references] })} /></>
}
beforeEach(() => {
  frames = new Map(); frameId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++frameId; frames.set(id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Object.defineProperty(window, 'studio', { configurable: true, value: {
    session: { saveDraft: async () => {} }, files: {
      list: async () => ({ status: 'ok', revision: 1, path: '', entries: [{ name: 'app.ts', kind: 'file' }, { name: 'source files', kind: 'directory' }], truncated: false }),
      resolveReference: async () => ({ status: 'ok', references: [] })
    }
  } })
  useSessions.setState({ drafts: { [draftId(key)]: { ...emptyDraft(), text: '@src/', cli: 'codex' }, [draftId(otherKey)]: { ...emptyDraft(), text: 'other conversation text', cli: 'codex' } } })
  useProjectShell.setState({ uiStates: { p: { ...defaultUiState(), mainCanvas: { mode: 'draft' } } } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); useSessions.setState(originalSessions, true); useProjectShell.setState(originalShell, true) })
function flushFrames() {
  act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) })
}
async function choose(kind: 'file' | 'directory' = 'file') {
  const input = createRef<ComposerInput>()
  const view = render(<Harness input={input} />)
  act(() => { input.current!.focus(); input.current!.setSelectionRange(5, 5); fireEvent.mouseUp(input.current!.element) })
  const option = await screen.findByRole('option', { name: kind === 'file' ? /app.ts/ : /source files/ })
  if (kind === 'file') fireEvent.click(option)
  else fireEvent.pointerDown(option)
  const expected = kind === 'file' ? '@src/app.ts' : '@src/source files/'
  await waitFor(() => expect(input.current!.value).toBe(expected))
  return { input, view, expected }
}
function typeText(input: ComposerInput, text: string) {
  const selection = window.getSelection()!, range = selection.getRangeAt(0)
  const node = document.createTextNode(text)
  range.deleteContents(); range.insertNode(node); range.setStart(node, node.length); range.collapse(true)
  selection.removeAllRanges(); selection.addRange(range)
  fireEvent.input(input.element); fireEvent.keyUp(input.element)
}
it('places the caret after the selected atomic reference', async () => {
  const { input, expected } = await choose()
  flushFrames()
  expect(editorSelection(input.current!.element, useSessions.getState().drafts[draftId(key)]!.inlineReferences ?? [])).toEqual([expected.length, expected.length])
  expect(document.activeElement).toBe(input.current!.element)
})
it.each(['file', 'directory'] as const)('does not restore an old %s selection after continued typing', async kind => {
  const { input, expected } = await choose(kind)
  act(() => { input.current!.focus(); input.current!.setSelectionRange(expected.length, expected.length) })
  act(() => typeText(input.current!, ' @'))
  const length = expected.length + 2
  expect(input.current!.selectionStart).toBe(length)
  flushFrames()
  expect(input.current!.selectionStart).toBe(length)
  act(() => typeText(input.current!, 'source'))
  expect(input.current!.value).toBe(`${expected} @source`)
})
it('does not move or focus a different conversation when an old selection callback runs', async () => {
  const { input, view } = await choose()
  act(() => useProjectShell.setState({ uiStates: { p: { ...defaultUiState(), mainCanvas: { mode: 'session', sessionId: 'other' } } } }))
  view.rerender(<Harness input={input} draftKey={otherKey} />)
  act(() => { input.current!.focus(); input.current!.setSelectionRange(3, 3); screen.getByRole('button', { name: 'Outside editor' }).focus() })
  flushFrames()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Outside editor' }))
  expect(input.current!.value).toBe('other conversation text')
})
it('does not focus an inactive Project after selecting a reference', async () => {
  const { input, view } = await choose()
  view.rerender(<Harness input={input} active={false} />)
  screen.getByRole('button', { name: 'Outside editor' }).focus()
  flushFrames()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Outside editor' }))
})
it('does not focus anything after the editor unmounts', async () => {
  const { view } = await choose()
  view.unmount()
  const outside = document.createElement('button'); document.body.append(outside); outside.focus()
  flushFrames()
  expect(document.activeElement).toBe(outside)
  outside.remove()
})
