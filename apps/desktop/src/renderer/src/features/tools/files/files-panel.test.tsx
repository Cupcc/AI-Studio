import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MainCanvas } from '@shared/project/types'
import type { FileUnavailableReason, FileReferenceFailureReason } from '@shared/tools/files'
import { addFileReference } from '../../input/add-file-reference'
import type { AddFileReferenceResult } from '../../input/add-file-reference'
import { filesApi } from './api'
import { createFakeFiles, deferred, dir, file, idle, link, special } from './fake-files'
import { FilesPanel } from './FilesPanel'
import { useFiles } from './files-store'

vi.mock('./api', () => ({ filesApi: vi.fn() }))
vi.mock('../../input/add-file-reference', () => ({ addFileReference: vi.fn() }))
const gate = vi.hoisted(() => ({ pending: null as Promise<void> | null }))
vi.mock('../code/lazy', async () => {
  const { use: suspend } = await import('react')
  const Viewer = ({ path, text, active, viewStateKey, onError }: { path: string; text: string; active: boolean; viewStateKey: string; onError?(message: string): void }) => {
    if (gate.pending) suspend(gate.pending)
    if (text === 'BOOM') throw new Error('editor failed')
    if (text === 'REPORT') queueMicrotask(() => onError?.('editor failed to start'))
    return <pre data-testid="code" data-path={path} data-active={String(active)} data-key={viewStateKey}>{text}</pre>
  }
  return { LazyCodeViewer: Viewer, LazyCodeDiffViewer: Viewer }
})

let n = 0
let id = 'p'
let fake: ReturnType<typeof createFakeFiles>
let canvas: MainCanvas
const store = () => useFiles.getState()
const listed = () => fake.mocks.list.mock.calls.map(([request]) => request.path)
const row = (name: string | RegExp) => screen.getByRole('treeitem', { name })
const panel = (active = true, overrides: Partial<Parameters<typeof FilesPanel>[0]> = {}) => <FilesPanel projectId={id} canvas={canvas} active={active} {...overrides} />
const open = async (name: string) => { fireEvent.click(row(name)); await screen.findByTestId('code') }
const announcement = () => document.querySelector('.files-viewer__message')!

beforeEach(() => {
  id = `fp${++n}`
  canvas = { mode: 'draft' }
  gate.pending = null
  fake = createFakeFiles(id)
  vi.mocked(filesApi).mockReturnValue(fake.api)
  fake.api.onChanged(event => store().changed(event))
  fake.api.onWatchChanged(event => store().watchChanged(event))
  fake.setDir('', [dir('src'), dir('docs'), file('README.md')])
  fake.setDir('src', [dir('sub'), file('a.ts')])
  fake.setDir('src/sub', [file('deep.ts')])
  fake.setDir('docs', [file('guide.md')])
  fake.setFile('README.md', 'hello readme')
  fake.setFile('src/a.ts', 'const a = 1')
  fake.setFile('docs/guide.md', 'guide text')
  vi.mocked(addFileReference).mockResolvedValue({ status: 'added' })
})
afterEach(() => { cleanup(); store().forget(id); vi.restoreAllMocks() })

describe('opening and the tree', () => {
  it('makes no call at all while inactive, and starts with a single root listing and a subscription once active', async () => {
    const view = render(panel(false))
    await idle()
    for (const mock of [fake.mocks.list, fake.mocks.read, fake.mocks.subscribe, fake.mocks.unsubscribe, fake.mocks.resolveReference]) expect(mock).not.toHaveBeenCalled()
    expect(addFileReference).not.toHaveBeenCalled()
    view.rerender(panel(true))
    await screen.findByRole('treeitem', { name: 'README.md' })
    expect(listed()).toEqual([''])
    expect(fake.mocks.subscribe).toHaveBeenCalledTimes(1)
  })

  it('renders a tree with directories first as given, and reads a directory only when it is expanded', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'src' })
    const tree = screen.getByRole('tree', { name: '项目文件' })
    expect(within(tree).getAllByRole('treeitem').map(item => item.textContent)).toEqual(['src', 'docs', 'README.md'])
    expect(row('src').getAttribute('aria-expanded')).toBe('false')
    expect(row('README.md').getAttribute('aria-expanded')).toBeNull()
    fireEvent.click(row('src'))
    await screen.findByRole('treeitem', { name: 'a.ts' })
    expect(listed()).toEqual(['', 'src'])
    expect(row('src').getAttribute('aria-expanded')).toBe('true')
    expect(row('a.ts').getAttribute('aria-level')).toBe('2')
    expect(row('README.md').getAttribute('aria-level')).toBe('1')
    fireEvent.click(row('src'))
    expect(screen.queryByRole('treeitem', { name: 'a.ts' })).toBeNull()
  })

  it('explains omitted long paths without calling the directory empty or hiding readable siblings', async () => {
    fake.mocks.list.mockImplementation(async () => ({ status: 'ok', revision: 1000, path: '', entries: [file('keep.txt')], truncated: false, omittedPaths: true }))
    render(panel())
    await screen.findByRole('treeitem', { name: 'keep.txt' })
    expect(await screen.findByText('部分条目路径过长，未显示；可将该目录单独打开为 Project。')).toBeTruthy()
    expect(screen.queryByText('空目录')).toBeNull()
  })

  it('shows a skeleton while the root is read', async () => {
    const pending = deferred<never>()
    fake.mocks.list.mockImplementationOnce(() => pending.promise)
    render(panel())
    expect(await screen.findByText('正在读取…')).toBeTruthy()
    expect(screen.getByRole('tree').getAttribute('aria-busy')).toBe('true')
  })

  it('shows 空目录 for an empty directory and the truncation notice for a listing cut at 2000 entries', async () => {
    fake.setDir('docs', [])
    fake.mocks.list.mockImplementationOnce(async () => ({ status: 'ok' as const, revision: 10_000, path: '', entries: [dir('docs'), file('a')], truncated: true }))
    render(panel())
    await screen.findByRole('treeitem', { name: 'docs' })
    expect(screen.getByText('目录条目过多，仅显示前 2000 项')).toBeTruthy()
    fireEvent.click(row('docs'))
    expect(await screen.findByText('空目录')).toBeTruthy()
  })

  it.each([
    ['permission_denied', '无权限读取此目录'], ['missing', '目录已不存在'], ['unreadable', '读取失败或超时，请稍后重试'], ['timeout', '读取失败或超时，请稍后重试'],
    ['project_unavailable', 'Project 目录不可用'], ['not_directory', '不是目录']
  ] as const)('explains an unreadable directory (%s)', async (reason, text) => {
    fake.setDir('docs', reason)
    render(panel())
    fireEvent.click(await screen.findByRole('treeitem', { name: 'docs' }))
    expect(await screen.findByText(text)).toBeTruthy()
  })

  it('explains a Project directory that is unavailable at the root', async () => {
    fake.setDir('', 'project_unavailable')
    render(panel())
    expect(await screen.findByText('Project 目录不可用')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '添加到对话' })).toBeNull()
  })

  it('marks symbolic links and special files, and does not open them', async () => {
    fake.setDir('', [link('shortcut', '/etc/hosts'), special('pipe'), file('README.md')])
    render(panel())
    await screen.findByRole('treeitem', { name: /shortcut/ })
    expect(row(/shortcut/).textContent).toContain('链接')
    expect(row(/shortcut/).getAttribute('title')).toBe('符号链接 → /etc/hosts（未跟随）')
    expect(row(/pipe/).textContent).toContain('特殊')
    fireEvent.click(row(/shortcut/))
    expect(await screen.findByText('符号链接未跟随，无法查看')).toBeTruthy()
    fireEvent.click(row(/pipe/))
    expect(await screen.findByText('不是普通文件，无法查看')).toBeTruthy()
    expect(fake.mocks.read).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '添加到对话' })).toBeNull()
  })

  it('shows names with control characters visibly', async () => {
    fake.setDir('', [file('line\nbreak.txt'), file('nel\u0085ls\u2028rlo\u202Etxt')])
    render(panel())
    expect(await screen.findByText('line␊break.txt')).toBeTruthy()
    expect(screen.getByText('nel␤ls␤rlo⟦RLO⟧txt')).toBeTruthy()
  })
})

describe('keyboard', () => {
  it('has a single tab stop and moves it with the arrow keys, Home and End', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'src' })
    const stops = () => screen.getAllByRole('treeitem').filter(item => item.getAttribute('tabindex') === '0').map(item => item.textContent)
    expect(stops()).toEqual(['src'])
    row('src').focus()
    fireEvent.keyDown(row('src'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(row('docs'))
    expect(stops()).toEqual(['docs'])
    fireEvent.keyDown(row('docs'), { key: 'End' })
    expect(document.activeElement).toBe(row('README.md'))
    fireEvent.keyDown(row('README.md'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(row('README.md'))
    fireEvent.keyDown(row('README.md'), { key: 'Home' })
    expect(document.activeElement).toBe(row('src'))
    fireEvent.keyDown(row('src'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(row('src'))
    expect(stops()).toEqual(['src'])
  })

  it('expands with ArrowRight, steps into the first child, steps out and collapses with ArrowLeft', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'src' })
    row('src').focus()
    fireEvent.keyDown(row('src'), { key: 'ArrowRight' })
    await screen.findByRole('treeitem', { name: 'a.ts' })
    expect(document.activeElement).toBe(row('src'))
    fireEvent.keyDown(row('src'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(row('sub'))
    fireEvent.keyDown(row('sub'), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(row('src'))
    fireEvent.keyDown(row('src'), { key: 'ArrowLeft' })
    expect(screen.queryByRole('treeitem', { name: 'a.ts' })).toBeNull()
    expect(row('src').getAttribute('aria-expanded')).toBe('false')
    // ArrowRight on a file does nothing.
    fireEvent.keyDown(row('README.md'), { key: 'ArrowRight' })
    expect(fake.mocks.read).not.toHaveBeenCalled()
  })

  it('activates with Enter and Space: a directory toggles, a file opens in the viewer', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'src' })
    fireEvent.keyDown(row('src'), { key: 'Enter' })
    await screen.findByRole('treeitem', { name: 'a.ts' })
    fireEvent.keyDown(row('a.ts'), { key: ' ' })
    expect((await screen.findByTestId('code')).textContent).toBe('const a = 1')
    expect(row('a.ts').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(row('src'), { key: 'Enter' })
    expect(screen.queryByRole('treeitem', { name: 'a.ts' })).toBeNull()
  })

  it('ignores modified keys', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'src' })
    fireEvent.keyDown(row('src'), { key: 'Enter', metaKey: true })
    expect(row('src').getAttribute('aria-expanded')).toBe('false')
  })
})

describe('the viewer', () => {
  it('shows name, size and encoding, and viewing never adds a tag or calls the reference service', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    await open('README.md')
    const viewer = screen.getByRole('region', { name: '文件查看器' })
    expect(within(viewer).getByText('README.md')).toBeTruthy()
    expect(within(viewer).getByText('12 B · UTF-8 · LF')).toBeTruthy()
    expect(screen.getByTestId('code').dataset.key).toBe(`${id}:README.md`)
    expect(screen.getByTestId('code').dataset.active).toBe('true')
    expect(screen.getByRole('button', { name: '添加到对话' })).toBeTruthy()
    expect(addFileReference).not.toHaveBeenCalled()
    expect(fake.mocks.resolveReference).not.toHaveBeenCalled()
    // Opening further files does not add either.
    fireEvent.click(row('docs')); fireEvent.click(await screen.findByRole('treeitem', { name: 'guide.md' }))
    await waitFor(() => expect(fake.mocks.read).toHaveBeenCalledTimes(2))
    expect(addFileReference).not.toHaveBeenCalled()
    expect(fake.mocks.resolveReference).not.toHaveBeenCalled()
  })

  it('shows a skeleton and an accessible status while the file is read, and while the code viewer loads', async () => {
    const pending = deferred<never>()
    fake.mocks.read.mockImplementationOnce(() => pending.promise)
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    fireEvent.click(row('README.md'))
    expect(await screen.findByText('正在读取文件…')).toBeTruthy()
    let release!: () => void
    gate.pending = new Promise<void>(done => { release = done })
    pending.resolve({ status: 'ok', revision: 90, path: 'README.md', version: 'v1', size: 1, encoding: 'utf-8', bom: false, lineEnding: 'none', text: 'x' } as never)
    expect(await screen.findByText('正在加载查看器…')).toBeTruthy()
    expect(screen.queryByTestId('code')).toBeNull()
    await act(async () => { release() })
    expect((await screen.findByTestId('code')).textContent).toBe('x')
    expect(screen.queryByText('正在加载查看器…')).toBeNull()
  })

  const reasons: Record<FileUnavailableReason, string> = {
    invalid_path: '路径无效，无法读取', project_unavailable: 'Project 目录不可用', project_closing: 'Project 正在关闭，暂时无法读取',
    missing: '文件已不存在', not_directory: '路径不是目录', not_file: '不是普通文件，无法查看', symlink_refused: '符号链接未跟随，无法查看',
    excluded: '该路径已被排除，不予显示', permission_denied: '无权限读取此文件', unreadable: '读取失败或超时，请稍后重试',
    timeout: '读取失败或超时，请稍后重试', binary: '二进制文件，不显示内容', too_large: '文件过大，超过 1 MiB 的查看上限',
    unsupported_encoding: '非 UTF-8 编码，无法显示', changed_while_reading: '文件在读取时发生变化，请稍后重试'
  }
  it.each(Object.entries(reasons) as [FileUnavailableReason, string][])('renders the message for %s and no stale text', async (reason, text) => {
    fake.failFile('README.md', reason)
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    fireEvent.click(row('README.md'))
    expect(await screen.findByText(text)).toBeTruthy()
    expect(screen.queryByTestId('code')).toBeNull()
  })

  it('names the size of a file that is too large', async () => {
    fake.mocks.read.mockResolvedValueOnce({ status: 'unavailable', revision: 5, path: 'README.md', reason: 'too_large', size: 3 * 1024 * 1024 } as never)
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    fireEvent.click(row('README.md'))
    expect(await screen.findByText('文件过大（3 MiB），超过 1 MiB 的查看上限')).toBeTruthy()
    expect(screen.getByText('3 MiB')).toBeTruthy()
  })

  it('offers a retry for a transient failure', async () => {
    fake.mocks.read.mockRejectedValueOnce(new Error('ipc'))
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    fireEvent.click(row('README.md'))
    fireEvent.click(await screen.findByRole('button', { name: '重试' }))
    expect((await screen.findByTestId('code')).textContent).toBe('hello readme')
  })

  it('replaces the text with the failure when a refresh fails: stale content is never shown', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    await open('README.md')
    fake.failFile('README.md', 'permission_denied')
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByText('无权限读取此文件')).toBeTruthy()
    expect(screen.queryByTestId('code')).toBeNull()
  })

  it('closes with the close button and clears the selection', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    await open('README.md')
    fireEvent.click(screen.getByRole('button', { name: '关闭查看器' }))
    expect(screen.queryByRole('region', { name: '文件查看器' })).toBeNull()
    expect(screen.queryByRole('button', { name: '添加到对话' })).toBeNull()
    expect(row('README.md').getAttribute('aria-selected')).toBe('false')
  })

  it('keeps a visible notice for a deleted file, clears the tree selection, and replaces it when another file is selected', async () => {
    render(panel())
    fireEvent.click(await screen.findByRole('treeitem', { name: 'src' }))
    fireEvent.click(await screen.findByRole('treeitem', { name: 'a.ts' }))
    await screen.findByTestId('code')
    fake.setDir('src', [dir('sub')])
    fake.removeFile('src/a.ts')
    fake.emitChanged(['src'])
    expect(await screen.findByText('文件已不存在')).toBeTruthy()
    expect(screen.getByText('src/a.ts')).toBeTruthy()
    expect(screen.queryByRole('treeitem', { name: 'a.ts' })).toBeNull()
    expect(screen.getAllByRole('treeitem').some(item => item.getAttribute('aria-selected') === 'true')).toBe(false)
    expect(screen.queryByRole('button', { name: '添加到对话' })).toBeNull()
    fake.emitChanged(['src'])
    await idle()
    expect(screen.getByText('文件已不存在')).toBeTruthy()
    fireEvent.click(row('README.md'))
    expect((await screen.findByTestId('code')).textContent).toBe('hello readme')
    expect(screen.queryByText('文件已不存在')).toBeNull()
  })

  it('updates the shown text when the file changes on disk and keeps the same editor path', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    await open('README.md')
    fake.setFile('README.md', 'changed text')
    fake.emitChanged([''])
    await waitFor(() => expect(screen.getByTestId('code').textContent).toBe('changed text'))
    expect(screen.getByTestId('code').dataset.path).toBe('README.md')
  })

  it('falls back to plain text when the editor throws or reports a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.setFile('README.md', 'BOOM')
    fake.setFile('src/a.ts', 'REPORT')
    render(panel())
    fireEvent.click(await screen.findByRole('treeitem', { name: 'README.md' }))
    expect(await screen.findByText('代码查看器不可用，以纯文本显示')).toBeTruthy()
    expect(screen.getByLabelText('README.md').textContent).toBe('BOOM')
    fireEvent.click(row('src')); fireEvent.click(await screen.findByRole('treeitem', { name: 'a.ts' }))
    expect(await screen.findByText('代码查看器不可用，以纯文本显示')).toBeTruthy()
    expect(screen.getByLabelText('src/a.ts').textContent).toBe('REPORT')
  })

  it('can be resized with the keyboard within its limits', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    expect(screen.queryByRole('separator')).toBeNull()
    await open('README.md')
    const separator = screen.getByRole('separator')
    expect(separator.getAttribute('aria-valuenow')).toBe('45')
    fireEvent.keyDown(separator, { key: 'ArrowDown' })
    expect(separator.getAttribute('aria-valuenow')).toBe('50')
    fireEvent.keyDown(separator, { key: 'ArrowUp' }); fireEvent.keyDown(separator, { key: 'ArrowUp' })
    expect(separator.getAttribute('aria-valuenow')).toBe('40')
    fireEvent.keyDown(separator, { key: 'End' })
    expect(separator.getAttribute('aria-valuenow')).toBe('80')
    fireEvent.keyDown(separator, { key: 'ArrowDown' })
    expect(separator.getAttribute('aria-valuenow')).toBe('80')
    fireEvent.keyDown(separator, { key: 'Home' })
    expect(separator.getAttribute('aria-valuenow')).toBe('20')
  })

  it('resizes by dragging the splitter', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    await open('README.md')
    const body = document.querySelector('.files-body') as HTMLElement
    body.getBoundingClientRect = () => ({ top: 100, height: 400, bottom: 500, left: 0, right: 300, width: 300, x: 0, y: 100, toJSON() {} })
    const separator = screen.getByRole('separator')
    fireEvent.pointerDown(separator, { pointerId: 1 })
    fireEvent.pointerMove(separator, { pointerId: 1, clientY: 300 })
    expect(separator.getAttribute('aria-valuenow')).toBe('50')
    fireEvent.pointerUp(separator, { pointerId: 1 })
    fireEvent.pointerMove(separator, { pointerId: 1, clientY: 140 })
    expect(separator.getAttribute('aria-valuenow')).toBe('50')
  })
})

describe('add to conversation', () => {
  const rejected = (reason: Extract<AddFileReferenceResult, { status: 'rejected' }>['reason']): AddFileReferenceResult => ({ status: 'rejected', reason })
  async function selectReadme() {
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    await open('README.md')
  }

  it('checks the file with the service, adds it to the conversation of the main canvas and announces the result politely', async () => {
    canvas = { mode: 'session', sessionId: 's1' }
    await selectReadme()
    fireEvent.click(screen.getByRole('button', { name: '添加到对话' }))
    const message = await screen.findByText('已添加到对话：README.md')
    expect(message.closest('[aria-live="polite"]')).toBe(announcement())
    expect(fake.mocks.resolveReference).toHaveBeenCalledWith({ projectId: id, paths: ['README.md'] })
    expect(addFileReference).toHaveBeenCalledWith({ projectId: id, canvas, path: 'README.md', type: 'file' })
  })

  it('says so when the file is already in the conversation', async () => {
    vi.mocked(addFileReference).mockResolvedValue({ status: 'duplicate' })
    await selectReadme()
    fireEvent.click(screen.getByRole('button', { name: '添加到对话' }))
    expect(await screen.findByText('已在对话中：README.md')).toBeTruthy()
  })

  it.each([
    ['limit', '一条消息最多引用 20 个文件，未添加'], ['conversation_changed', '当前对话已切换，未添加；请在目标对话中重新添加'],
    ['draft_unavailable', '当前对话的草稿不可用，未添加'], ['invalid_path', '路径无效，未添加']
  ] as const)('explains the rejection %s from the Input module', async (reason, text) => {
    vi.mocked(addFileReference).mockResolvedValue(rejected(reason))
    await selectReadme()
    fireEvent.click(screen.getByRole('button', { name: '添加到对话' }))
    expect(await screen.findByText(text)).toBeTruthy()
    expect(announcement().getAttribute('data-tone')).toBe('warn')
  })

  const failures: Record<FileReferenceFailureReason, string> = {
    invalid_path: '路径无效，无法添加到对话', project_unavailable: 'Project 目录不可用，无法添加到对话', project_closing: 'Project 正在关闭，无法添加到对话',
    missing: '文件已不存在，无法添加到对话', not_file: '不是普通文件，无法添加到对话', symlink_refused: '符号链接未跟随，无法添加到对话',
    excluded: '该路径已被排除，无法添加到对话', permission_denied: '无权限读取此文件，无法添加到对话', unreadable: '读取失败或超时，暂时无法添加到对话，请稍后重试',
    timeout: '读取失败或超时，暂时无法添加到对话，请稍后重试', name_unsupported: '文件名包含控制字符，无法添加到对话；仍可查看内容',
    too_many: '一条消息最多引用 20 个文件'
  }
  it.each(Object.entries(failures) as [FileReferenceFailureReason, string][])('explains the service refusing the reference (%s) and does not add', async (reason, text) => {
    fake.mocks.resolveReference.mockResolvedValueOnce({ status: 'rejected', failures: [{ path: 'README.md', reason }] } as never)
    await selectReadme()
    fireEvent.click(screen.getByRole('button', { name: '添加到对话' }))
    expect(await screen.findByText(text)).toBeTruthy()
    expect(addFileReference).not.toHaveBeenCalled()
  })

  it('does not claim success when the service call fails', async () => {
    fake.mocks.resolveReference.mockRejectedValueOnce(new Error('ipc'))
    await selectReadme()
    fireEvent.click(screen.getByRole('button', { name: '添加到对话' }))
    expect(await screen.findByText('无法确认该文件是否可引用，未添加，请稍后重试')).toBeTruthy()
    expect(addFileReference).not.toHaveBeenCalled()
  })

  it('can view a file whose name has a control character but explains that it cannot be referenced, without any call', async () => {
    fake.setDir('', [file('bad\nname.txt')])
    fake.setFile('bad\nname.txt', 'viewable')
    render(panel())
    fireEvent.click(await screen.findByRole('treeitem', { name: 'bad␊name.txt' }))
    expect((await screen.findByTestId('code')).textContent).toBe('viewable')
    expect(fake.mocks.read).toHaveBeenCalledWith({ projectId: id, path: 'bad\nname.txt' })
    fireEvent.click(screen.getByRole('button', { name: '添加到对话' }))
    expect(await screen.findByText('文件名包含控制字符，无法添加到对话；仍可查看内容')).toBeTruthy()
    expect(fake.mocks.resolveReference).not.toHaveBeenCalled()
    expect(addFileReference).not.toHaveBeenCalled()
  })

  it('is offered for an unreadable or binary file too: a reference is not a content snapshot', async () => {
    fake.failFile('README.md', 'binary')
    render(panel())
    fireEvent.click(await screen.findByRole('treeitem', { name: 'README.md' }))
    await screen.findByText('二进制文件，不显示内容')
    fireEvent.click(screen.getByRole('button', { name: '添加到对话' }))
    expect(await screen.findByText('已添加到对话：README.md')).toBeTruthy()
  })

  it('is disabled while the request is in flight, and the result belongs to the file it was for', async () => {
    const pending = deferred<AddFileReferenceResult>()
    vi.mocked(addFileReference).mockReturnValue(pending.promise)
    await selectReadme()
    fireEvent.click(screen.getByRole('button', { name: '添加到对话' }))
    const busy = await screen.findByRole('button', { name: '正在添加…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(busy)
    await act(async () => { pending.resolve({ status: 'added' }) })
    expect(await screen.findByText('已添加到对话：README.md')).toBeTruthy()
    expect(addFileReference).toHaveBeenCalledTimes(1)
    fireEvent.click(row('docs')); fireEvent.click(await screen.findByRole('treeitem', { name: 'guide.md' }))
    await waitFor(() => expect(screen.getByTestId('code').dataset.path).toBe('docs/guide.md'))
    expect(screen.queryByText('已添加到对话：README.md')).toBeNull()
  })
})

describe('state across hiding and remounting', () => {
  it('keeps expansion, selection and content when hidden, unsubscribes while hidden, and revalidates when shown again', async () => {
    const view = render(panel())
    fireEvent.click(await screen.findByRole('treeitem', { name: 'src' }))
    fireEvent.click(await screen.findByRole('treeitem', { name: 'a.ts' }))
    await screen.findByTestId('code')
    view.rerender(panel(false))
    expect(fake.mocks.unsubscribe).toHaveBeenCalledTimes(1)
    // No editor instance while hidden; the tree and the selection stay.
    expect(screen.queryByTestId('code')).toBeNull()
    expect(row('a.ts').getAttribute('aria-selected')).toBe('true')
    fake.mocks.list.mockClear(); fake.mocks.read.mockClear()
    fake.emitChanged([''], true)
    fake.setFile('src/a.ts', 'changed meanwhile')
    await idle()
    expect(fake.mocks.list).not.toHaveBeenCalled()
    view.rerender(panel(true))
    // The remembered copy is shown at once; the revalidation then brings the new one.
    expect(screen.getByTestId('code').textContent).toBe('const a = 1')
    await waitFor(() => expect(screen.getByTestId('code').textContent).toBe('changed meanwhile'))
    expect(fake.mocks.subscribe).toHaveBeenCalledTimes(2)
    expect(listed().sort()).toEqual(['', 'src'])
    expect(fake.mocks.read).toHaveBeenCalledWith({ projectId: id, path: 'src/a.ts', ifVersion: 'v1' })
  })

  it('restores the tree from memory after an unmount and renders it before any reply arrives', async () => {
    const first = render(panel())
    fireEvent.click(await screen.findByRole('treeitem', { name: 'src' }))
    await screen.findByRole('treeitem', { name: 'a.ts' })
    first.unmount()
    expect(fake.mocks.unsubscribe).toHaveBeenCalledTimes(1)
    const hold = deferred<never>()
    fake.mocks.list.mockImplementation(() => hold.promise)
    render(panel())
    expect(row('src').getAttribute('aria-expanded')).toBe('true')
    expect(row('a.ts')).toBeTruthy()
    expect(screen.queryByText('正在读取…')).toBeNull()
  })

  it('does not keep state or subscriptions for a Project whose tab closed', async () => {
    const view = render(panel())
    await screen.findByRole('treeitem', { name: 'src' })
    store().forget(id)
    view.unmount()
    expect(store().projects[id]).toBeUndefined()
  })
})

describe('watching', () => {
  it('shows the live badge, and 自动刷新不可用 when the watcher is degraded', async () => {
    render(panel())
    expect(await screen.findByText('自动刷新')).toBeTruthy()
    fake.emitWatch('degraded')
    expect(await screen.findByText('自动刷新不可用')).toBeTruthy()
    fake.emitWatch('live')
    expect(await screen.findByText('自动刷新')).toBeTruthy()
  })

  it('shows 自动刷新不可用 from the start when the subscription is degraded or fails', async () => {
    fake.mocks.subscribe.mockRejectedValue(new Error('too many watchers'))
    render(panel())
    expect(await screen.findByText('自动刷新不可用')).toBeTruthy()
  })

  it('refreshes when the window regains focus while auto refresh is unavailable, but not while it is live', async () => {
    render(panel())
    await screen.findByText('自动刷新')
    fake.mocks.list.mockClear()
    window.dispatchEvent(new Event('focus'))
    await idle()
    expect(fake.mocks.list).not.toHaveBeenCalled()
    fake.emitWatch('degraded')
    await screen.findByText('自动刷新不可用')
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(listed()).toEqual(['']))
    window.dispatchEvent(new Event('focus'))
    await idle()
    expect(listed()).toEqual([''])
  })

  it('does not listen for focus while hidden', async () => {
    fake.setSubscribeWatch('degraded')
    const view = render(panel())
    await screen.findByText('自动刷新不可用')
    view.rerender(panel(false))
    fake.mocks.list.mockClear()
    window.dispatchEvent(new Event('focus'))
    await idle()
    expect(fake.mocks.list).not.toHaveBeenCalled()
  })

  it('refreshes the tree and the open file from the header button', async () => {
    render(panel())
    await screen.findByRole('treeitem', { name: 'README.md' })
    await open('README.md')
    fake.mocks.list.mockClear(); fake.mocks.read.mockClear()
    fake.setDir('', [file('README.md'), file('new.md')])
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByRole('treeitem', { name: 'new.md' })).toBeTruthy()
    expect(screen.queryByRole('treeitem', { name: 'src' })).toBeNull()
    expect(fake.mocks.read).toHaveBeenCalledWith({ projectId: id, path: 'README.md', ifVersion: 'v1' })
  })
})
