import { useEffect, useRef, type ReactNode } from 'react'
import { S } from '@shared/project/strings'
import { useProjectShell } from '../features/project/store'

function Modal({ title, children, busy, confirmLabel, danger = true, onCancel, onConfirm }: {
  title: string; children: ReactNode; busy: boolean; confirmLabel: string; danger?: boolean; onCancel(): void; onConfirm(): void
}) {
  const ref = useRef<HTMLDivElement>(null), cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cancel.current?.focus()
    return () => previous?.focus()
  }, [])
  return <div className="modal-backdrop"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" ref={ref}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel() }
      if (event.key === 'Tab') {
        const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const first = buttons[0], last = buttons.at(-1)
        if (!first) { event.preventDefault(); return }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }}>
      <h2 id="confirm-title">{title}</h2>{children}
      <div className="confirm-dialog__actions"><button ref={cancel} className="secondary-button" disabled={busy} onClick={onCancel}>{S.cancel}</button><button className={danger ? 'danger-button' : 'primary-button'} disabled={busy} onClick={onConfirm}>{busy ? S.stopping : confirmLabel}</button></div>
    </div></div>
}
export function ConfirmDialogs() {
  const shell = useProjectShell(), close = shell.closeDialog, quit = shell.quitRequest
  if (quit) return <Modal title={S.quitTitle} busy={shell.quitting} confirmLabel={S.quitConfirm} onCancel={shell.cancelQuit} onConfirm={() => void shell.confirmQuit()}><p>{S.quitBody(quit.sessions, quit.projects)}</p></Modal>
  if (!close) return null
  const failed = close.failed.length > 0
  return <Modal title={failed ? S.stopFailedTitle : S.closeTitle(shell.projects[close.projectId]!.name)} busy={close.stopping} confirmLabel={failed ? S.retry : S.closeConfirm} danger={!failed} onCancel={shell.cancelClose} onConfirm={() => void shell.requestClose(close.tabId, true)}>
    <p>{failed ? S.stopFailedBody : S.closeBody(close.counts.running + close.counts.needsInput)}</p>
    {failed && <ul>{close.failed.map((failure, i) => <li key={i}>{failure.sessionId}{failure.sessionId ? '：' : ''}{failure.reason}</li>)}</ul>}
  </Modal>
}
