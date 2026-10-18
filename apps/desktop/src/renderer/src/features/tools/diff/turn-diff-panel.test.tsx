import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { TurnDiffRecord } from '@shared/tools/turn-diff'
import { TurnDiffPanel } from './TurnDiffPanel'

const source = { projectId: 'p', sessionId: 'session-a', turnId: 'turn-a' }
const record = (patch: Partial<TurnDiffRecord> = {}): TurnDiffRecord => ({
  ...source, nativeSessionId: 'thread-a', nativeTurnId: 'native-a', provider: 'codex', protocolVersion: '0.161.0',
  cliVersion: '0.163.0', source: 'codex:turn/diff/updated', state: 'available', patch: '+saved history', files: [],
  revision: 2, receivedAt: 100, final: true, outcome: 'completed', truncated: false, ...patch
})
function api(getTurnDiff = vi.fn(async () => record())) {
  Object.defineProperty(window, 'studio', { configurable: true, value: { session: { getTurnDiff } } })
  return getTurnDiff
}
afterEach(cleanup)

it('reads saved data, displays coverage and actual source, and never requests working-tree contents', async () => {
  const get = api()
  render(<TurnDiffPanel source={source} active />)
  await screen.findByText('+saved history')
  expect(get).toHaveBeenCalledWith(source)
  expect(screen.getByRole('note').textContent).toContain('Shell')
  expect(screen.getByText(/codex 0.163.0/)).toBeTruthy()
})

it.each(['unknown', 'empty', 'unavailable', 'failed'] as const)('explains %s without inventing a zero file count', async state => {
  api(vi.fn(async () => record({ state, patch: state === 'empty' ? '' : null, reason: 'native coverage reason' })))
  render(<TurnDiffPanel source={source} active />)
  await screen.findByText('native coverage reason')
  expect(screen.queryByText('+saved history')).toBeNull()
  expect(screen.queryByText(/0 个文件/)).toBeNull()
})

it('drops an old response when the user selects another Turn or Project', async () => {
  let old!: (record: TurnDiffRecord) => void
  const get = vi.fn().mockImplementationOnce(() => new Promise(resolve => { old = resolve })).mockResolvedValueOnce(record({ turnId: 'turn-b', patch: '+new selection' }))
  api(get)
  const view = render(<TurnDiffPanel source={source} active />)
  view.rerender(<TurnDiffPanel source={{ ...source, projectId: 'p2', turnId: 'turn-b' }} active />)
  await screen.findByText('+new selection')
  await act(async () => old(record({ patch: '+stale selection' })))
  expect(screen.queryByText('+stale selection')).toBeNull()
})

it('offers failed file records with their original patch and keeps patch markup as text', async () => {
  api(vi.fn(async () => record({ files: [{ itemId: 'f', path: 'name.txt', change: 'modify', status: 'failed', patch: '+<img src=x onerror=alert(1)>' }] })))
  render(<TurnDiffPanel source={source} active />)
  const select = await screen.findByRole('combobox', { name: '原生补丁范围' })
  fireEvent.change(select, { target: { value: '0' } })
  await screen.findByText('+<img src=x onerror=alert(1)>')
  expect(document.querySelector('img')).toBeNull()
  await waitFor(() => expect(screen.getByText(/补丁记录不代表写入成功/)).toBeTruthy())
})
