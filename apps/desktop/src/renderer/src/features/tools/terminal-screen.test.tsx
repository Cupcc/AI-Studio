import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { TerminalEmulatorState, TerminalOutput, TerminalSnapshot, TerminalSummary } from '@shared/tools/terminal'
import { terminalApi, type TerminalApi } from './api'
import TerminalScreen from './TerminalScreen'
import { terminalTheme } from './terminal-theme'

const emulator = vi.hoisted(() => ({
  writes: [] as { data: string; parsed: (() => void) | undefined }[],
  input: null as ((data: string) => void) | null,
  /** Every Terminal constructed, the elements xterm was opened into and an ordered log of fit / font option writes. */
  terms: [] as { cols: number; rows: number; options: Record<string, unknown> }[],
  opened: [] as HTMLElement[],
  events: [] as string[],
  /** Grid the next `fit()` proposes. */
  fitTo: null as { cols: number; rows: number } | null,
  reset: vi.fn(), resize: vi.fn(), focus: vi.fn(), blur: vi.fn(), dispose: vi.fn(),
  restore: vi.fn(),
  registerCsiHandler: vi.fn(() => ({ dispose: vi.fn() })), registerDcsHandler: vi.fn(() => ({ dispose: vi.fn() })), registerOscHandler: vi.fn(() => ({ dispose: vi.fn() }))
}))
vi.mock('./api', () => ({ terminalApi: vi.fn() }))
vi.mock('@shared/tools/terminal', () => ({ restoreTerminalEmulatorState: emulator.restore }))
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  cols = 80; rows = 24; options: Record<string, unknown>
  parser = emulator
  constructor(options: Record<string, unknown>) {
    this.options = { ...options }
    let family = options.fontFamily
    // xterm re-measures on a fontFamily change; record each write in order next to the fits.
    Object.defineProperty(this.options, 'fontFamily', { enumerable: true, get: () => family, set: (value) => { family = value; emulator.events.push(`fontFamily:${String(value)}`) } })
    emulator.terms.push(this)
  }
  loadAddon() {}; open(node: HTMLElement) { emulator.opened.push(node) }
  write(data: string, parsed?: () => void) { emulator.writes.push({ data, parsed }) }
  onData(listener: (data: string) => void) { emulator.input = listener; return { dispose: vi.fn() } }
  resize(cols: number, rows: number) { this.cols = cols; this.rows = rows; emulator.resize(cols, rows) }
  reset = emulator.reset; focus = emulator.focus; blur = emulator.blur; dispose = emulator.dispose
  attachCustomKeyEventHandler() {}; registerLinkProvider() { return { dispose: vi.fn() } }
  clear = vi.fn(); selectAll = vi.fn(); hasSelection = () => false; clearSelection = vi.fn()
} }))
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class { findNext() { return false }; findPrevious() { return false }; clearDecorations() {} } }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {
  emulator.events.push('fit')
  const term = emulator.terms.at(-1)
  if (term && emulator.fitTo) { term.cols = emulator.fitTo.cols; term.rows = emulator.fitTo.rows }
} } }))
let api: TerminalApi, output: (event: TerminalOutput) => void
const terminal: TerminalSummary = { projectId: 'p', terminalId: 't', generation: 1, title: 'Terminal', shell: '/bin/zsh', cwd: '/p', createdAt: 'now', state: 'running', cols: 80, rows: 24 }
const snapshot: TerminalSnapshot = { ...terminal, terminal, sequence: 5, screen: '\u001b[31mred\u001b[0m', attachmentId: 'attachment', emulatorState: {} as TerminalEmulatorState }
const attachment = { projectId: 'p', terminalId: 't', generation: 1, attachmentId: 'attachment' }
beforeEach(() => {
  emulator.writes.length = 0; emulator.terms.length = 0; emulator.opened.length = 0; emulator.events.length = 0; emulator.fitTo = null
  vi.clearAllMocks(); emulator.restore.mockReset()
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  api = { list: vi.fn(), create: vi.fn(), close: vi.fn(), rename: vi.fn(), clear: vi.fn().mockResolvedValue(undefined), attach: vi.fn().mockResolvedValue(snapshot), detach: vi.fn().mockResolvedValue(undefined), ack: vi.fn().mockResolvedValue(undefined), input: vi.fn().mockResolvedValue(undefined), resize: vi.fn().mockResolvedValue(undefined), onChanged: vi.fn(() => () => {}), onOutput: vi.fn(listener => { output = listener; return () => {} }) }
  vi.mocked(terminalApi).mockReturnValue(api)
})
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  for (const key of ['scheme', 'theme', 'glassColor']) delete document.documentElement.dataset[key]
  delete (document as { fonts?: unknown }).fonts
})

it('restores the ANSI snapshot before ACK, parses each sequenced output once and detaches on hide', async () => {
  const error = vi.fn()
  const view = render(<TerminalScreen terminal={terminal} active onError={error} />)
  await waitFor(() => expect(emulator.writes).toHaveLength(1))
  expect(emulator.writes[0]!.data).toBe('')
  expect(api.ack).not.toHaveBeenCalled()
  act(() => emulator.writes[0]!.parsed!())
  expect(emulator.writes[1]!.data).toBe(snapshot.screen)
  expect(api.ack).not.toHaveBeenCalled()
  act(() => emulator.writes[1]!.parsed!())
  expect(emulator.restore).toHaveBeenCalledWith(expect.any(Object), snapshot.emulatorState)
  expect(api.ack).toHaveBeenCalledWith({ ...attachment, sequence: 5 })
  const event = { ...snapshot, sequence: 6, data: 'next' }
  act(() => { output(event); output(event); output({ ...event, attachmentId: 'stale', sequence: 7 }); output({ ...event, projectId: 'other', sequence: 7 }) })
  expect(emulator.writes.map(write => write.data)).toEqual(['', snapshot.screen, 'next'])
  expect(api.ack).toHaveBeenCalledTimes(1)
  act(() => emulator.writes[2]!.parsed!())
  expect(api.ack).toHaveBeenLastCalledWith({ ...attachment, sequence: 6 })
  act(() => emulator.input?.('echo hi\r'))
  expect(api.input).toHaveBeenCalledWith({ projectId: 'p', terminalId: 't', generation: 1, data: 'echo hi\r' })
  view.rerender(<TerminalScreen terminal={terminal} active={false} onError={error} />)
  expect(api.detach).toHaveBeenCalledWith(attachment)
  act(() => emulator.input?.('hidden'))
  expect(api.input).toHaveBeenCalledTimes(1)
  view.rerender(<TerminalScreen terminal={terminal} active onError={error} />)
  await waitFor(() => expect(api.attach).toHaveBeenCalledTimes(2))
  expect(api.close).not.toHaveBeenCalled()
  expect(emulator.registerCsiHandler).toHaveBeenCalledWith({ final: 'n' }, expect.any(Function))
})

it('detaches a snapshot that resolves after the screen unmounts without writing it', async () => {
  let resolve!: (snapshot: TerminalSnapshot) => void
  vi.mocked(api.attach).mockReturnValue(new Promise(done => { resolve = done }))
  const view = render(<TerminalScreen terminal={terminal} active onError={vi.fn()} />)
  view.unmount()
  await act(async () => resolve(snapshot))
  expect(api.detach).toHaveBeenCalledWith(attachment)
  expect(emulator.writes).toHaveLength(0)
  expect(api.ack).not.toHaveBeenCalled()
})

it('does not ACK or accept input when emulator state restoration fails', async () => {
  const error = vi.fn()
  emulator.restore.mockImplementation(() => { throw new Error('Unsupported terminal emulator snapshot version') })
  render(<TerminalScreen terminal={terminal} active onError={error} />)
  await waitFor(() => expect(emulator.writes).toHaveLength(1))
  act(() => emulator.writes[0]!.parsed!())
  act(() => emulator.writes[1]!.parsed!())
  expect(error).toHaveBeenCalledWith(expect.stringContaining('无法恢复终端'))
  expect(api.detach).toHaveBeenCalledWith(attachment)
  expect(api.ack).not.toHaveBeenCalled()
  act(() => emulator.input?.('unseen input'))
  expect(api.input).not.toHaveBeenCalled()
  expect(api.close).not.toHaveBeenCalled()
})

// ---- Fit, web font and theme (W5-F4 / F5 / F8) ----

class FakeFonts extends EventTarget {
  usable: boolean
  loading: { resolve(): void; reject(error: Error): void } | null = null
  constructor(usable: boolean) { super(); this.usable = usable }
  check = vi.fn((_font: string) => this.usable)
  load = vi.fn((_font: string) => new Promise<unknown[]>((resolve, reject) => { this.loading = { resolve: () => { this.usable = true; resolve([]) }, reject } }))
}
/** jsdom has no `document.fonts`. */
function installFonts(usable: boolean) {
  const fonts = new FakeFonts(usable)
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
  return fonts
}
/** Gives the host a size, runs animation frames synchronously and exposes the ResizeObserver callback. */
function sizing() {
  const callbacks: (() => void)[] = []
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { callbacks.push(callback) } observe() {}; disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(567)
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(651)
  return { fire: () => act(() => callbacks.forEach(callback => callback())) }
}
async function restored() {
  await waitFor(() => expect(emulator.writes).toHaveLength(1))
  act(() => emulator.writes[0]!.parsed!())
  act(() => emulator.writes[1]!.parsed!())
}
const fontWrites = () => emulator.events.filter(event => event.startsWith('fontFamily'))

it('opens xterm in an unpadded host nested in the padded wrapper', () => {
  const view = render(<TerminalScreen terminal={terminal} active onError={vi.fn()} />)
  const wrapper = view.container.querySelector('.terminal-screen')!
  expect(emulator.opened).toHaveLength(1)
  // FitAddon measures its parent: that element must be the host, never the element that carries the padding.
  expect(emulator.opened[0]).not.toBe(wrapper)
  expect(emulator.opened[0]!.parentElement).toBe(wrapper)
  expect(emulator.opened[0]!.classList.contains('terminal-screen__host')).toBe(true)
  expect(wrapper.children).toHaveLength(1)
})

it('holds the first fit until the web font is usable, then re-measures once and resizes the PTY once per real change', async () => {
  const fonts = installFonts(false)
  const resizes = sizing()
  emulator.fitTo = { cols: 76, rows: 34 }
  const error = vi.fn()
  render(<TerminalScreen terminal={terminal} active onError={error} />)
  expect(fonts.load).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(emulator.writes).toHaveLength(1))
  // Restoration is not delayed by the font, and input stays closed until it finishes.
  act(() => emulator.input?.('early'))
  expect(api.input).not.toHaveBeenCalled()
  act(() => emulator.writes[0]!.parsed!())
  expect(api.ack).not.toHaveBeenCalled()
  act(() => emulator.writes[1]!.parsed!())
  expect(api.ack).toHaveBeenCalledWith({ ...attachment, sequence: 5 })
  act(() => emulator.input?.('ls\r'))
  expect(api.input).toHaveBeenCalledTimes(1)
  // The font is still loading: a size report must not fit with fallback metrics or touch the PTY.
  resizes.fire()
  expect(emulator.events).toEqual([])
  expect(api.resize).not.toHaveBeenCalled()

  await act(async () => fonts.loading!.resolve())
  expect(emulator.events).toEqual(['fontFamily:, sans-serif', 'fontFamily:', 'fit'])
  expect(api.resize).toHaveBeenCalledTimes(1)
  expect(api.resize).toHaveBeenLastCalledWith({ projectId: 'p', terminalId: 't', generation: 1, cols: 76, rows: 34 })
  // Same grid again: fit, but no second PTY resize and no second measurement.
  resizes.fire()
  expect(api.resize).toHaveBeenCalledTimes(1)
  emulator.fitTo = { cols: 90, rows: 30 }
  resizes.fire()
  expect(api.resize).toHaveBeenCalledTimes(2)
  expect(api.resize).toHaveBeenLastCalledWith({ projectId: 'p', terminalId: 't', generation: 1, cols: 90, rows: 30 })
  expect(fontWrites()).toHaveLength(2)
  expect(api.ack).toHaveBeenCalledTimes(1)
  expect(error).not.toHaveBeenCalledWith(expect.stringContaining('终端尺寸更新失败'))
})

it('fits and resizes the PTY after a font that fails to load instead of waiting forever', async () => {
  const fonts = installFonts(false)
  sizing()
  emulator.fitTo = { cols: 76, rows: 34 }
  render(<TerminalScreen terminal={terminal} active onError={vi.fn()} />)
  await restored()
  expect(api.resize).not.toHaveBeenCalled()
  await act(async () => fonts.loading!.reject(new Error('font file missing')))
  expect(emulator.events).toContain('fit')
  expect(api.resize).toHaveBeenCalledTimes(1)
})

it('refits on loadingdone and sends a PTY resize only when the grid really changed', async () => {
  const fonts = installFonts(true)
  sizing()
  emulator.fitTo = { cols: terminal.cols, rows: terminal.rows }
  const view = render(<TerminalScreen terminal={terminal} active onError={vi.fn()} />)
  await restored()
  // Usable font: the first fit follows restoration directly and, matching the snapshot grid, needs no PTY resize.
  expect(emulator.events).toEqual(['fit'])
  expect(api.resize).not.toHaveBeenCalled()

  act(() => { fonts.dispatchEvent(new Event('loadingdone')) })
  expect(emulator.events).toEqual(['fit', 'fontFamily:, sans-serif', 'fontFamily:', 'fit'])
  expect(api.resize).not.toHaveBeenCalled()
  emulator.fitTo = { cols: 77, rows: 33 }
  act(() => { fonts.dispatchEvent(new Event('loadingdone')) })
  expect(api.resize).toHaveBeenCalledTimes(1)
  expect(api.resize).toHaveBeenLastCalledWith({ projectId: 'p', terminalId: 't', generation: 1, cols: 77, rows: 33 })

  view.unmount()
  const fits = emulator.events.length
  act(() => { fonts.dispatchEvent(new Event('loadingdone')) })
  expect(emulator.events).toHaveLength(fits)
})

it('reports a failed PTY resize and retries it on the next fit', async () => {
  installFonts(true)
  const resizes = sizing()
  emulator.fitTo = { cols: 76, rows: 34 }
  vi.mocked(api.resize).mockRejectedValueOnce(new Error('pty gone'))
  const error = vi.fn()
  render(<TerminalScreen terminal={terminal} active onError={error} />)
  await restored()
  await waitFor(() => expect(error).toHaveBeenCalledWith('终端尺寸更新失败：Error: pty gone'))
  expect(api.resize).toHaveBeenCalledTimes(1)
  resizes.fire()
  expect(api.resize).toHaveBeenCalledTimes(2)
})

it('follows <html data-scheme> live with an explicit opaque theme, without recreating the terminal', async () => {
  document.documentElement.dataset.scheme = 'light'
  render(<TerminalScreen terminal={terminal} active onError={vi.fn()} />)
  const term = emulator.terms[0]!
  expect(term.options.theme).toEqual(terminalTheme('light'))
  expect(term.options.theme).toMatchObject({ background: expect.stringMatching(/^#[0-9a-f]{6}$/) })

  document.documentElement.dataset.scheme = 'dark'
  await waitFor(() => expect(term.options.theme).toEqual(terminalTheme('dark')))
  const dark = term.options.theme
  // Glass / solid and the wallpaper are CSS only; the palette table does not depend on them.
  document.documentElement.dataset.theme = 'solid'; document.documentElement.dataset.glassColor = 'mint'
  await act(async () => {})
  expect(term.options.theme).toBe(dark)
  document.documentElement.dataset.scheme = 'light'
  await waitFor(() => expect(term.options.theme).toEqual(terminalTheme('light')))
  expect(emulator.terms).toHaveLength(1)
  expect(emulator.dispose).not.toHaveBeenCalled()
})
