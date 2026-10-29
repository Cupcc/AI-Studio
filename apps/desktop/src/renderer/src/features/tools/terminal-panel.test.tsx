import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { TerminalSummary } from '@shared/tools/terminal'
import { terminalApi, type TerminalApi } from './api'
import { TerminalPanel } from './TerminalPanel'
import { useTerminals } from './terminal-store'

vi.mock('./api', () => ({ terminalApi: vi.fn() }))
vi.mock('./TerminalScreen', () => ({ default: ({ terminal }: { terminal: TerminalSummary }) => <div>screen:{terminal.terminalId}</div> }))
const terminal = (terminalId = 't1', state: TerminalSummary['state'] = 'running'): TerminalSummary => ({ projectId: 'p', terminalId, generation: 1, title: `终端 ${terminalId}`, state, shell: '/bin/zsh', cwd: '/project', createdAt: 'now', cols: 80, rows: 24 })
let api: TerminalApi
beforeEach(() => {
  useTerminals.getState().forget('p'); useTerminals.setState({ projects: {} })
  api = {
    list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue(terminal()), close: vi.fn().mockResolvedValue({ status: 'closed' }),
    rename: vi.fn(), clear: vi.fn().mockResolvedValue(undefined),
    attach: vi.fn(), detach: vi.fn(), ack: vi.fn(), input: vi.fn(), resize: vi.fn(), onChanged: vi.fn(() => () => {}), onOutput: vi.fn(() => () => {})
  }
  vi.mocked(terminalApi).mockReturnValue(api)
})
afterEach(cleanup)

it('creates once on first visible open, confirms a live close and keeps the last-tab empty state after remount', async () => {
  const view = render(<TerminalPanel projectId="p" active={false} />)
  expect(api.list).not.toHaveBeenCalled()
  view.rerender(<TerminalPanel projectId="p" active />)
  await screen.findByText('screen:t1')
  fireEvent.click(screen.getByRole('button', { name: '关闭 终端 t1' }))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  expect(api.close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(api.close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '关闭 终端 t1' }))
  fireEvent.click(screen.getByRole('button', { name: '结束并关闭' }))
  await screen.findByText('没有打开的终端')
  expect(api.close).toHaveBeenCalledWith({ projectId: 'p', terminalId: 't1', generation: 1, confirmed: true })
  view.unmount(); render(<TerminalPanel projectId="p" active />)
  expect(screen.getByText('没有打开的终端')).toBeTruthy()
  expect(api.create).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getAllByRole('button', { name: '新建终端' })[1]!)
  await screen.findByText('screen:t1')
  expect(api.create).toHaveBeenCalledTimes(2)
})

it('switches independent tabs, retains the chosen tab after hide and closes an exited tab without a prompt', async () => {
  vi.mocked(api.list).mockResolvedValue([terminal(), terminal('t2', 'exited')])
  const view = render(<TerminalPanel projectId="p" active />)
  await screen.findByText('screen:t2')
  fireEvent.click(screen.getByRole('tab', { name: '终端 t1' }))
  await screen.findByText('screen:t1')
  view.rerender(<TerminalPanel projectId="p" active={false} />)
  view.rerender(<TerminalPanel projectId="p" active />)
  expect(screen.getByRole('tab', { name: '终端 t1' }).getAttribute('aria-selected')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: '关闭 终端 t2' }))
  await waitFor(() => expect(screen.queryByRole('tab', { name: /终端 t2/ })).toBeNull())
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(api.close).toHaveBeenCalledWith({ projectId: 'p', terminalId: 't2', generation: 1, confirmed: false })
  expect(api.create).not.toHaveBeenCalled()
})

it('shows a close failure and retains the tab and confirmation for retry', async () => {
  vi.mocked(api.list).mockResolvedValue([terminal()])
  vi.mocked(api.close).mockResolvedValue({ status: 'failed', terminal: terminal('t1', 'close_failed'), error: '仍未退出，请重试' })
  render(<TerminalPanel projectId="p" active />)
  await screen.findByText('screen:t1')
  fireEvent.click(screen.getByRole('button', { name: '关闭 终端 t1' }))
  fireEvent.click(screen.getByRole('button', { name: '结束并关闭' }))
  await screen.findByText('仍未退出，请重试')
  expect(screen.getByRole('tab', { name: '终端 t1' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '结束并关闭' })).toBeTruthy()
})

it('does not let an old list response erase a newer event or resurrect a closed Project', async () => {
  let resolve!: (value: TerminalSummary[]) => void
  vi.mocked(api.list).mockReturnValue(new Promise(done => { resolve = done }))
  const view = render(<TerminalPanel projectId="p" active />)
  act(() => useTerminals.getState().accept('p', [terminal('t2')]))
  await act(async () => { resolve([terminal('t1')]) })
  await screen.findByText('screen:t2')
  expect(screen.queryByText('screen:t1')).toBeNull()
  view.unmount()
  useTerminals.getState().forget('p')
  useTerminals.getState().accept('p', [terminal()])
  expect(useTerminals.getState().projects.p).toBeUndefined()
})
