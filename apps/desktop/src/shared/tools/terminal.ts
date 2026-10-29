/** User terminals belong to Projects, independently of agent Sessions. */
export interface TerminalRef {
  projectId: string
  terminalId: string
  generation: number
}

export type TerminalState = 'running' | 'closing' | 'exited' | 'close_failed'

export interface TerminalSummary extends TerminalRef {
  title: string
  shell: string
  cwd: string
  createdAt: string
  state: TerminalState
  cols: number
  rows: number
  exitCode?: number
  signal?: number
  error?: string
  /** Foreground process name (VS Code-style tab label), when known. */
  process?: string
  /** The user renamed the tab. */
  renamed?: boolean
}

export interface TerminalCreateRequest {
  projectId: string
  cols: number
  rows: number
  /** Project-relative directory to start in (Files "在终端中打开"); the Project root when omitted. */
  cwd?: string
}

export const TERMINAL_TITLE_LIMIT = 64
export interface TerminalRenameRequest extends TerminalRef { title: string }

export interface TerminalAttachment extends TerminalRef {
  attachmentId: string
}

/** Write the snapshot into a fresh/reset xterm, then ack its sequence to start output. */
export interface TerminalSnapshot extends TerminalAttachment {
  terminal: TerminalSummary
  sequence: number
  /** Serialized ANSI screen, cursor, modes, alternate screen and bounded scrollback. */
  screen: string
  emulatorState: TerminalEmulatorState
}

interface TerminalAttributes { fg: number; bg: number; extended: { ext: number; underlineColor: number; urlId: number } }
interface TerminalLink {
  sourceId: number
  /** A disposed link may still be referenced by xterm's current/saved attributes. */
  uri: string | null
  id?: string
  normal: number[]
  alternate: number[]
}
interface TerminalCellAttributes {
  palette: TerminalAttributes[]
  /** Each line is a run-length encoding of [cell count, palette index]. */
  normal: number[][]
  alternate: number[][]
  links: TerminalLink[]
}
type TerminalCharset = Record<string, string> | null
interface TerminalBufferState {
  x: number; y: number; savedX: number; savedYRelative: number
  savedAttributes: TerminalAttributes; savedCharset: TerminalCharset
  scrollTop: number; scrollBottom: number; tabs: number[]
}

/** Schema 1 is deliberately tied to the locked xterm.js 6.0 model. */
export interface TerminalEmulatorState {
  version: 1
  xtermVersion: '6.0.0'
  activeBuffer: 'normal' | 'alternate'
  cols: number
  rows: number
  normal: TerminalBufferState
  alternate: TerminalBufferState
  attributes: TerminalAttributes
  eraseAttributes: TerminalAttributes
  charset: TerminalCharset
  charsets: TerminalCharset[]
  glevel: number
  stringInterim: number
  precedingJoinState: number
  modes: Record<string, boolean>
  cursorHidden: boolean
  cursorInitialized: boolean
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  cursorStyleOverride: 'block' | 'underline' | 'bar' | null
  cursorBlinkOverride: boolean | null
  mouseProtocol: string
  mouseEncoding: string
  cells: TerminalCellAttributes
}

type Shape = Record<string, unknown>
function shape(value: unknown): Shape {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unsupported xterm 6 emulator shape')
  return value as Shape
}
/** Widest grid a Terminal can have. Tab stops are bounded by it, not by the current width (see capture). */
const MAX_TERMINAL_COLS = 500
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid terminal emulator state')
  return value
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid terminal emulator state')
  return value
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error('Unsupported terminal input mode')
  return value as T
}
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum || Object.keys(value).length !== value.length) throw new Error('Invalid terminal emulator list')
  for (let index = 0; index < value.length; index++) if (!Object.prototype.hasOwnProperty.call(value, index)) throw new Error('Invalid terminal emulator list')
  return value as unknown[]
}
function keys(value: Shape, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Unknown terminal emulator state field')
}
function attrs(value: unknown): TerminalAttributes {
  const attr = shape(value), ext = shape(attr.extended)
  // ext's public getter synthesizes URL underline style; preserve the raw bits instead.
  return { fg: number(attr.fg, -0x80000000, 0xffffffff), bg: number(attr.bg, -0x80000000, 0xffffffff), extended: { ext: number(ext._ext, -0x80000000, 0xffffffff), underlineColor: number(ext.underlineColor, -1, 0xffffffff), urlId: number(ext.urlId, 0, 0x7fffffff) } }
}
function snapshotAttrs(value: unknown): TerminalAttributes {
  const attribute = shape(value)
  keys(attribute, ['fg', 'bg', 'extended'])
  const ext = shape(attribute.extended)
  keys(ext, ['ext', 'underlineColor', 'urlId'])
  return { fg: number(attribute.fg, -0x80000000, 0xffffffff), bg: number(attribute.bg, -0x80000000, 0xffffffff), extended: { ext: number(ext.ext, -0x80000000, 0xffffffff), underlineColor: number(ext.underlineColor, -1, 0xffffffff), urlId: number(ext.urlId, 0, 0x7fffffff) } }
}
function charset(value: unknown): TerminalCharset {
  if (value === undefined || value === null) return null
  const map = shape(value), result: Record<string, string> = Object.create(null)
  if (Object.keys(map).length > 128) throw new Error('Terminal character set exceeds limit')
  for (const [key, text] of Object.entries(map)) {
    if (key.length !== 1 || key.charCodeAt(0) > 127 || typeof text !== 'string' || text.length > 2) throw new Error('Invalid terminal character set')
    result[key] = text
  }
  return result
}
function internals(terminal: unknown) {
  const outer = shape(terminal), core = shape(outer._core), handler = shape(core._inputHandler)
  const buffers = shape(shape(core._bufferService).buffers), normal = shape(buffers.normal), alternate = shape(buffers.alt)
  const service = shape(core.coreService ?? core._coreService), cs = shape(handler._charsetService)
  const parser = shape(handler._parser), decoder = shape(handler._stringDecoder), mouse = shape(handler._coreMouseService)
  const options = shape(shape(handler._optionsService).options)
  for (const buffer of [normal, alternate]) {
    for (const name of ['x', 'y', 'ybase', 'savedX', 'savedY', 'scrollTop', 'scrollBottom']) number(buffer[name], -100000, 100000)
    shape(buffer.savedCurAttrData); shape(buffer.tabs)
  }
  attrs(handler._curAttrData); attrs(handler._eraseAttrDataInternal)
  number(parser.currentState, 0, 13); number(decoder._interim, 0, 0xffff)
  shape(service.decPrivateModes); shape(service.modes)
  return { outer, handler, normal, alternate, service, cs, parser, decoder, mouse, options }
}

const DEC_MODES = ['applicationCursorKeys', 'applicationKeypad', 'bracketedPasteMode', 'origin', 'reverseWraparound', 'sendFocus', 'synchronizedOutput', 'wraparound']
const CURSOR_STYLES = ['block', 'underline', 'bar'] as const
const HAS_EXTENDED = 0x10000000
const MAX_CELL_COUNT = 700000 // 500 columns * (1000 scrollback + 200 normal + 200 alternate).
const MAX_LINKS = 4096
const MAX_LINK_TEXT = 256 * 1024

function method(target: Shape, key: string): (...args: unknown[]) => unknown {
  if (typeof target[key] !== 'function') throw new Error('Unsupported xterm 6 emulator method')
  return (target[key] as (...args: unknown[]) => unknown).bind(target)
}
function linkModel(handler: Shape) {
  const service = shape(handler._oscLinkService)
  if (!(service._dataByLinkId instanceof Map) || !(service._entriesWithId instanceof Map)) throw new Error('Unsupported xterm link service')
  number(service._nextId, 1, 0x7fffffff)
  return { service, data: service._dataByLinkId as Map<number, unknown>, named: service._entriesWithId as Map<string, unknown>, remove: method(service, '_removeMarkerFromLink') }
}
function captureCells(model: ReturnType<typeof internals>, cols: number, rows: number, states: TerminalAttributes[]): TerminalCellAttributes {
  const palette: TerminalAttributes[] = [], indexes = new Map<string, number>(), referenced = new Set<number>()
  const remember = (attribute: TerminalAttributes) => { if (attribute.extended.urlId) referenced.add(attribute.extended.urlId) }
  states.forEach(remember)
  let count = 0
  const publicBuffers = shape(model.outer.buffer)
  const capture = (name: 'normal' | 'alternate', maximum: number): number[][] => {
    const buffer = shape(publicBuffers[name]), length = number(buffer.length, 0, maximum)
    const getLine = method(buffer, 'getLine'), scratch = method(buffer, 'getNullCell')(), result: number[][] = []
    for (let y = 0; y < length; y++) {
      const line = shape(getLine(y)), getCell = method(line, 'getCell'), runs: number[] = []
      for (let x = 0; x < cols; x++) {
        const cell = shape(getCell(x, scratch)), attribute = attrs(cell)
        // Non-extended cells can carry a stale scratch ExtendedAttrs object in CellData.
        if (!(attribute.bg & HAS_EXTENDED)) attribute.extended = { ext: 0, underlineColor: 0, urlId: 0 }
        remember(attribute)
        const key = `${attribute.fg},${attribute.bg},${attribute.extended.ext},${attribute.extended.underlineColor},${attribute.extended.urlId}`
        let index = indexes.get(key)
        if (index === undefined) { index = palette.length; palette.push(attribute); indexes.set(key, index) }
        if (runs.length && runs[runs.length - 1] === index) runs[runs.length - 2] = runs[runs.length - 2]! + 1
        else runs.push(1, index)
        if (++count > MAX_CELL_COUNT) throw new Error('Terminal cell attributes exceed limit')
      }
      result.push(runs)
    }
    return result
  }
  const normal = capture('normal', rows + 1000), alternate = capture('alternate', rows)
  if (referenced.size > MAX_LINKS) throw new Error('Terminal links exceed limit')
  const links = linkModel(model.handler), result: TerminalLink[] = []
  let textSize = 0
  for (const sourceId of referenced) {
    const entryValue = links.data.get(sourceId)
    if (!entryValue) { result.push({ sourceId, uri: null, normal: [], alternate: [] }); continue }
    const entry = shape(entryValue), data = shape(entry.data)
    if (typeof data.uri !== 'string' || (data.id !== undefined && typeof data.id !== 'string')) throw new Error('Unsupported xterm link data')
    textSize += data.uri.length + (typeof data.id === 'string' ? data.id.length : 0)
    if (textSize > MAX_LINK_TEXT) throw new Error('Terminal link text exceeds limit')
    const markers = list(entry.lines, normal.length + alternate.length)
    const markerLines = (buffer: Shape, maximum: number): number[] => {
      if (!Array.isArray(buffer.markers)) throw new Error('Unsupported xterm buffer markers')
      return markers.filter((marker) => (buffer.markers as unknown[]).includes(marker)).map((marker) => number(shape(marker).line, 0, maximum - 1))
    }
    result.push({ sourceId, uri: data.uri, ...(data.id === undefined ? {} : { id: data.id as string }), normal: markerLines(model.normal, normal.length), alternate: markerLines(model.alternate, alternate.length) })
  }
  return { palette, normal, alternate, links: result }
}

/** Fully validates both untrusted data and pinned target APIs before changing the model. */
function prepareCells(model: ReturnType<typeof internals>, raw: unknown, cols: number, rows: number, states: TerminalAttributes[]) {
  const value = shape(raw); keys(value, ['palette', 'normal', 'alternate', 'links'])
  const palette = list(value.palette, MAX_CELL_COUNT).map(snapshotAttrs)
  const publicBuffers = shape(model.outer.buffer)
  const nativeBuffers = { normal: model.normal, alternate: model.alternate }
  const lines: { runs: number[]; getCell: (...args: unknown[]) => unknown; setCell: (...args: unknown[]) => unknown }[] = []
  let totalCells = 0
  const parseLines = (name: 'normal' | 'alternate', maximum: number): number[][] => {
    const source = list(value[name], maximum), target = shape(publicBuffers[name])
    if (target.length !== source.length) throw new Error('Terminal snapshot buffer length mismatch')
    const getLine = method(target, 'getLine'), result: number[][] = []
    for (const [y, sourceLine] of source.entries()) {
      const runs = list(sourceLine, cols * 2).map((entry) => number(entry, 0, MAX_CELL_COUNT))
      if (!runs.length || runs.length % 2) throw new Error('Invalid terminal cell runs')
      let width = 0
      for (let index = 0; index < runs.length; index += 2) {
        width += number(runs[index], 1, cols)
        number(runs[index + 1], 0, palette.length - 1)
      }
      if (width !== cols || (totalCells += width) > MAX_CELL_COUNT) throw new Error('Terminal cell attributes exceed limit')
      const line = shape(getLine(y)), native = shape(line._line)
      if (line.length !== cols) throw new Error('Terminal snapshot line width mismatch')
      const getCell = method(line, 'getCell'), setCell = method(native, 'setCell')
      const probe = shape(getCell(0)); number(probe.content, 0, 0xffffffff); attrs(probe)
      lines.push({ runs, getCell, setCell }); result.push(runs)
    }
    method(nativeBuffers[name], 'addMarker')
    return result
  }
  const normal = parseLines('normal', rows + 1000), alternate = parseLines('alternate', rows)
  const links = linkModel(model.handler), remap = new Map<number, number>(), parsedLinks: TerminalLink[] = []
  let nextId = number(links.service._nextId, 1, 0x7fffffff), textSize = 0
  const namedKeys = new Set<string>()
  for (const rawLink of list(value.links, MAX_LINKS)) {
    const entry = shape(rawLink); keys(entry, ['sourceId', 'uri', 'id', 'normal', 'alternate'])
    const sourceId = number(entry.sourceId, 1, 0x7fffffff)
    if (remap.has(sourceId) || nextId >= 0x7fffffff) throw new Error('Invalid terminal link identity')
    if ((entry.uri !== null && typeof entry.uri !== 'string') || (entry.id !== undefined && typeof entry.id !== 'string')) throw new Error('Invalid terminal link data')
    const uri = entry.uri as string | null, id = entry.id as string | undefined
    textSize += (uri?.length ?? 0) + (id?.length ?? 0)
    if (textSize > MAX_LINK_TEXT) throw new Error('Terminal link text exceeds limit')
    const normalLines = list(entry.normal, normal.length).map((line) => number(line, 0, normal.length - 1))
    const alternateLines = list(entry.alternate, alternate.length).map((line) => number(line, 0, alternate.length - 1))
    if (new Set(normalLines).size !== normalLines.length || new Set(alternateLines).size !== alternateLines.length || (uri === null && (id !== undefined || normalLines.length || alternateLines.length)) || (uri !== null && !normalLines.length && !alternateLines.length)) throw new Error('Invalid terminal link markers')
    if (id !== undefined) {
      const key = `${id};;${uri}`
      if (namedKeys.has(key) || links.named.has(key)) throw new Error('Conflicting terminal link identity')
      namedKeys.add(key)
    }
    remap.set(sourceId, nextId++)
    parsedLinks.push({ sourceId, uri, ...(id === undefined ? {} : { id }), normal: normalLines, alternate: alternateLines })
  }
  for (const attribute of [...palette, ...states]) if (attribute.extended.urlId && !remap.has(attribute.extended.urlId)) throw new Error('Missing terminal link identity')
  const template = shape(shape(model.handler._curAttrData).extended), cloneExtended = method(template, 'clone')
  // Build native attributes detached from the live current/saved attribute objects.
  const extended = palette.map((attribute) => {
    const ext = shape(cloneExtended())
    ext.ext = attribute.extended.ext; ext.underlineColor = attribute.extended.underlineColor; ext.urlId = remap.get(attribute.extended.urlId) ?? 0
    return ext
  })
  return { remap, apply: () => {
    links.service._nextId = nextId
    for (const link of parsedLinks) {
      if (link.uri === null) continue
      const id = remap.get(link.sourceId)!, data = { uri: link.uri, ...(link.id === undefined ? {} : { id: link.id }) }
      const markers: unknown[] = [], entry: Shape = { id, data, lines: markers }
      if (link.id !== undefined) { entry.key = `${link.id};;${link.uri}`; links.named.set(entry.key as string, entry) }
      links.data.set(id, entry)
      for (const name of ['normal', 'alternate'] as const) for (const y of link[name]) {
        const marker = shape(method(nativeBuffers[name], 'addMarker')(y))
        markers.push(marker)
        method(marker, 'onDispose')(() => links.remove(entry, marker))
      }
    }
    for (const line of lines) {
      let x = 0
      for (let index = 0; index < line.runs.length; index += 2) {
        const count = line.runs[index]!, paletteIndex = line.runs[index + 1]!, attribute = palette[paletteIndex]!
        for (let end = x + count; x < end; x++) {
          const cell = shape(line.getCell(x))
          cell.fg = attribute.fg; cell.bg = attribute.bg; cell.extended = extended[paletteIndex]
          line.setCell(x, cell)
        }
      }
    }
  } }
}

/** Complements SerializeAddon with bounded future-output state it does not serialize. */
export function captureTerminalEmulatorState(terminal: unknown): TerminalEmulatorState {
  const model = internals(terminal)
  const cols = number(model.outer.cols, 2, 500), rows = number(model.outer.rows, 1, 200)
  const buffer = (value: Shape): TerminalBufferState => ({
    x: number(value.x, 0, cols), y: number(value.y, 0, rows - 1),
    savedX: number(value.savedX, 0, 500), savedYRelative: number(Number(value.savedY) - Number(value.ybase), -100000, 100000),
    savedAttributes: attrs(value.savedCurAttrData), savedCharset: charset(value.savedCharset),
    scrollTop: number(value.scrollTop, 0, rows - 1), scrollBottom: number(value.scrollBottom, 0, rows - 1),
    // xterm never removes tab stops beyond the current width when the grid narrows, and they apply again if it
    // grows; bounding them by `cols` made every attach fail after a pane narrowed (W5-F10).
    tabs: Object.entries(shape(value.tabs)).filter(([, active]) => active).map(([key]) => number(Number(key), 0, MAX_TERMINAL_COLS - 1))
  })
  const mode = shape(model.service.decPrivateModes), modes: Record<string, boolean> = Object.create(null)
  for (const name of DEC_MODES) modes[name] = bool(mode[name])
  modes.insertMode = bool(shape(model.service.modes).insertMode)
  const charsets = model.cs._charsets
  if (!Array.isArray(charsets) || charsets.length > 4) throw new Error('Unsupported xterm character set shape')
  const style = choice(model.options.cursorStyle, CURSOR_STYLES)
  const normal = buffer(model.normal), alternate = buffer(model.alternate)
  const attributes = attrs(model.handler._curAttrData), eraseAttributes = attrs(model.handler._eraseAttrDataInternal)
  return {
    version: 1, xtermVersion: '6.0.0', activeBuffer: choice(shape(shape(model.outer.buffer).active).type, ['normal', 'alternate']), cols, rows, normal, alternate,
    attributes, eraseAttributes,
    charset: charset(model.cs.charset), charsets: Array.from(charsets, charset), glevel: number(model.cs.glevel, 0, 3),
    stringInterim: number(model.decoder._interim, 0, 0xffff), precedingJoinState: number(model.parser.precedingJoinState, 0, 0xffffffff),
    modes, cursorHidden: bool(model.service.isCursorHidden), cursorInitialized: bool(model.service.isCursorInitialized),
    cursorStyle: style, cursorBlink: bool(model.options.cursorBlink),
    cursorStyleOverride: mode.cursorStyle === undefined ? null : choice(mode.cursorStyle, CURSOR_STYLES),
    cursorBlinkOverride: mode.cursorBlink === undefined ? null : bool(mode.cursorBlink),
    mouseProtocol: choice(model.mouse.activeProtocol, ['NONE', 'X10', 'VT200', 'DRAG', 'ANY']), mouseEncoding: choice(model.mouse.activeEncoding, ['DEFAULT', 'SGR', 'SGR_PIXELS']),
    cells: captureCells(model, cols, rows, [attributes, eraseAttributes, normal.savedAttributes, alternate.savedAttributes])
  }
}

/** Call after writing snapshot.screen, before ACK. Throws before mutation on incompatible snapshots. */
export function restoreTerminalEmulatorState(terminal: unknown, raw: unknown): void {
  const value = shape(raw)
  keys(value, ['version', 'xtermVersion', 'activeBuffer', 'cols', 'rows', 'normal', 'alternate', 'attributes', 'eraseAttributes', 'charset', 'charsets', 'glevel', 'stringInterim', 'precedingJoinState', 'modes', 'cursorHidden', 'cursorInitialized', 'cursorStyle', 'cursorBlink', 'cursorStyleOverride', 'cursorBlinkOverride', 'mouseProtocol', 'mouseEncoding', 'cells'])
  if (value.version !== 1 || value.xtermVersion !== '6.0.0') throw new Error('Unsupported terminal emulator snapshot version')
  const cols = number(value.cols, 2, MAX_TERMINAL_COLS), rows = number(value.rows, 1, 200)
  const parseBuffer = (rawBuffer: unknown): TerminalBufferState => {
    const buffer = shape(rawBuffer)
    keys(buffer, ['x', 'y', 'savedX', 'savedYRelative', 'savedAttributes', 'savedCharset', 'scrollTop', 'scrollBottom', 'tabs'])
    const tabs = list(buffer.tabs, MAX_TERMINAL_COLS)
    const result = {
      x: number(buffer.x, 0, cols), y: number(buffer.y, 0, rows - 1), savedX: number(buffer.savedX, 0, 500),
      savedYRelative: number(buffer.savedYRelative, -100000, 100000), savedAttributes: snapshotAttrs(buffer.savedAttributes), savedCharset: charset(buffer.savedCharset),
      scrollTop: number(buffer.scrollTop, 0, rows - 1), scrollBottom: number(buffer.scrollBottom, 0, rows - 1), tabs: tabs.map((tab) => number(tab, 0, MAX_TERMINAL_COLS - 1))
    }
    if (result.scrollTop > result.scrollBottom) throw new Error('Invalid terminal scroll margins')
    return result
  }
  const normal = parseBuffer(value.normal), alternate = parseBuffer(value.alternate), attributes = snapshotAttrs(value.attributes), erase = snapshotAttrs(value.eraseAttributes)
  const currentCharset = charset(value.charset)
  const charsets = list(value.charsets, 4).map(charset), glevel = number(value.glevel, 0, 3)
  const interim = number(value.stringInterim, 0, 0xffff), join = number(value.precedingJoinState, 0, 0xffffffff)
  if (interim !== 0 && (interim < 0xd800 || interim > 0xdbff)) throw new Error('Invalid terminal decoder carry')
  const modes = shape(value.modes); keys(modes, [...DEC_MODES, 'insertMode'])
  for (const name of [...DEC_MODES, 'insertMode']) bool(modes[name])
  const hidden = bool(value.cursorHidden), initialized = bool(value.cursorInitialized), blink = bool(value.cursorBlink)
  if (value.cursorBlinkOverride !== null) bool(value.cursorBlinkOverride)
  if (value.cursorStyleOverride !== null) choice(value.cursorStyleOverride, CURSOR_STYLES)
  const style = choice(value.cursorStyle, CURSOR_STYLES), protocol = choice(value.mouseProtocol, ['NONE', 'X10', 'VT200', 'DRAG', 'ANY']), encoding = choice(value.mouseEncoding, ['DEFAULT', 'SGR', 'SGR_PIXELS'])
  const model = internals(terminal)
  if (model.outer.cols !== cols || model.outer.rows !== rows) throw new Error('Terminal snapshot dimensions mismatch')
  if (shape(shape(model.outer.buffer).active).type !== choice(value.activeBuffer, ['normal', 'alternate'])) throw new Error('Terminal snapshot active buffer mismatch')
  const overlay = prepareCells(model, value.cells, cols, rows, [attributes, erase, normal.savedAttributes, alternate.savedAttributes])
  const applyAttrs = (target: unknown, state: TerminalAttributes) => {
    const attr = shape(target), extended = shape(attr.extended)
    attr.fg = state.fg; attr.bg = state.bg; extended.ext = state.extended.ext; extended.underlineColor = state.extended.underlineColor; extended.urlId = overlay.remap.get(state.extended.urlId) ?? 0
  }
  const applyBuffer = (target: Shape, state: TerminalBufferState) => {
    target.x = state.x; target.y = state.y; target.savedX = state.savedX; target.savedY = Number(target.ybase) + state.savedYRelative
    target.scrollTop = state.scrollTop; target.scrollBottom = state.scrollBottom
    target.savedCharset = state.savedCharset ?? undefined
    applyAttrs(target.savedCurAttrData, state.savedAttributes)
    const tabs: Shape = Object.create(null); for (const tab of state.tabs) tabs[tab] = true
    target.tabs = tabs
  }
  overlay.apply()
  applyBuffer(model.normal, normal); applyBuffer(model.alternate, alternate)
  applyAttrs(model.handler._curAttrData, attributes); applyAttrs(model.handler._eraseAttrDataInternal, erase)
  model.cs.charset = currentCharset ?? undefined; model.cs._charsets = charsets.map((set) => set ?? undefined); model.cs.glevel = glevel
  model.decoder._interim = interim; model.parser.precedingJoinState = join
  const privateModes = shape(model.service.decPrivateModes)
  for (const name of DEC_MODES) privateModes[name] = modes[name]
  privateModes.cursorStyle = value.cursorStyleOverride ?? undefined; privateModes.cursorBlink = value.cursorBlinkOverride ?? undefined
  shape(model.service.modes).insertMode = modes.insertMode
  model.service.isCursorHidden = hidden; model.service.isCursorInitialized = initialized
  model.options.cursorStyle = style; model.options.cursorBlink = blink
  model.mouse.activeProtocol = protocol; model.mouse.activeEncoding = encoding
  if (typeof model.outer.refresh === 'function') method(model.outer, 'refresh')(0, rows - 1)
}

export interface TerminalOutput extends TerminalAttachment {
  sequence: number
  data: string
}

export interface TerminalAckRequest extends TerminalAttachment {
  sequence: number
}

export interface TerminalInputRequest extends TerminalRef { data: string }
export interface TerminalResizeRequest extends TerminalRef { cols: number; rows: number }
export interface TerminalCloseRequest extends TerminalRef { confirmed: boolean }

export type TerminalCloseResult =
  | { status: 'needs_confirmation'; terminal: TerminalSummary }
  | { status: 'closed' }
  | { status: 'failed'; terminal: TerminalSummary; error: string }

export interface TerminalChanged {
  projectId: string
  /** Exited tabs remain in the list until explicitly closed. */
  terminals: TerminalSummary[]
}
