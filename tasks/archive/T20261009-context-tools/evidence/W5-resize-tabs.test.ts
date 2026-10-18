// W5 Part 4：W5-F10 的最小复现。主进程 headless xterm 的列数缩小后，旧的 tab stop（key >= 新列数）仍留在 buffer.tabs 里，
// captureTerminalEmulatorState 对 tabs 的范围校验 number(key, 0, cols - 1) 抛出 'Invalid terminal emulator state'，
// terminal:attach 因此对该终端永久失败（GUI 现象：「无法恢复终端 … Invalid terminal emulator state」，重新连接无效）。
// 预期（修复后）：缩小列数后仍能 capture / restore。当前基线上这条用例会失败，作为复现保留。
import { describe, expect, it } from 'vitest'
import { Terminal } from '@xterm/headless'
import { captureTerminalEmulatorState } from '@shared/tools/terminal'

const make = (cols: number, rows: number) => new Terminal({ cols, rows, allowProposedApi: true, scrollback: 1000 })
const write = (terminal: Terminal, text: string) => new Promise<void>(done => terminal.write(text, done))

describe('W5-F10 terminal columns shrink', () => {
  it('captures after a plain shrink 76 -> 51 columns (GUI: opening a conversation narrows the pane)', async () => {
    const terminal = make(76, 34)
    await write(terminal, '$ echo hello\r\nhello\r\n$ ')
    terminal.resize(51, 34)
    const stops = Object.entries((terminal as unknown as { _core: { buffer: { tabs: Record<string, boolean> } } })._core.buffer.tabs).filter(([, on]) => on).map(([key]) => Number(key))
    console.log('[W5] tab stops after shrink to 51 cols, max =', Math.max(...stops))
    expect(() => captureTerminalEmulatorState(terminal)).not.toThrow()
  })
  it('control: capture works without a shrink and after growing', async () => {
    const terminal = make(51, 34)
    await write(terminal, '$ echo hello\r\n')
    expect(() => captureTerminalEmulatorState(terminal)).not.toThrow()
    terminal.resize(76, 34)
    expect(() => captureTerminalEmulatorState(terminal)).not.toThrow()
  })
})
