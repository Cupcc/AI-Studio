import { lazy, Suspense, useEffect, useRef, useState, type DragEvent, type MouseEvent, type MutableRefObject } from 'react'
import type { TerminalSummary } from '@shared/tools/terminal'
import { Icon } from '../../app/Icon'
import { popupMenu, separator } from '../../lib/menu'
import { terminalApi } from './api'
import { FILES_DRAG_TYPE } from './files/FileTree'
import { shellQuote } from './terminal-links'
import type { TerminalControls } from './TerminalScreen'
import { useTerminals } from './terminal-store'

const TerminalScreen = lazy(() => import('./TerminalScreen'))

/** VS Code's terminal find widget (⌘F): Enter / ⇧Enter step through matches, Esc closes. */
function FindBar({ controls, onClose }: { controls: MutableRefObject<TerminalControls | null>; onClose(): void }) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState({ caseSensitive: false, wholeWord: false, regex: false })
  const [missing, setMissing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  const find = (direction: 'next' | 'previous', text = query, next = options) => {
    if (!text) { controls.current?.clearFind(); setMissing(false); return }
    let found = false
    try { found = controls.current?.find(text, direction, next) ?? false } catch { found = false }
    setMissing(!found)
  }
  const close = () => { controls.current?.clearFind(); onClose(); controls.current?.focus() }
  const toggle = (key: keyof typeof options) => { const next = { ...options, [key]: !options[key] }; setOptions(next); find('next', query, next) }
  return <div className="terminal-find" role="search" aria-label="在终端中查找">
    <input ref={input} type="text" aria-label="查找" placeholder="查找" value={query} spellCheck={false} aria-invalid={missing}
      onChange={event => { setQuery(event.target.value); find('next', event.target.value) }}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); find(event.shiftKey ? 'previous' : 'next') }
        else if (event.key === 'Escape') { event.preventDefault(); close() }
      }} />
    <button className={`search-toggle ${options.caseSensitive ? 'is-selected' : ''}`} aria-label="区分大小写" aria-pressed={options.caseSensitive} onClick={() => toggle('caseSensitive')}><Icon name="case-sensitive" size={14} /></button>
    <button className={`search-toggle ${options.wholeWord ? 'is-selected' : ''}`} aria-label="全字匹配" aria-pressed={options.wholeWord} onClick={() => toggle('wholeWord')}><Icon name="whole-word" size={14} /></button>
    <button className={`search-toggle ${options.regex ? 'is-selected' : ''}`} aria-label="使用正则表达式" aria-pressed={options.regex} onClick={() => toggle('regex')}><Icon name="regex" size={14} /></button>
    {missing && query && <span className="terminal-find__none" role="status">无结果</span>}
    <button className="icon-button" aria-label="上一个匹配" onClick={() => find('previous')}><Icon name="chevron-up" size={14} /></button>
    <button className="icon-button" aria-label="下一个匹配" onClick={() => find('next')}><Icon name="chevron" size={14} /></button>
    <button className="icon-button" aria-label="关闭查找" onClick={close}><Icon name="close" size={13} /></button>
  </div>
}

function RenameInput({ tab, onDone }: { tab: TerminalSummary; onDone(): void }) {
  const [value, setValue] = useState(tab.title)
  const done = useRef(false)
  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    const title = value.trim()
    if (commit && title && title !== tab.title) void useTerminals.getState().rename(tab, title)
    onDone()
  }
  return <input className="terminal-tab__rename" aria-label="终端名称" value={value} autoFocus maxLength={64} spellCheck={false}
    onFocus={event => event.currentTarget.select()} onChange={event => setValue(event.target.value)}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); finish(true) } else if (event.key === 'Escape') { event.preventDefault(); finish(false) } }}
    onBlur={() => finish(true)} />
}

export function TerminalPanel({ projectId, active, overlayBlocked = false, projectRoot = '' }: { projectId: string; active: boolean; overlayBlocked?: boolean; projectRoot?: string }) {
  const project = useTerminals(s => s.projects[projectId])
  const [confirming, setConfirming] = useState<TerminalSummary | null>(null)
  const [screenError, setScreenError] = useState<string | null>(null)
  const [screenVersion, setScreenVersion] = useState(0)
  const [finding, setFinding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  // One control handle per visible pane; the focused pane's is used by the find bar and the menu.
  const paneControls = useRef(new Map<string, MutableRefObject<TerminalControls | null>>())
  const controlsOf = (terminalId: string) => {
    let ref = paneControls.current.get(terminalId)
    if (!ref) { ref = { current: null }; paneControls.current.set(terminalId, ref) }
    return ref
  }
  const splitArea = useRef<HTMLDivElement>(null)
  const [stacked, setStacked] = useState(false)
  useEffect(() => { if (active) void useTerminals.getState().open(projectId) }, [projectId, active])
  useEffect(() => { setConfirming(null); setScreenError(null); setFinding(false) }, [projectId, project?.activeId])
  const terminal = project?.terminals.find(t => t.terminalId === project.activeId)
  const controls = controlsOf(terminal?.terminalId ?? '')
  const byId = new Map((project?.terminals ?? []).map(t => [t.terminalId, t]))
  const tabs = (project?.groups ?? []).flat().flatMap(id => byId.get(id) ?? [])
  const group = (project?.groups.find(ids => ids.includes(project.activeId ?? '')) ?? []).flatMap(id => byId.get(id) ?? [])
  const groupOf = (terminalId: string) => project?.groups.find(ids => ids.includes(terminalId)) ?? []
  // A narrow panel stacks split terminals; a wide one puts them side by side, as VS Code does in its panel.
  useEffect(() => {
    const node = splitArea.current
    if (!node) return
    const observer = new ResizeObserver(() => setStacked(node.clientWidth < 560))
    observer.observe(node)
    return () => observer.disconnect()
  }, [group.length > 1])
  const busy = project?.loading || project?.pending
  async function close(tab: TerminalSummary, confirmed = false) {
    if (!confirmed && (tab.state === 'running' || tab.state === 'closing' || tab.state === 'close_failed')) { setConfirming(tab); return }
    const result = await useTerminals.getState().close(tab, confirmed)
    if (result?.status === 'needs_confirmation') setConfirming(result.terminal)
    else if (result?.status === 'closed') setConfirming(null)
  }
  async function onContextMenu(event: MouseEvent) {
    if (!terminal) return
    event.preventDefault()
    const selection = controls.current?.hasSelection() ?? false
    const choice = await popupMenu([
      { id: 'copy', label: '复制', role: 'copy', enabled: selection, accelerator: 'Cmd+C' },
      { id: 'paste', label: '粘贴', role: 'paste', enabled: terminal.state === 'running', accelerator: 'Cmd+V' },
      { id: 'select-all', label: '全选' },
      separator,
      { id: 'clear', label: '清除终端', accelerator: 'Cmd+K' },
      { id: 'find', label: '查找…', accelerator: 'Cmd+F' },
      separator,
      { id: 'new', label: '新建终端' },
      { id: 'split', label: '拆分终端', accelerator: 'Cmd+\\' },
      { id: 'rename', label: '重命名…' },
      { id: 'kill', label: '关闭终端' }
    ], { x: event.clientX, y: event.clientY })
    if (choice === 'select-all') controls.current?.selectAll()
    else if (choice === 'clear') controls.current?.clear()
    else if (choice === 'find') setFinding(true)
    else if (choice === 'new') void useTerminals.getState().create(projectId)
    else if (choice === 'split') void useTerminals.getState().split(projectId)
    else if (choice === 'rename') setRenaming(terminal.terminalId)
    else if (choice === 'kill') void close(terminal)
  }
  /** Files dragged from the Files tree are typed into the prompt as quoted absolute paths, like VS Code. */
  function onDrop(event: DragEvent) {
    const raw = event.dataTransfer.getData(FILES_DRAG_TYPE)
    if (!raw || !terminal || terminal.state !== 'running' || !projectRoot) return
    event.preventDefault()
    try {
      const payload = JSON.parse(raw) as { projectId?: string; paths?: unknown }
      if (payload.projectId !== projectId || !Array.isArray(payload.paths)) return
      const text = payload.paths.filter((path): path is string => typeof path === 'string').map(path => shellQuote(path ? `${projectRoot}/${path}` : projectRoot)).join(' ')
      if (!text) return
      const { terminalId, generation } = terminal
      void terminalApi().input({ projectId, terminalId, generation, data: `${text} ` }).then(() => controls.current?.focus()).catch(error => setScreenError(`终端输入失败：${String(error)}`))
    } catch { /* not a Files drag */ }
  }
  return <div className="runtime-tool terminal-tool">
    <div className="terminal-tabs" aria-label="Terminal Tabs">
      <div className="terminal-tabs__list" role="tablist" aria-label="终端实例">
        {project && tabs.map(tab => { const members = groupOf(tab.terminalId); return <div className={`terminal-tab ${tab.terminalId === project.activeId ? 'is-selected' : ''} ${members.length > 1 ? 'is-split' : ''} ${members.length > 1 && members[0] !== tab.terminalId ? 'is-split-member' : ''} ${members.includes(project.activeId ?? '') ? 'is-group-shown' : ''}`} key={tab.terminalId}>
          {renaming === tab.terminalId
            ? <RenameInput tab={tab} onDone={() => setRenaming(null)} />
            : <button role="tab" aria-selected={tab.terminalId === project.activeId} aria-controls={`terminal-${projectId}`} onClick={() => useTerminals.getState().select(projectId, tab.terminalId)}
              onDoubleClick={() => setRenaming(tab.terminalId)} title={`${tab.cwd}${tab.process ? ` · ${tab.process}` : ''}`}>
              <Icon name="terminal" size={14} /><span>{tab.title}</span>
              {tab.process && tab.state === 'running' && <span className="terminal-tab__process" aria-hidden="true">{tab.process}</span>}
              {tab.state === 'exited' && <span className="terminal-tab__state">已退出</span>}
            </button>}
          <button className="terminal-tab__close" aria-label={`关闭 ${tab.title}`} disabled={busy} onClick={() => void close(tab)}><Icon name="close" size={12} /></button>
        </div> })}
      </div>
      <button className="icon-button" aria-label="在终端中查找" data-tip="查找 ⌘F" disabled={!terminal} onClick={() => setFinding(value => !value)}><Icon name="search" size={15} /></button>
      <button className="icon-button" aria-label="拆分终端" data-tip={'拆分终端 ⌘\\'} disabled={busy || !terminal} onClick={() => void useTerminals.getState().split(projectId)}><Icon name="split" size={15} /></button>
      <button className="icon-button" aria-label="新建终端" data-tip="新建终端" data-tip-align="end" disabled={busy || !project?.loaded} onClick={() => void useTerminals.getState().create(projectId)}><Icon name="plus" size={15} /></button>
    </div>
    {(project?.error || screenError) && <div className="runtime-tool__error" role="alert">{project?.error || screenError}{screenError && <button className="secondary-button button--small" onClick={() => { setScreenError(null); setScreenVersion(v => v + 1) }}>重新连接</button>}</div>}
    {confirming && <div className="terminal-confirm" role="alertdialog" aria-label={`关闭 ${confirming.title}？`}>
      <p>结束并关闭 {confirming.title}？</p><span className="muted">此终端中仍在运行的进程将结束。</span>
      <div className="terminal-confirm__actions"><button className="secondary-button button--small" disabled={busy} onClick={() => setConfirming(null)}>取消</button><button className="danger-button button--small" disabled={busy} onClick={() => void close(confirming, true)}>{busy ? '正在结束…' : '结束并关闭'}</button></div>
    </div>}
    {finding && terminal && <FindBar controls={controls} onClose={() => setFinding(false)} />}
    {project?.loading && <div className="runtime-tool__empty" role="status">正在打开终端…</div>}
    {!project?.loading && terminal && <div id={`terminal-${projectId}`} className={`terminal-group ${group.length > 1 ? 'is-split' : ''} ${stacked ? 'is-stacked' : ''}`} role="tabpanel" aria-label={terminal.title} ref={splitArea}
      onContextMenu={event => void onContextMenu(event)}
      onDragOver={event => { if (event.dataTransfer.types.includes(FILES_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }}
      onDrop={onDrop}>
      {group.map(pane => <div key={pane.terminalId} className={`terminal-panel ${group.length > 1 && pane.terminalId === terminal.terminalId ? 'is-focused' : ''}`}
        aria-label={group.length > 1 ? pane.title : undefined} role={group.length > 1 ? 'group' : undefined}
        onMouseDownCapture={() => { if (pane.terminalId !== project?.activeId) useTerminals.getState().select(projectId, pane.terminalId) }}>
        <Suspense fallback={<div className="runtime-tool__empty" role="status">正在加载终端…</div>}><TerminalScreen key={`${projectId}:${pane.terminalId}:${pane.generation}:${screenVersion}`} terminal={pane} active={active && !overlayBlocked && !confirming} onError={setScreenError} projectRoot={projectRoot} controls={controlsOf(pane.terminalId)} onFind={() => setFinding(true)} onSplit={() => void useTerminals.getState().split(projectId)} /></Suspense>
        {pane.state === 'exited' && <div className="terminal-exit" role="status">终端已退出{pane.exitCode !== undefined ? `（退出码 ${pane.exitCode}）` : ''}</div>}
        {pane.error && <div className="runtime-tool__error" role="alert">{pane.error}</div>}
      </div>)}
    </div>}
    {!project?.loading && project?.loaded && !terminal && <div className="runtime-tool__empty"><Icon name="terminal" size={28} /><h2>没有打开的终端</h2><button className="secondary-button" disabled={busy} onClick={() => void useTerminals.getState().create(projectId)}>新建终端</button></div>}
    {!project?.loading && !project?.loaded && project?.error && <div className="runtime-tool__empty"><button className="secondary-button" onClick={() => void useTerminals.getState().open(projectId)}>重试打开终端</button></div>}
  </div>
}
