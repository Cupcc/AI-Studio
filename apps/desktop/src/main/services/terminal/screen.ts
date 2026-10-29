import { Terminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import { captureTerminalEmulatorState, type TerminalEmulatorState } from '@shared/tools/terminal'
import { TerminalParserCarry } from './parser-carry'

export const TERMINAL_SCROLLBACK = 1000

/** An ANSI display model, rather than a text log. Kept alive while the UI is hidden. */
export interface TerminalScreen {
  write(data: string, done: () => void): void
  resize(cols: number, rows: number): void
  /** ⌘K: drops the scrollback and moves the prompt line to the top, like xterm's `clear()` in the UI. */
  clear(): void
  serialize(): string
  emulatorState(): TerminalEmulatorState
  dispose(): void
}

export function createTerminalScreen(cols: number, rows: number, respond?: (data: string) => void): TerminalScreen {
  const terminal = new Terminal({ cols, rows, scrollback: TERMINAL_SCROLLBACK, allowProposedApi: true })
  const serialize = new SerializeAddon()
  const parser = (terminal as unknown as { _core: { _inputHandler: { _parser: {
    currentState: number; _transitions: { table: Uint8Array }; parse: (data: Uint32Array, length: number) => unknown
  } } } })._core._inputHandler._parser
  const carry = new TerminalParserCarry(parser._transitions.table)
  const parse = parser.parse.bind(parser)
  parser.parse = (data, length) => { carry.track(data, length); return parse(data, length) }
  const response = terminal.onData((data) => respond?.(data))
  // SerializeAddon uses only the shared buffer/parser API, also provided by headless.
  serialize.activate(terminal as unknown as Parameters<SerializeAddon['activate']>[0])
  return {
    write: (data, done) => terminal.write(data, done),
    resize: (nextCols, nextRows) => terminal.resize(nextCols, nextRows),
    clear: () => terminal.clear(),
    serialize: () => serialize.serialize({ scrollback: TERMINAL_SCROLLBACK }) + carry.snapshot(parser.currentState),
    emulatorState: () => captureTerminalEmulatorState(terminal),
    dispose: () => { response.dispose(); serialize.dispose(); terminal.dispose() }
  }
}
