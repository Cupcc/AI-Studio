import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { InlineReference } from '@shared/session/types'
import { ReferenceText } from './ReferenceText'
import { useProjectShell } from '../project/store'
import { defaultUiState } from '@shared/project/ui-state'
import { useFiles } from '../tools/files/files-store'
import { useReferenceInspector } from './reference-preview'
import { editorSelection, paintEditor, readEditor, selectEditor, type ComposerInput } from './reference-editor-dom'
import { createRef, useState } from 'react'
import { SESSION_MESSAGE_MAX_LENGTH } from '@shared/ipc/session'

const files = { read: vi.fn(), list: vi.fn(async () => ({ status: 'ok', revision: 1, path: '', entries: [], truncated: false })) }
const session = { getSkillContent: vi.fn() }
afterEach(() => { cleanup(); vi.restoreAllMocks(); useReferenceInspector.setState({ current: null }) })
function mount(text: string, references: InlineReference[]) {
  Object.defineProperty(window, 'studio', { configurable: true, value: { files, session } })
  useProjectShell.setState({ uiStates: { p: defaultUiState() } })
  return render(<ReferenceText projectId="p" cli="codex" text={text} references={references} input={{ current: null }} />)
}

it('renders a distinct file reference, reads real content on hover and opens Files without sending', async () => {
  files.read.mockResolvedValue({ status: 'ok', text: 'export const answer = 42' })
  const open = vi.spyOn(useFiles.getState(), 'open').mockResolvedValue()
  mount('Review @src/a.ts please', [{ start: 7, end: 16, item: { type: 'file', path: 'src/a.ts' } }])
  const chip = screen.getByRole('button', { name: '文件引用 src/a.ts' })
  expect(chip.className).toContain('composer__reference--file')
  expect(files.read).not.toHaveBeenCalled()
  fireEvent.mouseOver(chip)
  expect(await screen.findByText('export const answer = 42')).toBeTruthy()
  expect(files.read).toHaveBeenCalledWith({ projectId: 'p', path: 'src/a.ts' })
  fireEvent.click(chip)
  expect(open).toHaveBeenCalledWith('p', 'src/a.ts')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('previews Skill content by opaque identity and keyboard-opens the read-only inspector', async () => {
  session.getSkillContent.mockResolvedValue({ name: 'review', text: '# Review\nUse the actual Skill instructions.', truncated: false })
  const item = { type: 'skill' as const, id: 'opaque', name: 'review' }
  mount('$review', [{ start: 0, end: 7, item }])
  const chip = screen.getByRole('button', { name: 'Skill 引用 review' })
  fireEvent.focus(chip)
  expect(await screen.findByText(/Use the actual Skill/)).toBeTruthy()
  expect(session.getSkillContent).toHaveBeenCalledWith({ projectId: 'p', cli: 'codex', skillId: 'opaque' })
  fireEvent.keyDown(chip, { key: 'Enter' })
  expect(useReferenceInspector.getState().current).toMatchObject({ projectId: 'p', item })
})

it('discards a preview arriving after the user edits the draft, and shows read errors honestly', async () => {
  let complete!: (value: unknown) => void
  files.read.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  const ref: InlineReference = { start: 0, end: 5, item: { type: 'file', path: 'a.ts' } }
  const view = mount('@a.ts', [ref])
  fireEvent.mouseOver(screen.getByRole('button'))
  await waitFor(() => expect(complete).toBeDefined())
  view.rerender(<ReferenceText projectId="p" cli="codex" text="edited" references={[]} input={{ current: null }} />)
  complete({ status: 'ok', text: 'stale secret preview' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.queryByText('stale secret preview')).toBeNull()
  files.read.mockResolvedValue({ status: 'unavailable', reason: 'missing' })
  view.rerender(<ReferenceText projectId="p" cli="codex" text="@a.ts" references={[ref]} input={{ current: null }} />)
  fireEvent.mouseOver(screen.getByRole('button'))
  expect(await screen.findByText(/不存在/)).toBeTruthy()
})

it('keeps padded chips atomic in selection and plain-text clipboard output', () => {
  const value = { text: '看 @a.ts 然后 $review', references: [
    { start: 2, end: 7, item: { type: 'file' as const, path: 'a.ts' } },
    { start: 11, end: 18, item: { type: 'skill' as const, id: 'opaque', name: 'review' } }
  ] }
  // Offsets follow the actual source string, independent of label padding and type markers.
  value.references[1]!.start = value.text.indexOf('$'); value.references[1]!.end = value.text.length
  const input = createRef<ComposerInput>(), change = vi.fn()
  render(<ReferenceText projectId="p" cli="codex" {...value} input={input} onChange={change} />)
  const node = screen.getByRole('textbox')
  input.current!.setSelectionRange(2, 7)
  expect(editorSelection(node, value.references)).toEqual([2, 7])
  const setData = vi.fn()
  fireEvent.copy(node, { clipboardData: { setData } })
  expect(setData).toHaveBeenCalledWith('text/plain', '@a.ts')
  fireEvent.cut(node, { clipboardData: { setData } })
  expect(change).toHaveBeenLastCalledWith({ text: value.text.replace('@a.ts', ''), references: [{ ...value.references[1], start: value.references[1]!.start - 5, end: value.references[1]!.end - 5 }] })
})

it('does not rewrite DOM or publish drafts during IME composition, then commits the final text', () => {
  const input = createRef<ComposerInput>(), change = vi.fn()
  render(<ReferenceText projectId="p" cli="codex" text="初始" references={[]} input={input} onChange={change} />)
  const node = screen.getByRole('textbox')
  fireEvent.compositionStart(node)
  node.textContent = '初始中文候选'; fireEvent.input(node)
  expect(change).not.toHaveBeenCalled()
  expect(node.textContent).toBe('初始中文候选')
  fireEvent.compositionEnd(node)
  expect(change).toHaveBeenCalledWith({ text: '初始中文候选', references: [] })
})

it('maps browser line wrappers, empty placeholders and edited chip identities without extra newlines', () => {
  const root = document.createElement('div')
  root.innerHTML = '<div>one</div><div><br></div><div>three</div>'
  expect(readEditor(root, []).text).toBe('one\n\nthree')
  root.innerHTML = '<br>'
  expect(readEditor(root, []).text).toBe('')
  const value = { text: '@a.ts $review', references: [{ start: 0, end: 5, item: { type: 'file' as const, path: 'a.ts' } }, { start: 6, end: 13, item: { type: 'skill' as const, id: 'opaque', name: 'review' } }] }
  paintEditor(root, value)
  root.querySelector('[data-reference="0"]')!.remove()
  expect(readEditor(root, value.references)).toEqual({ text: ' $review', references: [{ start: 1, end: 8, item: value.references[1]!.item }] })
  document.body.append(root); selectEditor(root, value, 6, 13)
  expect(editorSelection(root, value.references)).toEqual([6, 13]); root.remove()
})

it('restores reference identity through cut, undo and redo, and rejects an oversized edit without reassigning a surviving Skill', () => {
  const file = { type: 'file' as const, path: 'a.ts' }, skill = { type: 'skill' as const, id: 'opaque', name: 'review' }
  const input = createRef<ComposerInput>(), report = vi.fn()
  function Harness() {
    const [value, setValue] = useState({ text: '@a.ts $review', references: [{ start: 0, end: 5, item: file }, { start: 6, end: 13, item: skill }] as InlineReference[] })
    return <ReferenceText projectId="p" cli="codex" {...value} input={input} report={report} onChange={next => setValue({ text: next.text, references: [...next.references] })} />
  }
  render(<Harness />)
  const node = screen.getByRole('textbox')
  input.current!.setSelectionRange(0, 5)
  fireEvent.cut(node, { clipboardData: { setData: vi.fn() } })
  expect(screen.queryByRole('button', { name: '文件引用 a.ts' })).toBeNull()
  fireEvent.keyDown(node, { key: 'z', ctrlKey: true })
  expect(screen.getByRole('button', { name: '文件引用 a.ts' })).toBeTruthy()
  fireEvent.keyDown(node, { key: 'z', ctrlKey: true, shiftKey: true })
  expect(screen.queryByRole('button', { name: '文件引用 a.ts' })).toBeNull()
  node.append(document.createTextNode('x'.repeat(SESSION_MESSAGE_MAX_LENGTH)))
  fireEvent.input(node)
  expect(report).toHaveBeenCalledWith('超过消息长度限制。')
  expect(input.current!.value).toBe(' $review')
  fireEvent.click(screen.getByRole('button', { name: 'Skill 引用 review' }))
  expect(useReferenceInspector.getState().current).toMatchObject({ item: skill })
})
