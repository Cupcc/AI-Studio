import { useEffect, useRef, type MutableRefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search'
import { restoreTerminalEmulatorState, type TerminalAttachment, type TerminalSummary } from '@shared/tools/terminal'
import { terminalApi } from './api'
import { createFontGate, type FontGate } from './terminal-font'
import { createLinkProvider } from './terminal-link-provider'
import { useTerminals } from './terminal-store'
import { TERMINAL_MINIMUM_CONTRAST_RATIO, terminalSchemeOf, terminalTheme } from './terminal-theme'
import '@xterm/xterm/css/xterm.css'

const FONT_SIZE = 12

/**
 * xterm re-measures its cells only when `fontFamily` / `fontSize` change, and an assignment of an equal value is
 * ignored. Switching the family string away and back re-reads the glyph metrics once a web font has arrived.
 */
function remeasure(term: Terminal) {
  const family = term.options.fontFamily ?? ''
  term.options.fontFamily = `${family}, sans-serif`
  term.options.fontFamily = family
}

interface TerminalView {
  term: Terminal
  fit: FitAddon
  fonts: FontGate
  /** The cells were measured before the web font was usable; re-measure before the next fit. */
  stale: boolean
  /** Schedules a fit; set while the screen is attached. */
  refit: (() => void) | null
}

/** What the panel can do with the visible screen: find (⌘F), clear (⌘K), selection for the context menu. */
export interface TerminalControls {
  find(query: string, direction: 'next' | 'previous', options: ISearchOptions): boolean
  clearFind(): void
  clear(): void
  selectAll(): void
  hasSelection(): boolean
  focus(): void
}

export interface TerminalScreenProps {
  terminal: TerminalSummary
  active: boolean
  onError(error: string | null): void
  /** The Project's canonical directory, for turning printed paths into Files links. */
  projectRoot?: string
  controls?: MutableRefObject<TerminalControls | null>
  /** ⌘F inside the terminal. */
  onFind?(): void
  /** ⌘\ inside the terminal. */
  onSplit?(): void
}

export default function TerminalScreen({ terminal, active, onError, projectRoot = '', controls, onFind, onSplit }: TerminalScreenProps) {
  const host = useRef<HTMLDivElement>(null)
  const instance = useRef<TerminalView | null>(null)
  const screenReady = useRef(false)
  const latest = useRef({ terminal, onError, active, projectRoot, onFind, onSplit })
  latest.current = { terminal, onError, active, projectRoot, onFind, onSplit }

  useEffect(() => {
    // `node` is the unpadded host: FitAddon sizes the grid from its parent's computed height and width, which for a
    // padded border-box element include the padding (W5-F5). The padding lives on the wrapper around it.
    const node = host.current!
    const family = getComputedStyle(node).getPropertyValue('--font-mono').trim()
    const fonts = createFontGate(`${FONT_SIZE}px ${family}`)
    let scheme = terminalSchemeOf()
    const term = new Terminal({
      cols: terminal.cols, rows: terminal.rows, scrollback: 2000,
      fontFamily: family, fontSize: FONT_SIZE, lineHeight: 1.3,
      cursorBlink: true, allowTransparency: true, minimumContrastRatio: TERMINAL_MINIMUM_CONTRAST_RATIO, theme: terminalTheme(scheme)
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit); term.loadAddon(search); term.open(node)
    // ⌘K clears like VS Code (here and in the Project-held screen, so a re-attach does not bring it back); ⌘F finds.
    term.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown' || !event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return true
      if (event.key === 'k') { term.clear(); void useTerminals.getState().clear(latest.current.terminal); return false }
      if (event.key === 'f') { latest.current.onFind?.(); return false }
      if (event.key === '\\') { latest.current.onSplit?.(); return false }
      return true
    })
    const links = term.registerLinkProvider(createLinkProvider(term,
      () => latest.current.projectRoot ? { projectId: latest.current.terminal.projectId, root: latest.current.projectRoot, cwd: latest.current.terminal.cwd } : null,
      tip => { node.title = tip }))
    if (controls) controls.current = {
      find: (query, direction, options) => direction === 'next' ? search.findNext(query, options) : search.findPrevious(query, options),
      clearFind: () => { search.clearDecorations(); term.clearSelection() },
      clear: () => { term.clear(); void useTerminals.getState().clear(latest.current.terminal) },
      selectAll: () => term.selectAll(),
      hasSelection: () => term.hasSelection(),
      focus: () => term.focus()
    }
    // The Project-owned headless terminal answers queries even while hidden. Suppress duplicate UI replies.
    const queries = [
      ...[{ final: 'n' }, { prefix: '?', final: 'n' }, { final: 'c' }, { prefix: '>', final: 'c' }, { prefix: '=', final: 'c' }, { intermediates: '$', final: 'p' }, { prefix: '?', intermediates: '$', final: 'p' }, { final: 't' }].map(id => term.parser.registerCsiHandler(id, () => true)),
      term.parser.registerDcsHandler({ intermediates: '$', final: 'q' }, () => true)
    ]
    const view: TerminalView = { term, fit, fonts, stale: fonts.pending, refit: null }
    instance.current = view
    const input = term.onData(data => {
      const current = latest.current
      if (!screenReady.current || !current.active || current.terminal.state !== 'running') return
      const { projectId, terminalId, generation } = current.terminal
      void terminalApi().input({ projectId, terminalId, generation, data }).catch(error => current.onError(`终端输入失败：${String(error)}`))
    })
    // The palette depends on the colour scheme only (glass / solid and the wallpaper change CSS, not the table).
    // The settings store writes <html data-scheme>; follow it live without recreating the terminal.
    const appearance = new MutationObserver(() => {
      const next = terminalSchemeOf()
      if (next === scheme) return
      scheme = next; term.options.theme = terminalTheme(next)
    })
    appearance.observe(document.documentElement, { attributes: true, attributeFilter: ['data-scheme'] })
    const fontsLoaded = fonts.onLoaded(() => { view.stale = true; view.refit?.() })
    return () => {
      input.dispose(); links.dispose(); queries.forEach(query => query.dispose()); appearance.disconnect(); fontsLoaded(); fonts.dispose()
      if (controls) controls.current = null
      instance.current = null; term.dispose()
    }
  }, [terminal.projectId, terminal.terminalId, terminal.generation])

  useEffect(() => {
    const view = instance.current
    if (!view) return
    const { term, fit, fonts } = view
    screenReady.current = false
    term.options.disableStdin = true
    if (!active) { term.blur(); return }
    let disposed = false, attachment: TerminalAttachment | null = null, sequence = 0, attaching = false
    let resizeFrame = 0
    let ready = false
    const ref = { projectId: terminal.projectId, terminalId: terminal.terminalId, generation: terminal.generation }
    const attachmentRef = (snapshot: TerminalAttachment): TerminalAttachment => ({ ...ref, attachmentId: snapshot.attachmentId })
    const fail = (prefix: string, error: unknown) => { if (!disposed) latest.current.onError(`${prefix}：${String(error)}`) }
    // The grid size the Project service holds for this attachment; a PTY resize is sent only when a fit changes it.
    let sent: { cols: number; rows: number } | null = null
    const resize = () => {
      const element = host.current
      // Never fit before restoration, nor while the web font is still loading (fallback cell metrics, W5-F5).
      if (disposed || !ready || fonts.pending || !element?.clientWidth || !element.clientHeight) return
      if (view.stale) { view.stale = false; remeasure(term) }
      fit.fit()
      const { cols, rows } = term
      if (sent?.cols === cols && sent.rows === rows) return
      sent = { cols, rows }
      void terminalApi().resize({ ...ref, cols, rows }).catch(error => {
        if (sent?.cols === cols && sent.rows === rows) sent = null
        fail('终端尺寸更新失败', error)
      })
    }
    const measure = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(resize) }
    const observer = new ResizeObserver(measure)
    observer.observe(host.current!)
    view.refit = measure
    // Restoration does not wait for the font (ACK and input are unaffected); only the fit does.
    if (fonts.pending) void fonts.settled.then(() => { if (!disposed) measure() })
    const ack = (current: TerminalAttachment, seen: number) => {
      if (!disposed && attachment?.attachmentId === current.attachmentId) void terminalApi().ack({ ...current, sequence: seen }).catch(error => fail('终端输出确认失败', error))
    }
    const attach = async () => {
      if (disposed || attaching) return
      attaching = true; ready = false
      screenReady.current = false; term.options.disableStdin = true
      const previous = attachment; attachment = null
      if (previous) await terminalApi().detach(previous).catch(() => {})
      try {
        const snapshot = await terminalApi().attach(ref)
        if (disposed) { await terminalApi().detach(attachmentRef(snapshot)); return }
        const current = attachmentRef(snapshot)
        attachment = current; sequence = snapshot.sequence
        // Drain writes from the old attachment before resetting, including a rapid hide/show handoff.
        term.write('', () => {
          if (disposed || attachment?.attachmentId !== snapshot.attachmentId) return
          term.reset(); term.resize(snapshot.terminal.cols, snapshot.terminal.rows)
          term.write(snapshot.screen, () => {
            if (disposed || attachment?.attachmentId !== snapshot.attachmentId) return
            try { restoreTerminalEmulatorState(term, snapshot.emulatorState) }
            catch (error) {
              attachment = null
              void terminalApi().detach(current).catch(() => {})
              fail('无法恢复终端', error)
              return
            }
            screenReady.current = true
            term.options.disableStdin = latest.current.terminal.state !== 'running'
            sent = { cols: snapshot.terminal.cols, rows: snapshot.terminal.rows }
            ready = true; latest.current.onError(null)
            ack(current, snapshot.sequence); resize(); term.focus()
          })
        })
      } catch (error) { fail('无法恢复终端', error) }
      finally { attaching = false }
    }
    // Subscribe before attach; the service starts streaming after the snapshot is parsed and acknowledged.
    const unsubscribe = terminalApi().onOutput(output => {
      const current = attachment
      if (disposed || !current || output.projectId !== ref.projectId || output.terminalId !== ref.terminalId || output.generation !== ref.generation || output.attachmentId !== current.attachmentId || output.sequence <= sequence) return
      if (output.sequence !== sequence + 1) { void attach(); return }
      sequence = output.sequence
      // Output never enters React state. ACK is issued only after xterm has parsed the chunk.
      term.write(output.data, () => ack(current, output.sequence))
    })
    void attach()
    return () => {
      disposed = true; ready = false; screenReady.current = false; observer.disconnect(); cancelAnimationFrame(resizeFrame); unsubscribe(); term.blur()
      if (view.refit === measure) view.refit = null
      if (attachment) void terminalApi().detach(attachment).catch(() => {})
    }
  }, [terminal.projectId, terminal.terminalId, terminal.generation, active])

  useEffect(() => { if (instance.current) instance.current.term.options.disableStdin = !screenReady.current || !active || terminal.state !== 'running' }, [active, terminal.state])
  return <div className="terminal-screen"><div className="terminal-screen__host" ref={host} aria-label="终端输入与输出" /></div>
}
