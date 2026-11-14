import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemSnapshot, SessionSummary, TranscriptItem } from '@shared/session/types'
import { useProjectShell } from '../project/store'
import { useDisclosure } from './disclosure'
import { describeStep, firstLine, groupLabel, liveLabel } from './steps'
import { useSessions } from './store'
import { TurnView } from './TurnView'
import { buildTurns, type StepItem } from './turns'

let sequence = 0
const base = () => ({ id: `i${++sequence}`, sessionId: 's', turnId: 't', sequence, at: sequence * 1000 })
const user = (text = 'Change the timeout'): TranscriptItem => ({ ...base(), kind: 'user_message', text, contextItems: [] })
const agent = (text: string, patch: Partial<Extract<TranscriptItem, { kind: 'agent_message' }>> = {}): TranscriptItem => ({ ...base(), kind: 'agent_message', text, complete: true, nativeItemId: `n${sequence}`, ...patch })
const step = (item: Partial<ItemSnapshot>, seconds = 0): StepItem => {
  const fields = base()
  return { ...fields, kind: 'tool_activity', item: { itemId: fields.id, kind: 'command', status: 'completed', ...item }, ...(item.status === 'in_progress' ? {} : { endedAt: fields.at + seconds * 1000 }) }
}
const thinking = (text: string, status: ItemSnapshot['status'] = 'completed') => step({ kind: 'reasoning', status, text })
const read = (path: string) => step({ activity: { verb: 'read', label: `sed -n 1,80p ${path}`, target: path }, command: { command: `sed -n 1,80p ${path}`, output: 'content' } })
const search = (query: string) => step({ activity: { verb: 'search', label: `rg ${query}`, target: query }, command: { command: `rg ${query}` } })
const run = (line: string, exitCode = 0, seconds = 0) => step({ status: exitCode ? 'failed' : 'completed', activity: { verb: 'run', label: line, target: line }, command: { command: line, exitCode, output: exitCode ? 'FAIL one test' : 'all passed' } }, seconds)
const edit = (files: NonNullable<ItemSnapshot['files']>) => step({ kind: 'file_change', activity: { verb: 'edit', label: files.map(file => file.path).join(', ') }, files })
const end = (patch: Partial<Extract<TranscriptItem, { kind: 'turn_end' }>> = {}): TranscriptItem => ({ ...base(), kind: 'turn_end', outcome: 'completed', durationMs: 138_000, ...patch })
const request = (resolved: boolean): TranscriptItem => ({ ...base(), kind: 'input_request', resolution: resolved ? { status: 'answered', response: { kind: 'approval', optionId: 'allow' } } : null,
  request: { requestId: `r${sequence}`, turnId: 't', createdAt: 0, kind: 'approval', nativeType: 'x', subject: 'command', title: 'Run the tests?', allowsMessage: false, options: [{ id: 'allow', label: 'Allow once', intent: 'allow' }] } })

const summary = (patch: Partial<SessionSummary> = {}): SessionSummary => ({ id: 's', projectId: 'p', cli: 'codex', nativeSessionId: 'native', title: 'T', titleSource: 'client', model: null, originViewId: null, activity: 'none', stopping: false, errorUnseen: false, completionUnread: false, status: null, createdAt: 0, updatedAt: 0, lastUserMessageAt: 0, ...patch })
const sessions = useSessions.getState(), shell = useProjectShell.getState()

beforeEach(() => {
  sequence = 0
  useDisclosure.setState({ open: {} })
  useSessions.setState({ ...sessions, summaries: { s: summary() } }, true)
  useProjectShell.setState({ ...shell, projects: { p: { id: 'p', name: 'Project', canonicalPath: '/work/app', localPath: '/work/app', displayPath: '~/app', createdAt: '', lastOpenedAt: '' } } }, true)
})
afterEach(() => { cleanup(); vi.useRealTimers(); Reflect.deleteProperty(navigator, 'clipboard') })

function renderTurn(items: TranscriptItem[], patch: Partial<SessionSummary> = {}) {
  const block = buildTurns(items).at(-1)!
  const state = summary(patch)
  return { block, ...render(<TurnView block={block} summary={state} live={state.activity !== 'none'} />) }
}

describe('Turn model · Shell Spec v02 §6 · session spec §3.2', () => {
  it('opens a block at every user message, including input sent while a turn runs', () => {
    const blocks = buildTurns([user(), read('a.ts'), user('Also update the test'), run('pnpm test'), agent('Done.'), end()])
    expect(blocks.map(block => [block.user?.text, block.steps, block.answers.length, !!block.end])).toEqual([['Change the timeout', 1, 0, false], ['Also update the test', 1, 1, true]])
  })

  it('treats text before the last step as commentary and text after it as the reply', () => {
    const [block] = buildTurns([user(), agent('I will look at the constant first.'), read('a.ts'), agent('The timeout is now 15 seconds.'), end()])
    expect(block!.entries.map(entry => entry.type)).toEqual(['commentary', 'step'])
    expect(block!.answers.map(answer => answer.text)).toEqual(['The timeout is now 15 seconds.'])
  })

  it('lets the CLI label override position, and still shows a reply when a finished turn has none labelled', () => {
    const labelled = buildTurns([user(), agent('The answer.', { phase: 'final_answer' }), read('a.ts'), agent('Checked afterwards.', { phase: 'commentary' }), end()])[0]!
    expect(labelled.answers.map(answer => answer.text)).toEqual(['The answer.'])
    expect(labelled.entries.map(entry => entry.type)).toEqual(['step', 'commentary'])
    const closing = buildTurns([user(), read('a.ts'), agent('Only commentary.', { phase: 'commentary' }), end()])[0]!
    expect(closing.answers.map(answer => answer.text)).toEqual(['Only commentary.'])
    const spanning = buildTurns([user(), agent('Said before the request.'), request(true), end()])[0]!
    expect(spanning.answers.map(answer => answer.text)).toEqual(['Said before the request.'])
    const stopped = (closing: TranscriptItem[]) => buildTurns([user(), agent('Looking.', { phase: 'commentary' }), read('a.ts'), ...closing, end({ outcome: 'interrupted' })])[0]!.answers.map(answer => answer.text)
    expect(stopped([])).toEqual([])
    expect(stopped([agent('The timeout is', { complete: false })])).toEqual(['The timeout is'])
  })

  it('keeps streaming text as commentary once a later step starts, and drops thinking that has nothing to show', () => {
    const running = buildTurns([user(), agent('Looking into it', { complete: false }), read('a.ts')])[0]!
    expect(running.answers).toEqual([])
    expect(running.entries.map(entry => entry.type)).toEqual(['commentary', 'step'])
    const block = buildTurns([user(), thinking(''), thinking('', 'in_progress'), thinking('**Plan**\n\nRead the file.'), agent('Done.'), end()])[0]!
    expect(block.steps).toBe(2)
  })

  it('counts consecutive lookups as one row and leaves edits and commands on their own', () => {
    const block = buildTurns([user(), search('TIMEOUT'), read('a.ts'), read('b.ts'), edit([{ path: 'a.ts', change: 'modify' }]), read('c.ts'), run('pnpm test'), end()])[0]!
    expect(block.entries.map(entry => entry.type)).toEqual(['group', 'step', 'step', 'step'])
    expect(block.steps).toBe(6)
    expect(groupLabel(block.entries[0]!.type === 'group' ? block.entries[0]!.items : [])).toBe('搜索 1 次，读取了 2 个文件')
  })

  it('keeps a pending request outside the process and moves it in once answered', () => {
    expect(buildTurns([user(), request(false)])[0]).toMatchObject({ pending: [{ kind: 'input_request' }], entries: [] })
    expect(buildTurns([user(), request(true)])[0]).toMatchObject({ pending: [], entries: [{ type: 'request' }] })
  })
})

describe('Step rows · Shell Spec v02 §6', () => {
  const roots = ['/work/app']
  it('names a path by file then directory, relative to the project', () => {
    expect(describeStep(read('/work/app/src/settings/a.ts'), roots).target?.path).toEqual({ name: 'a.ts', directory: 'src/settings' })
    expect(describeStep(read('/elsewhere/a.ts'), roots).target?.path).toEqual({ name: 'a.ts', directory: '/elsewhere' })
  })

  it('shows the exit code only for a failed command and a duration only from one second', () => {
    expect(describeStep(run('pnpm test', 1, 6), roots)).toMatchObject({ verb: '运行失败', problem: '退出码 1', duration: '6 秒', failed: true, detail: true })
    const passed = describeStep(run('pnpm test'), roots)
    expect(passed).toMatchObject({ verb: '运行', failed: false })
    expect(passed.problem).toBeUndefined(); expect(passed.duration).toBeUndefined()
  })

  it('totals added and removed lines from the file patches', () => {
    const view = describeStep(edit([{ path: 'a.ts', change: 'modify', diff: '@@ -1 +1,2 @@\n-old\n+new\n+more\n' }, { path: 'b.ts', change: 'modify', diff: '--- a/b.ts\n+++ b/b.ts\n-gone\n' }]), roots)
    expect(view).toMatchObject({ verb: '编辑了 2 个文件', additions: 2, deletions: 2, detail: true })
    expect(describeStep(edit([{ path: 'new.ts', change: 'add' }]), roots)).toMatchObject({ verb: '新建', detail: false })
  })

  it('previews thinking by its first readable line and names the running step for the header', () => {
    expect(firstLine('\n**确认超时常量**\n\n先搜索。')).toBe('确认超时常量')
    expect(describeStep(thinking('**Plan**\n\nRead.'), roots)).toMatchObject({ verb: '思考', preview: 'Plan', detail: true })
    expect(liveLabel(step({ status: 'in_progress', activity: { verb: 'run', label: 'pnpm test', target: 'pnpm test' }, command: { command: 'pnpm test' } }), roots)).toBe('正在运行 pnpm test')
    expect(liveLabel(thinking('', 'in_progress'), roots)).toBe('正在思考')
    expect(liveLabel(step({ kind: 'tool_call', status: 'in_progress', activity: { verb: 'read', label: 'Read /work/app/src/a.ts', target: '/work/app/src/a.ts' }, tool: { name: 'Read', input: {} } }), roots)).toBe('正在读取 a.ts')
  })
})

describe('Turn view · Shell Spec v02 §6', () => {
  const finished = () => [user(), thinking('**确认超时常量**\n\n先搜索常量名。'), read('/work/app/src/a.ts'), read('/work/app/src/b.ts'), agent('常量只在一处定义。'), edit([{ path: 'src/a.ts', change: 'modify', diff: '-old\n+new\n' }]), run('pnpm test', 1, 6), agent('超时改为 15 秒。'), end({ changes: { files: 1, additions: 1, deletions: 1 } })]

  it('folds a finished turn into one line above the reply and opens it on request', () => {
    const { container } = renderTurn(finished())
    const toggle = screen.getByRole('button', { name: /已处理 2 分 18 秒 · 5 步/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.transcript-process')).toBeNull()
    expect(container.querySelector('.transcript-agent')?.textContent).toBe('超时改为 15 秒。')
    expect(screen.queryByText('常量只在一处定义。')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const process = within(container.querySelector<HTMLElement>('.transcript-process')!)
    expect(process.getByText('常量只在一处定义。')).toBeTruthy()
    expect(process.getByRole('button', { name: /读取了 2 个文件/ })).toBeTruthy()
    expect(process.getByRole('button', { name: /运行失败.*pnpm test.*退出码 1.*6 秒/ })).toBeTruthy()
  })

  it('opens each step on its own: thinking as text, a command as its output, an edit as its patch', () => {
    const { container } = renderTurn(finished())
    fireEvent.click(screen.getByRole('button', { name: /已处理/ }))
    fireEvent.click(screen.getByRole('button', { name: /思考.*确认超时常量/ }))
    expect(container.querySelector('.transcript-step__thinking')?.textContent).toContain('先搜索常量名。')
    fireEvent.click(screen.getByRole('button', { name: /运行失败/ }))
    expect(container.querySelector('.transcript-step__output pre')?.textContent).toBe('$ pnpm test\nFAIL one test')
    fireEvent.click(screen.getByRole('button', { name: /编辑.*a\.ts/ }))
    expect(container.querySelector('.code-block__line--add')?.textContent).toBe('+new')
    fireEvent.click(screen.getByRole('button', { name: /读取了 2 个文件/ }))
    expect(container.querySelectorAll('.transcript-step__group .transcript-step')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /思考/ }))
    expect(container.querySelector('.transcript-step__thinking')).toBeNull()
  })

  it('shows what a running turn is doing, keeps it open, and lets the user fold it', () => {
    vi.useFakeTimers(); vi.setSystemTime(13_000)
    const { container } = renderTurn([user(), read('/work/app/src/a.ts'), step({ status: 'in_progress', activity: { verb: 'run', label: 'pnpm test', target: 'pnpm test' }, command: { command: 'pnpm test', output: 'RUN  settings\n' } })], { activity: 'running' })
    const toggle = container.querySelector<HTMLElement>('.transcript-process__toggle')!
    expect(toggle.textContent).toBe('正在运行 pnpm test· 12 秒')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('.transcript-step__output pre')?.textContent).toBe('$ pnpm test\nRUN  settings')
    act(() => { vi.advanceTimersByTime(3000) })
    expect(toggle.textContent).toBe('正在运行 pnpm test· 15 秒')
    fireEvent.click(toggle)
    expect(container.querySelector('.transcript-process')).toBeNull()
  })

  it('says a turn without steps is being handled, then how long it took, with nothing to open', () => {
    vi.useFakeTimers(); vi.setSystemTime(4000)
    const live = renderTurn([user(), agent('正在', { complete: false })], { activity: 'running' })
    expect(live.container.querySelector('.transcript-process__toggle')?.textContent).toBe('正在回复· 3 秒')
    expect(live.container.querySelector('button.transcript-process__toggle')).toBeNull()
    live.unmount()
    const done = renderTurn([user(), agent('你好。'), end({ durationMs: 400 })])
    expect(done.container.querySelector('.transcript-process__toggle')?.textContent).toBe('已处理 不到 1 秒')
    expect(done.container.querySelector('.transcript-turn-end')?.getAttribute('data-outcome')).toBe('completed')
  })

  it('marks a stopped turn and a turn waiting for the user', () => {
    const stopped = renderTurn([user(), read('a.ts'), end({ outcome: 'interrupted', durationMs: 12_000 })])
    expect(stopped.container.querySelector('.transcript-process__toggle')?.textContent).toBe('已停止 · 12 秒 · 1 步')
    expect(stopped.container.querySelector('.transcript-turn-end')?.getAttribute('data-outcome')).toBe('interrupted')
    stopped.unmount()
    const waiting = renderTurn([user(), read('a.ts'), request(false)], { activity: 'needs_input' })
    expect(waiting.container.querySelector('.transcript-process__label')?.textContent).toBe('等待你的确认')
    expect(waiting.container.querySelector('.request-card h3')?.textContent).toBe('等待你的确认')
  })

  it('lists an answered request in the process with its outcome and opens the read-only card', () => {
    const { container } = renderTurn([user(), request(true), agent('Done.'), end()])
    fireEvent.click(screen.getByRole('button', { name: /已处理/ }))
    const row = screen.getByRole('button', { name: /确认.*Run the tests\?.*已选择：Allow once/ })
    expect(container.querySelector('.request-card')).toBeNull()
    fireEvent.click(row)
    expect(container.querySelector('.request-card--resolved')).toBeTruthy()
  })

  it('copies the reply and opens the turn changes with their totals from the footer', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { container } = renderTurn(finished())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制回答' })) })
    expect(writeText).toHaveBeenCalledWith('超时改为 15 秒。')
    expect(screen.getByRole('status').textContent).toBe('已复制')
    expect(screen.getByRole('button', { name: '查看本轮变更' }).textContent).toBe('1 个文件+1−1')
    expect(container.querySelector('.transcript-turn-end')?.querySelectorAll('button')).toHaveLength(2)
  })
})
