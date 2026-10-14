import { expect, it } from 'vitest'
import { Terminal } from '@xterm/headless'
import { createTerminalService } from '@w4-terminal-service'
import { captureTerminalEmulatorState, restoreTerminalEmulatorState, type TerminalOutput } from '@shared/tools/terminal'

it.each([
  { name: 'fragmented CSI', before: '\u001b[31', after: 'mRED' },
  { name: 'fragmented DCS', before: '\u001bP$q', after: 'm\u001b\\RED' },
  { name: 'saved cursor', before: '\u001b[4;6H\u001b7\u001b[1;1HX', after: '\u001b8Y' },
  { name: 'scroll margins', before: '\u001b[2;5r\u001b[5;1HX', after: '\r\nY' },
  { name: 'fragmented OSC color', before: '\u001b]4;1;rgb:00/ff/', after: '00\u0007\u001b[31mGREEN' },
  { name: 'UTF-16 split surrogate', before: 'A\ud83d', after: '\ude03B' },
  { name: 'saved attributes', before: '\u001b[31;44m\u001b7\u001b[32;45mX', after: '\u001b8Y' },
  { name: 'custom tab stops', before: '\u001b[3g\u001b[1;4H\u001bH\u001b[1;1H', after: '\tY' },
  { name: 'origin mode', before: '\u001b[3;9r\u001b[?6h', after: '\u001b[2;4HX\r\nY' },
  { name: 'alternate saved cursor', before: '\u001b[?1049h\u001b[4;7H\u001b7\u001b[1;1HX', after: '\u001b8Y\u001b[?1049lZ' },
  { name: 'DEC character set', before: '\u001b(0', after: 'lqqk\u001b(BX' },
  { name: 'G3-only sparse character set', before: '\u001b+0', after: '\u001bOqq' },
  { name: 'pending autowrap', before: 'A'.repeat(80), after: 'Z' },
  { name: 'protected cell selective erase', before: '\u001b[1"qKEEP\u001b[0"qFREE', after: '\u001b[?2J' },
  { name: 'curly RGB underline', before: '\u001b[4:3m\u001b[58:2::255:0:0mX\u001b[0m', after: 'Y' },
  { name: 'existing OSC8 link', before: '\u001b]8;id=w4;https://example.invalid/review\u0007LINK\u001b]8;;\u0007', after: 'Z' },
  { name: 'continuing OSC8 link', before: '\u001b]8;;https://example.invalid/continuing\u0007X', after: 'Y\u001b]8;;\u0007Z' },
  { name: 'saved OSC8 link attributes', before: '\u001b]8;;https://example.invalid/saved\u0007\u001b7X\u001b]8;;\u0007', after: '\u001b8Y' }
])('W4 snapshot plus incremental equals continuous screen for $name', async ({ before, after }) => {
  let emit!: (data: string) => void
  const output: TerminalOutput[] = []
  const service = createTerminalService({
    projectPath: () => '/tmp',
    shellEnv: async () => ({ shell: '/bin/sh', env: {}, source: 'fallback' }),
    spawn: async () => ({
      write() {}, resize() {}, pause() {}, resume() {}, close: async () => {}, liveOwnedProcesses: async () => [],
      onData(listener) { emit = listener; return { dispose() {} } },
      onExit() { return { dispose() {} } }
    }),
    output(event) { output.push(event) }, changed() {}
  })
  const restored = new Terminal({ cols: 80, rows: 24, scrollback: 1000, allowProposedApi: true })
  const reference = new Terminal({ cols: 80, rows: 24, scrollback: 1000, allowProposedApi: true })
  const write = (terminal: Terminal, data: string) => new Promise<void>(done => terminal.write(data, done))
  const state = (terminal: Terminal) => ({
    cursor: [terminal.buffer.active.cursorX, terminal.buffer.active.cursorY],
    lines: Array.from({ length: terminal.rows }, (_, y) => {
      const line = terminal.buffer.active.getLine(y)!
      return { text: line.translateToString(true), cells: Array.from({ length: terminal.cols }, (_, x) => {
        const cell = line.getCell(x)!
        const attributes = cell as unknown as { getUnderlineStyle(): number; getUnderlineColor(): number; extended: { urlId: number } }
        const linkService = (terminal as unknown as { _core: { _inputHandler: { _oscLinkService: { getLinkData(id: number): { uri: string; id?: string } | undefined } } } })._core._inputHandler._oscLinkService
        return [cell.getChars(), cell.getWidth(), cell.getFgColor(), cell.getBgColor(), cell.isBold(), cell.isItalic(), cell.isUnderline(), attributes.getUnderlineStyle(), attributes.getUnderlineColor(), linkService.getLinkData(attributes.extended.urlId) ?? null]
      }) }
    })
  })
  try {
    const terminal = await service.create({ projectId: 'p1', cols: 80, rows: 24 })
    await write(reference, before)
    emit(before)
    const snapshot = await service.attach(terminal, 4)
    await write(restored, snapshot.screen)
    restoreTerminalEmulatorState(restored, snapshot.emulatorState)
    service.ack(snapshot, 4)
    await write(reference, after)
    emit(after)
    const until = Date.now() + 1000
    while (!output.length && Date.now() < until) await new Promise(done => setTimeout(done, 5))
    for (const chunk of output) await write(restored, chunk.data)
    expect(state(restored)).toEqual(state(reference))
  } finally {
    restored.dispose(); reference.dispose()
    await service.dispose()
  }
})

it('W4 rejects coerced cursor-style values before changing the target buffer', () => {
  const source = new Terminal({ cols: 80, rows: 24, allowProposedApi: true })
  const target = new Terminal({ cols: 80, rows: 24, allowProposedApi: true })
  try {
    const snapshot = captureTerminalEmulatorState(source)
    snapshot.normal.x = 5
    const malformed = { ...snapshot, cursorStyle: ['block'] }
    expect(() => restoreTerminalEmulatorState(target, malformed)).toThrow()
    expect(target.buffer.active.cursorX).toBe(0)
  } finally { source.dispose(); target.dispose() }
})
