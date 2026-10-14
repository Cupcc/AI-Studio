import { expect, it } from 'vitest'
import { Terminal } from '@xterm/headless'
import { Terminal as BrowserTerminal } from '@xterm/xterm'
import { restoreTerminalEmulatorState } from '@shared/tools/terminal'
import { createTerminalScreen } from './screen'
import { TerminalParserCarry } from './parser-carry'

const write = (terminal: { write(data: string, done: () => void): void }, data: string) => new Promise<void>((done) => terminal.write(data, done))
function state(terminal: Terminal | BrowserTerminal) {
  const buffer = terminal.buffer.active
  const links = (terminal as unknown as { _core: { _inputHandler: { _oscLinkService: { getLinkData(id: number): unknown } } } })._core._inputHandler._oscLinkService
  return {
    type: buffer.type, cursor: [buffer.cursorX, buffer.cursorY],
    lines: Array.from({ length: terminal.rows }, (_, index) => {
      const line = buffer.getLine(buffer.baseY + index)!
      return { text: line.translateToString(true), colors: Array.from({ length: terminal.cols }, (_, x) => {
        const cell = line.getCell(x)!
        const privateCell = cell as unknown as { fg: number; bg: number; extended: { _ext: number; urlId: number } }
        return [privateCell.fg, privateCell.bg, cell.getWidth(), privateCell.bg & 0x10000000 ? privateCell.extended._ext : 0, privateCell.bg & 0x10000000 ? links.getLinkData(privateCell.extended.urlId) : undefined]
      }) }
    })
  }
}

// W5-F10: after the pane narrowed, xterm keeps tab stops beyond the new width; capture/restore used to reject
// them, so every later attach failed. They must also survive: a growing grid uses them again.
it('keeps stale tab stops beyond a narrowed width equal to a continuous xterm when the grid grows again', async () => {
  const setup = '\u001b[3g\u001b[1;61H\u001bH\u001b[1;71H\u001bH\u001b[1;1H'
  for (const RestoreTarget of [Terminal, BrowserTerminal]) {
    const screen = createTerminalScreen(76, 24)
    const reference = new Terminal({ cols: 76, rows: 24, allowProposedApi: true })
    try {
      await write(screen, setup); await write(reference, setup)
      screen.resize(51, 24); reference.resize(51, 24)
      const restored = new RestoreTarget({ cols: 51, rows: 24, allowProposedApi: true })
      try {
        await write(restored, screen.serialize())
        restoreTerminalEmulatorState(restored, screen.emulatorState())
        restored.resize(76, 24); reference.resize(76, 24)
        // From column 51 the next stop is the stale custom one at 60 (a rebuilt default grid would stop at 56).
        const probe = '\u001b[1;51H\tX\u001b[2;51H\t\tY'
        await write(restored, probe); await write(reference, probe)
        expect(state(restored)).toEqual(state(reference))
        expect(state(reference).lines[0]!.text.indexOf('X')).toBe(60)
        expect(state(reference).lines[1]!.text.indexOf('Y')).toBe(70)
      } finally { restored.dispose() }
    } finally { screen.dispose(); reference.dispose() }
  }
})

it.each([
  { name: 'partial CSI', before: '\u001b[31', after: 'mRED' },
  { name: 'partial OSC', before: '\u001b]2;ti', after: 'tle\u0007RED' },
  { name: 'partial DCS', before: '\u001bP$q', after: 'm\u001b\\RED' },
  { name: 'C1 CSI', before: '\u009b31', after: 'mRED' },
  { name: 'C1 OSC', before: '\u009d2;ti', after: 'tle\u009cRED' },
  { name: 'C1 DCS', before: '\u0090$q', after: 'm\u009cRED' },
  { name: 'ignored CSI', before: '\u001b[3?', after: '1mRED' },
  { name: 'executed control in CSI', before: '\u001b[31\n', after: 'mRED' },
  { name: 'UTF surrogate split', before: '\ud83d', after: '\ude03RED' },
  { name: 'saved cursor and attributes', before: '\u001b[31;1;3m\u001b[4;6H\u001b7\u001b[0m\u001b[1;1HX', after: '\u001b8Y' },
  { name: 'scroll margins', before: '\u001b[2;5r\u001b[5;1HX', after: '\r\nY' },
  { name: 'origin and margins', before: '\u001b[2;5r\u001b[?6h\u001b[4;2HX', after: '\r\nY\u001b[1;1HZ' },
  { name: 'custom tab stops', before: '\u001b[3g\u001b[1;4H\u001bH\u001b[1;1H', after: '\tX' },
  { name: 'DEC character set', before: '\u001b(0', after: 'q' },
  { name: 'sparse G3 character set', before: '\u001b+0', after: '\u001boq' },
  { name: 'saved character set', before: '\u001b(0\u001b7\u001b(B', after: '\u001b8q' },
  { name: 'normal and alternate saved states', before: '\u001b[3;5H\u001b7\u001b[1;1HX\u001b[?47hALT\u001b[4;8H\u001b7\u001b[1;1H', after: '\u001b8Z\u001b[?47l\u001b8Y' },
  { name: 'pending wrap', before: 'X'.repeat(80), after: 'Y' },
  { name: 'combining character', before: 'a', after: '\u0301' },
  { name: 'protected cells', before: '\u001b[1"qKEEP\u001b[0"qFREE', after: '\u001b[?2J' },
  { name: 'protected blank cells', before: '\u001b[1"q  \u001b[0"qFREE', after: '\u001b[?2K' },
  { name: 'existing curly red underline', before: '\u001b[4:3m\u001b[58:2::255:0:0mX\u001b[0mY', after: 'Z' },
  { name: 'current curly red underline', before: '\u001b[4:3m\u001b[58:2::255:0:0mX', after: 'Y' },
  { name: 'linked wide and combined cells', before: '\u001b]8;id=test;https://example.com\u001b\\中a\u0301\u001b]8;;\u001b\\', after: 'Y' },
  { name: 'active hyperlink with curly underlying style', before: '\u001b[4:3m\u001b]8;id=test;https://example.com\u001b\\X', after: 'Y\u001b]8;;\u001b\\Z' },
  { name: 'both buffers with hyperlinks', before: '\u001b]8;id=normal;https://normal.example\u001b\\NORMAL\u001b]8;;\u001b\\\u001b[?47h\u001b]8;id=alt;https://alt.example\u001b\\ALT\u001b]8;;\u001b\\', after: 'X\u001b[?47lY' },
  { name: 'saved hyperlink attributes', before: '\u001b]8;id=saved;https://saved.example\u001b\\X\u001b7\u001b]8;;\u001b\\Y', after: '\u001b8Z' }
])('restored model remains equal to continuous xterm for $name', async ({ before, after }) => {
  for (const RestoreTarget of [Terminal, BrowserTerminal]) {
    const screen = createTerminalScreen(80, 24)
    const restored = new RestoreTarget({ cols: 80, rows: 24, allowProposedApi: true })
    const reference = new Terminal({ cols: 80, rows: 24, allowProposedApi: true })
    try {
      await write(screen, before); await write(reference, before)
      await write(restored, screen.serialize())
      restoreTerminalEmulatorState(restored, screen.emulatorState())
      await write(restored, after); await write(reference, after)
      expect(state(restored)).toEqual(state(reference))
    } finally { screen.dispose(); restored.dispose(); reference.dispose() }
  }
})

it('bounds unfinished controls and gives an explicit recoverable snapshot error', async () => {
  const screen = createTerminalScreen(80, 24)
  try {
    await write(screen, '\u001b]2;' + 'x'.repeat(TerminalParserCarry.LIMIT))
    expect(() => screen.serialize()).toThrow('Unfinished terminal control exceeds')
    await write(screen, '\u0007RESUMED')
    expect(screen.serialize()).toContain('RESUMED')
  } finally { screen.dispose() }
})

it('rejects unknown schema, malformed state and wrong size before mutating a restored model', () => {
  const screen = createTerminalScreen(80, 24)
  const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true })
  try {
    const snapshot = screen.emulatorState()
    expect(() => restoreTerminalEmulatorState(terminal, { ...snapshot, version: 2 })).toThrow('version')
    expect(() => restoreTerminalEmulatorState(terminal, { ...snapshot, injected: true })).toThrow('Unknown')
    expect(() => restoreTerminalEmulatorState(terminal, { ...snapshot, cols: 81 })).toThrow('dimensions')
    expect(() => restoreTerminalEmulatorState(terminal, { ...snapshot, normal: { ...snapshot.normal, scrollTop: 200 } })).toThrow('Invalid')
    for (const field of ['cursorStyle', 'cursorStyleOverride', 'mouseProtocol', 'mouseEncoding'] as const) {
      expect(() => restoreTerminalEmulatorState(terminal, { ...snapshot, normal: { ...snapshot.normal, x: 5 }, [field]: [field === 'cursorStyle' || field === 'cursorStyleOverride' ? 'block' : field === 'mouseProtocol' ? 'NONE' : 'DEFAULT'] })).toThrow('Unsupported')
      expect(terminal.buffer.active.cursorX).toBe(0)
    }
    expect(() => restoreTerminalEmulatorState(terminal, { ...snapshot, normal: { ...snapshot.normal, x: 5 }, cells: { ...snapshot.cells, normal: [[80, 999], ...snapshot.cells.normal.slice(1)] } })).toThrow('Invalid')
    expect(() => restoreTerminalEmulatorState(terminal, { ...snapshot, normal: { ...snapshot.normal, x: 5 }, cells: { ...snapshot.cells, normal: [[79, 0], ...snapshot.cells.normal.slice(1)] } })).toThrow('limit')
    expect(terminal.buffer.active.cursorX).toBe(0)
  } finally { screen.dispose(); terminal.dispose() }
})

it('keeps link markers until their owning buffer lines are trimmed or cleared', async () => {
  const screen = createTerminalScreen(80, 24), terminal = new Terminal({ cols: 80, rows: 24, scrollback: 1000, allowProposedApi: true })
  try {
    await write(screen, '\u001b]8;id=normal;https://normal.example\u001b\\NORMAL\u001b]8;;\u001b\\\u001b[?47h\u001b]8;id=alt;https://alt.example\u001b\\ALT\u001b]8;;\u001b\\')
    await write(terminal, screen.serialize()); restoreTerminalEmulatorState(terminal, screen.emulatorState())
    const model = (terminal as unknown as { _core: { _inputHandler: { _oscLinkService: { _dataByLinkId: Map<number, { data: { uri: string } }> } } } })._core._inputHandler._oscLinkService
    expect([...model._dataByLinkId.values()].map((entry) => entry.data.uri).sort()).toEqual(['https://alt.example', 'https://normal.example'])
    await write(terminal, '\u001b[?47l')
    expect([...model._dataByLinkId.values()].map((entry) => entry.data.uri)).toEqual(['https://normal.example'])
    await write(terminal, '\r\n'.repeat(1050))
    expect(model._dataByLinkId.size).toBe(0)
  } finally { screen.dispose(); terminal.dispose() }
})
