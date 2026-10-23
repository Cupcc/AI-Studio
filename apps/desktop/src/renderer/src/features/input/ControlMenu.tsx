import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Button disclosure shared by Composer controls; focus stays in the normal Tab order. */
export function ControlMenu({ label, title, trigger, children, disabled = false, className = '', onOpen }: {
  label: string; title?: string; trigger: ReactNode; children: ReactNode; disabled?: boolean; className?: string; onOpen?: () => void
}) {
  const [open, setOpen] = useState(false), [room, setRoom] = useState(360), [bottom, setBottom] = useState(52)
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null)
  const panelId = useId()
  function close(restore = false) { setOpen(false); if (restore) button.current?.focus() }
  function show() { if (!disabled) { setOpen(true); onOpen?.() } }
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const trigger = button.current?.getBoundingClientRect(), box = button.current?.closest('.composer__box')?.getBoundingClientRect()
      setRoom(Math.max(80, Math.min(360, (trigger?.top ?? 460) - 100)))
      if (trigger && box) setBottom(box.bottom - trigger.top + 6)
    }
    measure()
    const selected = panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled)')
    ;(selected ?? panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open])
  return <div ref={root} className={`composer__control ${className}`} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close()
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true); return }
    if (event.target === button.current) {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); show() }
      return
    }
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }}>
    <button ref={button} type="button" className="composer__control-trigger" aria-label={label} aria-description={title} aria-expanded={open} aria-controls={open ? panelId : undefined} data-tip={title} disabled={disabled} onClick={() => open ? close() : show()}>{trigger}</button>
    {open && <div ref={panel} id={panelId} className="composer__control-panel popover" style={{ maxHeight: room, bottom }} onClick={event => {
      if ((event.target as Element).closest('button:not(:disabled):not([data-keep-open])')) close(true)
    }}>{children}</div>}
  </div>
}
