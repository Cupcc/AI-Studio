import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { use } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiffAvailability, DiffFileResult } from '@shared/tools/diff'
import { diffApi } from './api'
import { DiffPanel } from './DiffPanel'
import { useDiff } from './diff-store'
import { deferred, entry, fakeDiffApi, okFile, snapshot, type FakeDiff } from './diff-fixtures'

vi.mock('./api', () => ({ diffApi: vi.fn() }))
// The code viewer stands in for Monaco: it suspends until the test releases it, records its props, or fails to load.
const gate = vi.hoisted(() => ({ promise: null as Promise<void> | null, release: () => {}, fail: false, props: [] as Record<string, unknown>[] }))
vi.mock('../code/lazy', () => ({
  LazyCodeDiffViewer: (props: Record<string, unknown>) => {
    if (gate.fail) throw new Error('chunk failed to load')
    use(gate.promise!)
    gate.props.push(props)
    return <div data-testid="viewer">{String(props.path)}</div>
  },
  LazyCodeViewer: () => null
}))

let fake: FakeDiff
const text = () => document.body.textContent ?? ''
const show = (active = true) => render(<DiffPanel projectId="p" active={active} />)
const list = () => screen.findByRole('listbox', { name: '变更文件' })
const optionNamed = (name: RegExp | string) => screen.getByRole('option', { name })
const openFile = async (path: RegExp | string, result?: DiffFileResult) => {
  if (result) vi.mocked(fake.api.getFile).mockResolvedValueOnce(result)
  await list()
  fireEvent.click(optionNamed(path))
}
beforeEach(() => {
  useDiff.getState().forget('p'); useDiff.setState({ projects: {} })
  fake = fakeDiffApi(); vi.mocked(diffApi).mockReturnValue(fake.api)
  fake.api.onInvalidated(event => useDiff.getState().handleInvalidated(event)); fake.api.onWatchChanged(event => useDiff.getState().handleWatchChanged(event))
  gate.fail = false; gate.props = []
  gate.promise = new Promise<void>(done => { gate.release = done })
})
afterEach(async () => { cleanup(); await act(async () => {}); useDiff.getState().forget('p'); vi.restoreAllMocks() })

describe('file list', () => {
  const files = [
    entry('src/ui/a.ts', { additions: 12, deletions: 3 }),
    entry('docs/new.md', { kind: 'added', untracked: true, additions: 5, deletions: 0, oldMode: null }),
    entry('old.ts', { kind: 'deleted', additions: 0, deletions: 7, newMode: null }),
    entry('lib/renamed.ts', { kind: 'renamed', oldPath: 'lib/orig.ts', additions: 1, deletions: 0, renameScore: 90 }),
    entry('run.sh', { additions: 0, deletions: 0, newMode: '100755' }),
    entry('img.png', { kind: 'added', binary: true, additions: null, deletions: null }),
    entry('link', { kind: 'typechange', special: 'symlink', additions: null, deletions: null })
  ]

  it('shows the baseline, the totals and one row per file with badge, dimmed directory, counts and markers', async () => {
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files }))
    const view = show()
    await list()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('项目变更 · 相对 HEAD (main @ abc1234)')
    expect(text()).toContain('7 个文件')
    expect(view.container.querySelector('.diff-header__sums')?.textContent).toBe('+18\u221210')
    expect([...view.container.querySelectorAll('.diff-badge')].map(node => node.textContent)).toEqual(['M', 'A', 'D', 'R', 'M', 'A', 'T'])
    const first = optionNamed(/src\/ui\/a\.ts/)
    expect(first.querySelector('.diff-row__name')?.textContent).toBe('a.ts')
    expect(first.querySelector('.diff-row__dir')?.textContent).toBe('src/ui')
    expect(first.querySelector('.diff-count--add')?.textContent).toBe('+12')
    expect(first.querySelector('.diff-count--del')?.textContent).toBe('−3')
    expect(optionNamed(/lib\/renamed\.ts/).textContent).toContain('lib/orig.ts → lib/renamed.ts')
    expect(screen.getAllByText('未跟踪')).toHaveLength(1)
    expect(optionNamed(/run\.sh/).textContent).toContain('仅模式变化')
    expect(optionNamed(/img\.png/).textContent).toContain('二进制')
    expect(optionNamed(/link/).textContent).toContain('符号链接')
  })

  it('makes path controls visible while requesting the original renamed path', async () => {
    const path = 'dir\u2028/new\u202ename.ts', oldPath = 'old\nname.ts'
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [entry(path, { kind: 'renamed', oldPath })] }))
    show()
    await list()
    const row = optionNamed('重命名，old␊name.ts → dir␤/new⟦RLO⟧name.ts，新增 2 行，删除 1 行')
    expect(row.getAttribute('title')).toBe('dir␤/new⟦RLO⟧name.ts')
    expect(row.textContent).toContain('old␊name.ts → dir␤/new⟦RLO⟧name.ts')
    fireEvent.click(row)
    await waitFor(() => expect(fake.api.getFile).toHaveBeenCalledWith({ projectId: 'p', path, oldPath }))
    expect(screen.getByRole('region', { name: 'dir␤/new⟦RLO⟧name.ts 的变更' })).toBeTruthy()
  })

  it('moves focus with the arrow keys, Home and End, and opens a file only on Enter or Space', async () => {
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [entry('a.ts'), entry('b.ts'), entry('c.ts')] }))
    show()
    await list()
    const [a, b, c] = ['a.ts', 'b.ts', 'c.ts'].map(name => optionNamed(new RegExp(name)))
    expect([a, b, c].map(node => node!.tabIndex)).toEqual([0, -1, -1])
    a!.focus()
    fireEvent.keyDown(a!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(b)
    expect([a, b, c].map(node => node!.tabIndex)).toEqual([-1, 0, -1])
    fireEvent.keyDown(b!, { key: 'End' })
    expect(document.activeElement).toBe(c)
    fireEvent.keyDown(c!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(c)
    fireEvent.keyDown(c!, { key: 'Home' })
    expect(document.activeElement).toBe(a)
    fireEvent.keyDown(a!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(a)
    expect(fake.api.getFile).not.toHaveBeenCalled()
    fireEvent.keyDown(a!, { key: 'ArrowDown' })
    fireEvent.keyDown(b!, { key: 'Enter' })
    await waitFor(() => expect(fake.api.getFile).toHaveBeenCalledWith({ projectId: 'p', path: 'b.ts', oldPath: null }))
    expect(b!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(b!, { key: 'ArrowDown' })
    fireEvent.keyDown(c!, { key: ' ' })
    await waitFor(() => expect(fake.api.getFile).toHaveBeenCalledWith({ projectId: 'p', path: 'c.ts', oldPath: null }))
  })

  it('explains the truncated list and a Project that is a subdirectory of the repository', async () => {
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [entry('a.ts')], truncated: true, repoPrefix: 'apps/web' }))
    show()
    await list()
    expect(text()).toContain('变更文件过多，只显示前 1 个。')
    expect(text()).toContain('apps/web')
    expect(text()).toContain('只显示该目录内的变更')
    expect(text()).toContain('显示前 1 个文件')
  })

  it('says plainly that files are still changing, and shows the badge when the watcher is not available', async () => {
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ settled: false }))
    show()
    await list()
    expect(text()).toContain('文件仍在变化，结果可能不是最终状态')
    expect(screen.queryByText('自动刷新不可用')).toBeNull()
    act(() => fake.watchChanged({ projectId: 'p', revision: 5, watch: 'degraded' }))
    expect(screen.getByText('自动刷新不可用')).toBeTruthy()
    act(() => fake.watchChanged({ projectId: 'p', revision: 6, watch: 'live' }))
    await waitFor(() => expect(screen.queryByText('自动刷新不可用')).toBeNull())
  })
})

describe('availability states', () => {
  const cases: [Exclude<DiffAvailability, 'ready' | 'no_head'>, string][] = [
    ['clean', '没有未提交变更'], ['not_git', '此目录不是 Git 仓库'], ['git_missing', '未检测到 Git'],
    ['git_unsafe_directory', 'Git 不信任此目录'], ['timeout', '读取变更超时'], ['failed', '无法读取变更'],
    ['project_unavailable', '项目目录不可用'], ['project_closing', '项目正在关闭']
  ]
  it.each(cases)('renders a message for %s', async (status, title) => {
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ status, files: [], head: status === 'clean' ? snapshot().head : null }))
    show()
    await screen.findByRole('heading', { level: 3, name: title })
    expect(screen.queryByRole('listbox')).toBeNull()
    // Only a clean working tree may say that nothing is uncommitted.
    expect(text().includes('没有未提交变更')).toBe(status === 'clean')
    if (status !== 'clean' && status !== 'project_closing') expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })

  it('shows the sanitized detail of a failure and the guidance for git_unsafe_directory and git_missing', async () => {
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ status: 'failed', files: [], detail: 'fatal: bad object HEAD' }))
    show()
    await screen.findByText('fatal: bad object HEAD')
    cleanup(); useDiff.getState().forget('p'); useDiff.setState({ projects: {} })
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ status: 'git_unsafe_directory', files: [] }))
    show()
    await screen.findByText('Git 不信任此目录')
    expect(text()).toContain('safe.directory')
    expect(text()).toContain('不会代你修改 Git 配置')
    cleanup(); useDiff.getState().forget('p'); useDiff.setState({ projects: {} })
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ status: 'git_missing', files: [] }))
    show()
    await screen.findByText('未检测到 Git')
    expect(text()).toContain('brew install git')
  })

  it('retries from the message', async () => {
    vi.mocked(fake.api.getSnapshot).mockResolvedValueOnce(snapshot({ status: 'timeout', files: [], revision: 1 })).mockResolvedValue(snapshot({ revision: 2 }))
    show()
    fireEvent.click(await screen.findByRole('button', { name: '重试' }))
    await list()
    expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2)
  })

  describe('wording guard: no baseline is never "no changes"', () => {
    const forbidden = ['没有变更', '没有未提交变更']
    const noHeadFiles = [entry('README.md', { kind: 'added', untracked: true, additions: 3, deletions: 0 }), entry('src/main.ts', { kind: 'added', untracked: true, additions: 9, deletions: 0 })]

    it('no_head explains the missing baseline and lists the files as new', async () => {
      vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ status: 'no_head', head: null, files: noHeadFiles }))
      show()
      await list()
      expect(text()).toContain('还没有首个提交，基线（HEAD）不可用')
      expect(text()).toContain('按新增显示')
      expect(text()).toContain('不会替你创建提交或仓库')
      expect(screen.getAllByRole('option')).toHaveLength(2)
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('项目变更 · HEAD 不可用（尚无首个提交）')
      // Every file is untracked in that case: a marker on each row would say nothing.
      expect(screen.queryByText('未跟踪')).toBeNull()
      for (const phrase of forbidden) expect(text()).not.toContain(phrase)
    })

    it('no_head without any file still does not say "no changes"', async () => {
      vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ status: 'no_head', head: null, files: [] }))
      show()
      await screen.findByText('还没有首个提交，目录中也没有可列出的文件')
      for (const phrase of forbidden) expect(text()).not.toContain(phrase)
    })

    it('not_git explains it, suggests git init in the Terminal and says the client never initializes Git', async () => {
      vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ status: 'not_git', head: null, files: [] }))
      show()
      await screen.findByText('此目录不是 Git 仓库')
      expect(screen.getByText('git init').tagName).toBe('CODE')
      expect(text()).toContain('在 Terminal 中自行运行')
      expect(text()).toContain('本客户端不会自动初始化 Git')
      for (const phrase of forbidden) expect(text()).not.toContain(phrase)
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('项目变更')
    })

    it('the single-file view of an unavailable file in a repository without HEAD keeps the wording', async () => {
      vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ status: 'no_head', head: null, files: noHeadFiles }))
      show()
      await openFile(/README\.md/, { status: 'unavailable', revision: 200, path: 'README.md', availability: 'no_head' })
      await screen.findAllByText('还没有首个提交，基线（HEAD）不可用')
      for (const phrase of forbidden) expect(text()).not.toContain(phrase)
    })
  })
})

describe('loading, refreshing and failure never pass stale content off as current', () => {
  it('shows a loading message before the first snapshot and no list', async () => {
    const first = deferred<ReturnType<typeof snapshot>>()
    vi.mocked(fake.api.getSnapshot).mockReturnValueOnce(first.promise)
    show()
    await screen.findByText('正在读取项目变更…')
    expect(screen.queryByRole('listbox')).toBeNull()
    await act(async () => first.resolve(snapshot()))
    await list()
    expect(screen.queryByText('正在读取项目变更…')).toBeNull()
  })

  it('marks a refresh in progress and keeps the previous list only while it is marked', async () => {
    show()
    await list()
    const next = deferred<ReturnType<typeof snapshot>>()
    vi.mocked(fake.api.getSnapshot).mockReturnValueOnce(next.promise)
    fireEvent.click(screen.getByRole('button', { name: '刷新项目变更' }))
    await screen.findByText('正在刷新…')
    expect(document.querySelector('.diff-body')?.getAttribute('aria-busy')).toBe('true')
    await act(async () => next.resolve(snapshot({ revision: 5, files: [entry('only.ts')] })))
    await waitFor(() => expect(screen.queryByText('正在刷新…')).toBeNull())
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(document.querySelector('.diff-body')?.getAttribute('aria-busy')).toBe('false')
  })

  it('reports a failed refresh, labels the old list as possibly outdated and recovers on retry', async () => {
    show()
    await list()
    vi.mocked(fake.api.getSnapshot).mockRejectedValueOnce(new Error("Error invoking remote method 'diff:get-snapshot': Error: ipc down"))
    fireEvent.click(screen.getByRole('button', { name: '刷新项目变更' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('无法读取项目变更：ipc down')
    expect(alert.textContent).toContain('可能已过期')
    expect(document.querySelector('.diff-list')?.classList.contains('is-stale')).toBe(true)
    fireEvent.click(within(alert).getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(document.querySelector('.diff-list')?.classList.contains('is-stale')).toBe(false)
  })

  it('shows only the failure when the very first query fails', async () => {
    vi.mocked(fake.api.getSnapshot).mockRejectedValueOnce(new Error('ipc down'))
    show()
    await screen.findByText('无法读取项目变更：ipc down')
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await list()
  })

  it('tells the user that a selected file no longer differs, and the notice can be dismissed', async () => {
    vi.mocked(fake.api.getSnapshot).mockResolvedValueOnce(snapshot({ revision: 1, files: [entry('a.ts'), entry('b.ts')] })).mockResolvedValueOnce(snapshot({ revision: 2, files: [entry('b.ts')] }))
    show()
    await openFile(/a\.ts/)
    await screen.findByRole('region', { name: 'a.ts 的变更' })
    fireEvent.click(screen.getByRole('button', { name: '刷新项目变更' }))
    await screen.findByText(/已没有变更，已取消选择/)
    expect(screen.queryByRole('region', { name: 'a.ts 的变更' })).toBeNull()
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '知道了' }))
    expect(screen.queryByText(/已没有变更，已取消选择/)).toBeNull()
  })
})

describe('active gating', () => {
  it('makes no call while inactive, subscribes and queries when it becomes active, releases when hidden', async () => {
    const view = show(false)
    await act(async () => {})
    window.dispatchEvent(new Event('focus'))
    for (const method of ['getSnapshot', 'getFile', 'subscribe', 'unsubscribe'] as const) expect(fake.api[method]).not.toHaveBeenCalled()
    expect(screen.getByText('切换到 Diff 后读取项目变更。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '刷新项目变更' }).hasAttribute('disabled')).toBe(true)

    view.rerender(<DiffPanel projectId="p" active />)
    await list()
    expect(fake.api.subscribe).toHaveBeenCalledTimes(1)
    expect(fake.api.getSnapshot).toHaveBeenCalledTimes(1)

    view.rerender(<DiffPanel projectId="p" active={false} />)
    expect(fake.api.unsubscribe).toHaveBeenCalledWith({ projectId: 'p', subscriptionId: 's1' })
    window.dispatchEvent(new Event('focus'))
    fake.invalidated({ projectId: 'p', revision: 9 })
    await act(async () => {})
    expect(fake.api.getSnapshot).toHaveBeenCalledTimes(1)
    // The state survives the hide: coming back shows it at once and re-queries.
    view.rerender(<DiffPanel projectId="p" active />)
    expect(screen.getByRole('listbox', { name: '变更文件' })).toBeTruthy()
    await waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2))
  })

  it('does not mount a code viewer while hidden', async () => {
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot())
    gate.release()
    const view = show()
    await openFile(/a\.ts/)
    await screen.findByTestId('viewer')
    view.rerender(<DiffPanel projectId="p" active={false} />)
    expect(screen.queryByTestId('viewer')).toBeNull()
    expect(screen.getByText('回到 Diff 后显示代码视图。')).toBeTruthy()
  })

  it('re-queries when the window regains focus and on the refresh button', async () => {
    show()
    await list()
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('正在刷新…')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: '刷新项目变更' }))
    await waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(3))
  })

  it('re-queries when the service says something changed', async () => {
    show()
    await list()
    act(() => fake.invalidated({ projectId: 'p', revision: 20 }))
    await waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2))
  })

  it('keeps the state of a Project across unmount and mount', async () => {
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [entry('a.ts'), entry('b.ts')] }))
    const view = show()
    await openFile(/b\.ts/)
    await screen.findByRole('region', { name: 'b.ts 的变更' })
    view.unmount()
    show()
    expect(screen.getByRole('region', { name: 'b.ts 的变更' })).toBeTruthy()
    expect(optionNamed(/b\.ts/).getAttribute('aria-selected')).toBe('true')
  })
})

describe('single-file view', () => {
  it('shows the fallback while the code viewer loads, then both sides with a key that keeps the scroll position', async () => {
    show()
    await openFile(/a\.ts/)
    await screen.findByText('正在加载代码视图…')
    expect(screen.queryByTestId('viewer')).toBeNull()
    await act(async () => gate.release())
    await screen.findByTestId('viewer')
    expect(screen.queryByText('正在加载代码视图…')).toBeNull()
    expect(gate.props.at(-1)).toEqual({ path: 'src/a.ts', original: 'old', modified: 'new', active: true, viewStateKey: 'p:src/a.ts', sideBySide: true, hideUnchanged: true })
  })

  it('compares an added file with empty content and a deleted file the other way round', async () => {
    gate.release()
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [entry('new.ts', { kind: 'added' }), entry('gone.ts', { kind: 'deleted' })] }))
    show()
    await openFile(/new\.ts/, okFile('new.ts', 300, { entry: entry('new.ts', { kind: 'added' }), original: { status: 'absent' } }))
    await screen.findByTestId('viewer')
    expect(gate.props.at(-1)).toMatchObject({ path: 'new.ts', original: '', modified: 'new' })
    vi.mocked(fake.api.getFile).mockResolvedValueOnce(okFile('gone.ts', 301, { entry: entry('gone.ts', { kind: 'deleted' }), modified: { status: 'absent' } }))
    fireEvent.click(optionNamed(/gone\.ts/))
    await waitFor(() => expect(gate.props.at(-1)).toMatchObject({ path: 'gone.ts', original: 'old', modified: '' }))
  })

  it('never shows the previous file while the next one loads', async () => {
    gate.release()
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [entry('a.ts'), entry('b.ts')] }))
    show()
    await openFile(/a\.ts/)
    await screen.findByTestId('viewer')
    const next = deferred<DiffFileResult>()
    vi.mocked(fake.api.getFile).mockReturnValueOnce(next.promise)
    fireEvent.click(optionNamed(/b\.ts/))
    await screen.findByText('正在读取文件变更…')
    expect(screen.queryByTestId('viewer')).toBeNull()
    await act(async () => next.resolve(okFile('b.ts', 400)))
    await waitFor(() => expect(gate.props.at(-1)).toMatchObject({ path: 'b.ts' }))
  })

  it('falls back to the stored patch when the code viewer cannot load', async () => {
    gate.fail = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    show()
    await openFile(/a\.ts/)
    await screen.findByText('代码视图加载失败，改为显示补丁。')
    expect(screen.getByLabelText('补丁内容').textContent).toContain('+new')
  })

  it('shows a mode change and an unchanged content without opening an editor', async () => {
    gate.release()
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [entry('run.sh', { additions: 0, deletions: 0, newMode: '100755' })] }))
    show()
    const same = { status: 'text', text: '#!/bin/sh\n', size: 10 } as const
    await openFile(/run\.sh/, okFile('run.sh', 300, { entry: entry('run.sh', { additions: 0, deletions: 0, newMode: '100755' }), original: same, modified: same, patch: null }))
    await screen.findByText('文件模式：100644 → 100755')
    expect(within(screen.getByRole('region', { name: 'run.sh 的变更' })).getByText('仅模式变化')).toBeTruthy()
    expect(screen.queryByTestId('viewer')).toBeNull()
  })

  it('warns when the file result is not settled', async () => {
    gate.release()
    show()
    await openFile(/a\.ts/, okFile('src/a.ts', 300, { settled: false }))
    await screen.findByText('文件仍在变化，结果可能不是最终状态', { selector: '.diff-note' })
  })

  it('closes the file view without losing the list', async () => {
    gate.release()
    show()
    await openFile(/a\.ts/)
    await screen.findByRole('region', { name: 'src/a.ts 的变更' })
    fireEvent.click(screen.getByRole('button', { name: '关闭文件变更' }))
    expect(screen.queryByRole('region', { name: 'src/a.ts 的变更' })).toBeNull()
    expect(screen.getByText('选择一个文件查看变更。')).toBeTruthy()
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  describe('patch-only views', () => {
    const omitted = (reason: 'binary' | 'too_large' | 'symlink' | 'submodule' | 'unsupported_encoding' | 'unreadable' | 'changed_while_reading', size?: number) => ({ status: 'omitted', reason, ...(size === undefined ? {} : { size }) } as const)
    const patch = '@@ -1,2 +1,2 @@\n keep\n-removed\n+added\n'
    const cases = [
      ['binary', entry('img.png', { binary: true, additions: null, deletions: null }), omitted('binary'), omitted('binary'), '二进制文件，不显示文本对比。'],
      ['too large', entry('big.json'), omitted('too_large', 3 * 1_048_576), omitted('too_large', 3 * 1_048_576), '文件过大（3.0 MiB），超过两侧对比的显示上限。'],
      ['symlink', entry('link', { kind: 'typechange', special: 'symlink' }), omitted('symlink'), omitted('symlink'), '符号链接：只显示补丁，不跟随链接目标。'],
      ['submodule', entry('vendor/lib', { special: 'submodule' }), omitted('submodule'), omitted('submodule'), '子模块：只显示补丁，不展开子模块内容。'],
      ['encoding', entry('legacy.txt'), { status: 'text', text: 'x', size: 1 } as const, omitted('unsupported_encoding'), '修改后：文件不是 UTF-8 编码，无法按文本对比。'],
      ['unreadable', entry('locked.txt'), omitted('unreadable'), { status: 'text', text: 'x', size: 1 } as const, '修改前：无法读取文件内容。'],
      ['changing', entry('busy.log'), omitted('changed_while_reading'), omitted('changed_while_reading'), '读取时文件仍在变化，请稍后刷新。']
    ] as const
    it.each(cases)('%s: shows the reason and the stored patch instead of two sides', async (_name, fileEntry, original, modified, note) => {
      gate.release()
      vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [fileEntry] }))
      show()
      await openFile(new RegExp(fileEntry.path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')), okFile(fileEntry.path, 300, { entry: fileEntry, original, modified, patch: { text: patch, truncated: false } }))
      await screen.findByText(note)
      expect(screen.queryByTestId('viewer')).toBeNull()
      const pre = screen.getByLabelText('补丁内容')
      expect(pre.textContent).toBe(patch.split('\n').slice(0, -1).join('\n') + '\n')
      const lines = [...pre.querySelectorAll('.diff-patch__line')].map(line => line.className.replace('diff-patch__line diff-patch__line--', ''))
      expect(lines).toEqual(['hunk', 'context', 'del', 'add'])
    })

    it('says so when the patch was cut off and when there is nothing to show', async () => {
      gate.release()
      const binary = entry('a.bin', { binary: true, additions: null, deletions: null })
      vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [binary] }))
      show()
      await openFile(/a\.bin/, okFile('a.bin', 300, { entry: binary, original: omitted('binary'), modified: omitted('binary'), patch: { text: patch, truncated: true } }))
      await screen.findByText('补丁过大，已截断，只显示开头部分。')
    })

    it('shows the reason alone when there is no patch', async () => {
      gate.release()
      const binary = entry('a.bin', { binary: true, additions: null, deletions: null })
      vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [binary] }))
      show()
      await openFile(/a\.bin/, okFile('a.bin', 300, { entry: binary, original: omitted('binary'), modified: omitted('binary'), patch: null }))
      await screen.findByText('二进制文件，不显示文本对比。')
      expect(screen.getByText('没有可显示的内容。')).toBeTruthy()
      expect(screen.queryByLabelText('补丁内容')).toBeNull()
    })

    it('renders at most a bounded number of patch lines', async () => {
      gate.release()
      const long = '@@ -1 +1 @@\n' + Array.from({ length: 5000 }, (_, i) => `+line ${i}`).join('\n') + '\n'
      const big = entry('big.txt', { binary: true, additions: null, deletions: null })
      vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [big] }))
      show()
      await openFile(/big\.txt/, okFile('big.txt', 300, { entry: big, original: omitted('too_large', 9e6), modified: omitted('too_large', 9e6), patch: { text: long, truncated: false } }))
      await screen.findByLabelText('补丁内容')
      expect(document.querySelectorAll('.diff-patch__line')).toHaveLength(4000)
      expect(screen.getByText('补丁较长，已省略其余 1001 行。')).toBeTruthy()
    })
  })

  it('says a file has no changes any more', async () => {
    vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [entry('a.ts'), entry('b.ts')] }))
    show()
    await openFile(/a\.ts/, { status: 'unchanged', revision: 300, path: 'a.ts' })
    await screen.findByText('该文件已无变更')
    expect(screen.queryByTestId('viewer')).toBeNull()
  })

  it('shows an unavailable file result with its reason', async () => {
    show()
    await openFile(/a\.ts/, { status: 'unavailable', revision: 300, path: 'src/a.ts', availability: 'git_unsafe_directory' })
    await screen.findByText('Git 不信任此目录')
    expect(screen.queryByTestId('viewer')).toBeNull()
  })

  it('reports a failed read, drops the old content and reads again on retry', async () => {
    gate.release()
    show()
    await openFile(/a\.ts/)
    await screen.findByTestId('viewer')
    vi.mocked(fake.api.getFile).mockRejectedValueOnce(new Error('git timed out'))
    fireEvent.click(screen.getByRole('button', { name: '刷新项目变更' }))
    const alert = await screen.findByText('无法读取该文件的变更：git timed out')
    expect(alert).toBeTruthy()
    expect(screen.queryByTestId('viewer')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: '重试' }).at(-1)!)
    await screen.findByTestId('viewer')
  })

  it('resizes the list and the file view from the keyboard within bounds', async () => {
    gate.release()
    show()
    await openFile(/a\.ts/)
    const splitter = await screen.findByRole('separator', { name: '调整文件列表与文件变更的高度' })
    expect(splitter.getAttribute('aria-valuenow')).toBe('40')
    fireEvent.keyDown(splitter, { key: 'ArrowDown' })
    expect(splitter.getAttribute('aria-valuenow')).toBe('45')
    for (let i = 0; i < 20; i++) fireEvent.keyDown(splitter, { key: 'ArrowUp' })
    expect(splitter.getAttribute('aria-valuenow')).toBe('15')
    expect(useDiff.getState().projects.p?.listRatio).toBe(0.15)
    expect(document.querySelector<HTMLElement>('.diff-split__list')?.style.flexBasis).toBe('15%')
  })
})
