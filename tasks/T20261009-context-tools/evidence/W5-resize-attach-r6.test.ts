// W5 Part 5：W5-F10 修复的独立差分检查。与实现者的回归用例不同，这里用真实 terminal service（假 PTY）按 GUI 的顺序
// 反复「缩列 / 放大 / attach / 恢复进新的 xterm」，并与从不 attach 的连续 xterm 对比下一次 Tab 的落点与可见内容。
// 覆盖：默认 tab stop 缩到 51 再放大；`tabs 4` 式自定义；远端列 HTS（220 列缩到 80 再放大）；缩到最小再放大到最大；
// alternate screen 内缩列 / 附着；PTY 隐藏期间（无 attach）缩列再 attach。
import { describe, expect, it } from 'vitest'
import { Terminal } from '@xterm/headless'
import { createTerminalService } from '@w4-terminal-service'
import { restoreTerminalEmulatorState, type TerminalOutput } from '@shared/tools/terminal'

const write = (terminal: Terminal, data: string) => new Promise<void>(done => terminal.write(data, done))
const cursor = (terminal: Terminal) => [terminal.buffer.active.cursorX, terminal.buffer.active.cursorY]
const text = (terminal: Terminal) => Array.from({ length: terminal.rows }, (_, y) => terminal.buffer.active.getLine(y)!.translateToString(true)).join('\n')

async function harness(cols: number, rows: number) {
  let emit!: (data: string) => void
  const output: TerminalOutput[] = []
  const service = createTerminalService({
    projectPath: () => '/tmp', shellEnv: async () => ({ shell: '/bin/sh', env: {}, source: 'fallback' }),
    spawn: async () => ({ write() {}, resize() {}, pause() {}, resume() {}, close: async () => {}, liveOwnedProcesses: async () => [],
      onData(listener) { emit = listener; return { dispose() {} } }, onExit() { return { dispose() {} } } }),
    output(event) { output.push(event) }, changed() {}
  })
  const terminal = await service.create({ projectId: 'p1', cols, rows })
  const reference = new Terminal({ cols, rows, scrollback: 1000, allowProposedApi: true })
  let owner = 0
  return {
    service, terminal, reference,
    async feed(data: string) { emit(data); await write(reference, data) },
    async resize(nextCols: number, nextRows = rows) { await service.resize(terminal, nextCols, nextRows); reference.resize(nextCols, nextRows) },
    /** attach like the Renderer: restore snapshot screen + emulator state into a fresh xterm, ack, detach. */
    async attachAndRestore() {
      const snapshot = await service.attach(terminal, ++owner)
      const restored = new Terminal({ cols: snapshot.terminal.cols, rows: snapshot.terminal.rows, scrollback: 1000, allowProposedApi: true })
      await write(restored, snapshot.screen)
      restoreTerminalEmulatorState(restored, snapshot.emulatorState)
      service.ack(snapshot, owner)
      service.detach(snapshot, owner)
      return restored
    },
    dispose: async () => { reference.dispose(); await service.dispose() }
  }
}

const stops = (cols: number, step: number) => '\u001b[3g' + Array.from({ length: Math.floor((cols - 1) / step) }, (_, i) => `\u001b[1;${(i + 1) * step + 1}H\u001bH`).join('') + '\u001b[1;1H'

describe('W5-F10 narrow / widen / attach cycles equal a continuous xterm', () => {
  it('default stops: 76 -> 51 -> attach x3 -> 76 -> attach -> Tab', async () => {
    const h = await harness(76, 24)
    try {
      await h.feed('$ echo hello\r\nhello\r\n$ ')
      for (let round = 0; round < 3; round++) { await h.resize(51); (await h.attachAndRestore()).dispose() }
      await h.resize(76)
      const restored = await h.attachAndRestore()
      expect(text(restored)).toEqual(text(h.reference))
      for (const t of [restored, h.reference]) await write(t, '\r\t\tX')
      expect(cursor(restored)).toEqual(cursor(h.reference))
      expect(text(restored)).toEqual(text(h.reference))
      restored.dispose()
    } finally { await h.dispose() }
  })
  it('`tabs 4` style stops survive 76 -> 51 -> 76 and attach', async () => {
    const h = await harness(76, 24)
    try {
      await h.feed(stops(76, 4))
      await h.resize(51); (await h.attachAndRestore()).dispose()
      await h.resize(76)
      const restored = await h.attachAndRestore()
      for (const t of [restored, h.reference]) await write(t, '\r\t\t\tX')
      expect(cursor(restored)).toEqual(cursor(h.reference))
      restored.dispose()
    } finally { await h.dispose() }
  })
  it('far-column HTS at 200 on a 220 column grid, narrowed to 80, attached, widened again', async () => {
    const h = await harness(220, 24)
    try {
      await h.feed('\u001b[3g\u001b[1;201H\u001bH\u001b[1;1H')
      await h.resize(80); (await h.attachAndRestore()).dispose()
      await h.resize(220)
      const restored = await h.attachAndRestore()
      for (const t of [restored, h.reference]) await write(t, '\r\tX')
      expect(cursor(restored)).toEqual(cursor(h.reference))
      // 连续参考本身在缩列再放大后的 Tab 落点由 xterm 决定（自定义远端 stop 不一定保留）；断言只要求恢复结果与参考一致。
      restored.dispose()
    } finally { await h.dispose() }
  })
  it('minimum width 2 columns then maximum 500 columns, attaching at every step', async () => {
    const h = await harness(76, 24)
    try {
      await h.feed('\u001b[3g\u001b[1;61H\u001bH\u001b[1;1H$ x')
      for (const cols of [10, 2, 3, 50, 500, 120, 76]) { await h.resize(cols); (await h.attachAndRestore()).dispose() }
      const restored = await h.attachAndRestore()
      for (const t of [restored, h.reference]) await write(t, '\r\tX')
      expect(cursor(restored)).toEqual(cursor(h.reference))
      restored.dispose()
    } finally { await h.dispose() }
  })
  it('alternate screen active while narrowing and attaching', async () => {
    const h = await harness(76, 24)
    try {
      await h.feed('main\r\n\u001b[?1049h\u001b[3g\u001b[1;61H\u001bH\u001b[2;5HALT')
      await h.resize(51)
      const narrow = await h.attachAndRestore()
      expect(narrow.buffer.active.type).toBe('alternate')
      narrow.dispose()
      await h.resize(76)
      const restored = await h.attachAndRestore()
      for (const t of [restored, h.reference]) await write(t, '\u001b[1;1H\t\tY')
      expect(cursor(restored)).toEqual(cursor(h.reference))
      expect(restored.buffer.active.type).toBe(h.reference.buffer.active.type)
      restored.dispose()
    } finally { await h.dispose() }
  })
  it('resized while "hidden" (no attachment at all), then attached once', async () => {
    const h = await harness(76, 24)
    try {
      await h.feed('$ printf "a\\tb\\n"\r\na\tb\r\n$ ')
      await h.resize(51); await h.resize(60); await h.resize(51)
      const restored = await h.attachAndRestore()
      expect(text(restored)).toEqual(text(h.reference))
      await h.resize(76)
      const wide = await h.attachAndRestore()
      for (const t of [wide, h.reference]) await write(t, '\r\t\t\tZ')
      expect(cursor(wide)).toEqual(cursor(h.reference))
      restored.dispose(); wide.dispose()
    } finally { await h.dispose() }
  })
})
