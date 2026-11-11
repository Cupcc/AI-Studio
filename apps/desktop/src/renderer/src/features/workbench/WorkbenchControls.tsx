import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { WorkbenchEntry } from '@shared/workbench/types'
import { describeWorkbenchError } from './api'

export function WorkbenchMenu({ anchor, children, dismiss, className = '' }: { anchor: HTMLButtonElement; children: ReactNode; dismiss(): void; className?: string }) {
  const panel = useRef<HTMLDivElement>(null)
  const rect = anchor.getBoundingClientRect()
  const [top, setTop] = useState(rect.bottom + 4)
  useLayoutEffect(() => {
    const height = panel.current?.offsetHeight ?? 0
    setTop(Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8)))
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) dismiss() }
    const close = () => dismiss()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close) }
  }, [anchor, dismiss])
  return createPortal(<div ref={panel} className={`popover workbench-menu ${className}`} role="menu" aria-label="工作台操作" style={{ top, left: Math.max(8, Math.min(rect.left, window.innerWidth - 200)) }} onBlur={event => {
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
