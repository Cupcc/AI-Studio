/** Uses the locked xterm 6 transition table, not a second approximation of VT parsing. */
export class TerminalParserCarry {
  static readonly LIMIT = 64 * 1024
  private state = 0
  private carry = ''
  private overflow = false
  constructor(private readonly table: Uint8Array) {
    if (table.length !== 4095) throw new Error('Unsupported xterm 6 transition table')
  }
  track(data: Uint32Array, length: number): void {
    for (let index = 0; index < length; index++) {
      const code = data[index]!
      const transition = this.table[this.state * 256 + (code < 0xa0 ? code : 0xa0)]!
      const action = transition >> 4
      let next = transition & 15
      if (code === 0x1b && (action === 6 || action === 14)) next = 1
      const start = code === 0x1b || [0x90, 0x98, 0x9b, 0x9d, 0x9e, 0x9f].includes(code)
      if (start && next !== 0) { this.carry = String.fromCodePoint(code); this.overflow = false }
      else if (next === 0) { this.carry = ''; this.overflow = false }
      // Executed C0 controls already affect the screen; do not replay them.
      else if (action !== 3 && (action !== 0 || next !== this.state) && !this.overflow) {
        this.carry += String.fromCodePoint(code)
        if (this.carry.length > TerminalParserCarry.LIMIT) { this.carry = ''; this.overflow = true }
      }
      this.state = next
    }
  }
  snapshot(actualState: number): string {
    if (actualState !== this.state) throw new Error('Terminal parser state mismatch; cannot safely restore screen')
    if (this.overflow) throw new Error('Unfinished terminal control exceeds 64 KiB; screen cannot attach until the control completes')
    return this.carry
  }
}
