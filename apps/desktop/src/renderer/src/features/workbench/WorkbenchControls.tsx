import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { WorkbenchEntry } from '@shared/workbench/types'
import { describeWorkbenchError } from './api'
import type { HostView } from './host'

/** Menu anchored below a button; `end` aligns its right edge with the anchor. Closes on outside clicks,
 *  window blur (a click into the page iframe never reaches this document), resize and Esc. */
export function WorkbenchMenu({ anchor, children, dismiss, className = '', label = '工作台操作', align = 'start' }: { anchor: HTMLButtonElement; children: ReactNode; dismiss(): void; className?: string; label?: string; align?: 'start' | 'end' }) {
  const panel = useRef<HTMLDivElement>(null)
  const rect = anchor.getBoundingClientRect()
  const [position, setPosition] = useState({ top: rect.bottom + 4, left: rect.left })
  useLayoutEffect(() => {
    const height = panel.current?.offsetHeight ?? 0, width = panel.current?.offsetWidth ?? 0
    setPosition({
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8)),
      left: Math.max(8, Math.min(align === 'end' ? rect.right - width : rect.left, window.innerWidth - width - 8))
    })
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) dismiss() }
    const close = () => dismiss()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); window.removeEventListener('blur', close) }
  }, [anchor, dismiss])
  return createPortal(<div ref={panel} className={`popover workbench-menu ${className}`} role="menu" aria-label={label} style={position} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) dismiss()
  }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); anchor.focus(); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const index = buttons.findIndex(button => button === document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }}>{children}</div>, document.body)
}

export function WorkbenchDialog({ entry, mode, submit, dismiss, restoreFocus }: {
  entry: WorkbenchEntry; mode: 'rename' | 'delete'; submit(title: string): Promise<void>; dismiss(): void; restoreFocus(): void
}) {
  const [title, setTitle] = useState(entry.title), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLFormElement>(null), input = useRef<HTMLInputElement>(null), cancel = useRef<HTMLButtonElement>(null)
  const titleId = useId(), inputId = useId(), errorId = useId()
  useEffect(() => {
    if (mode === 'rename') { input.current?.focus(); input.current?.select() } else cancel.current?.focus()
    return restoreFocus
  }, [])
  return createPortal(<div className="modal-backdrop"><form ref={dialog} className="confirm-dialog workbench-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={event => {
    event.preventDefault()
    if (pending) return
    setPending(true); setError(null)
    void submit(title.trim()).then(dismiss).catch(error => setError(describeWorkbenchError(error))).finally(() => setPending(false))
  }} onKeyDown={event => {
    if (event.key === 'Escape' && !pending) { event.preventDefault(); dismiss() }
    if (event.key !== 'Tab') return
    const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)') ?? [])]
    const first = controls[0], last = controls.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }}>
    <h2 id={titleId}>{mode === 'rename' ? '重命名工作台' : '删除草稿？'}</h2>
    {mode === 'rename' ? <><label htmlFor={inputId}>工作台名称</label><input ref={input} id={inputId} value={title} maxLength={100} required disabled={pending} aria-describedby={error ? errorId : undefined} onChange={event => setTitle(event.target.value)} /></>
      : <p>删除“{entry.title}”的设计草稿记录。项目文件、已有工作台和会话历史会保留。删除后无法从列表恢复此草稿。</p>}
    {error && <p id={errorId} role="alert">{error}</p>}
    <div className="confirm-dialog__actions"><button ref={cancel} type="button" className="secondary-button" disabled={pending} onClick={dismiss}>取消</button><button type="submit" className={mode === 'delete' ? 'danger-button' : 'primary-button'} disabled={pending || (mode === 'rename' && !title.trim())}>{pending ? '正在保存…' : mode === 'rename' ? '保存名称' : '删除草稿'}</button></div>
  </form></div>, document.body)
}

const CAPABILITIES: [string[], string][] = [
  [['state.read', 'state.write'], '读写本工作台保存的数据'],
  [['conversation.draft'], '把内容填入对话草稿，发送仍由你确认'],
  [['session.open'], '打开会话'],
  [['agent.execute'], '调用 Agent 执行任务'],
  [['project.knowledge.read'], '读取项目知识文件'],
  [['project.sessions.read'], '读取本项目的会话列表']
]
/** Plain-language capability lines; `state.read` and `state.write` share one line, unknown ids stay as-is. */
export function describeCapabilities(capabilities: readonly string[]): string[] {
  const known = CAPABILITIES.filter(([ids]) => ids.some(id => capabilities.includes(id))).map(([, text]) => text)
  return [...known, ...capabilities.filter(id => !CAPABILITIES.some(([ids]) => ids.includes(id)))]
}

function sourceOf(entry: WorkbenchEntry): string {
  if (entry.kind === 'draft') return entry.source === 'template' ? '内置模板' : '本地 AI 创建 / 编辑草稿'
  return entry.origin === 'preset' ? 'App 随附的标准页面包' : '当前项目的已校验本地包'
}

export function WorkbenchAbout({ entry, view, dismiss }: { entry: WorkbenchEntry; view: HostView; dismiss(): void }) {
  const close = useRef<HTMLButtonElement>(null), titleId = useId()
  const { page, status } = view
  useEffect(() => { close.current?.focus() }, [])
  const capabilities = page ? describeCapabilities(page.manifest.capabilities) : []
  return createPortal(<div className="modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) dismiss() }}>
    <div className="confirm-dialog workbench-about" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss() }
      if (event.key === 'Tab') { event.preventDefault(); close.current?.focus() }
    }}>
      <h2 id={titleId}>关于此工作台</h2>
      <dl className="workbench-about__facts">
        <dt>来源</dt><dd>{sourceOf(entry)}</dd>
        <dt>标识</dt><dd>{page?.manifest.pluginId ?? '—'}</dd>
        <dt>版本</dt><dd>{page?.manifest.version ?? '—'}</dd>
        <dt>状态</dt><dd className="workbench-about__status">{status.kind !== 'loading' && status.kind !== 'waiting' && <span className={`workbench-status-dot workbench-status-dot--${status.kind}`} aria-hidden="true" />}{status.text}</dd>
        <dt>页面可以</dt><dd>{page ? capabilities.length ? capabilities.map(text => <span key={text}>{text}</span>) : '不使用宿主能力' : '等待包检查'}</dd>
        {entry.kind === 'draft' && <><dt>草稿目录</dt><dd><code>{entry.directory}</code></dd></>}
      </dl>
      <p className="workbench-about__note">完整备份要同时保留项目里的工作台文件和应用数据。只复制项目目录无法恢复全部状态。</p>
      <div className="confirm-dialog__actions"><button ref={close} type="button" className="secondary-button" onClick={dismiss}>关闭</button></div>
    </div>
  </div>, document.body)
}
