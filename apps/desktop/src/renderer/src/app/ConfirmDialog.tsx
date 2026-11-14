import { useEffect, useRef, type ReactNode } from 'react'
import { S } from '@shared/project/strings'
import { useProjectShell } from '../features/project/store'
import type { ClosingResource } from '@shared/project/types'

const KIND_LABEL: Record<ClosingResource['kind'], string> = { session: 'Session', terminal: 'Terminal', file: S.unsavedFile }

function ResourceList({ resources }: { resources?: ClosingResource[] }) {
  const projects = useProjectShell(state => state.projects)
  if (!resources?.length) return null
  return <ul>{resources.map(item => <li key={`${item.kind}:${item.projectId}:${item.id}`}>
    {projects[item.projectId]?.name} · {KIND_LABEL[item.kind]} · {item.title || item.id}
  </li>)}</ul>
}

/** Unsaved files (TOOLS-Q13): a primary action saves them all before closing; `confirm` then closes without saving. */
interface SaveAction { label: string; busy: boolean; onSave(): void }

function Modal({ title, children, busy, confirmLabel, danger = true, save, onCancel, onConfirm }: {
  title: string; children: ReactNode; busy: boolean; confirmLabel: string; danger?: boolean; save?: SaveAction; onCancel(): void; onConfirm(): void
}) {
  const ref = useRef<HTMLDivElement>(null), cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cancel.current?.focus()
    return () => previous?.focus()
  }, [])
  const working = busy || !!save?.busy
  return <div className="modal-backdrop"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" ref={ref}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && !working) { event.preventDefault(); onCancel() }
      if (event.key === 'Tab') {
        const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const first = buttons[0], last = buttons.at(-1)
        if (!first) { event.preventDefault(); return }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }}>
      <h2 id="confirm-title">{title}</h2>{children}
      <div className="confirm-dialog__actions">
        <button ref={cancel} className="secondary-button" disabled={working} onClick={onCancel}>{S.cancel}</button>
        <button className={danger ? 'danger-button' : 'primary-button'} disabled={working} onClick={onConfirm}>{busy ? S.stopping : confirmLabel}</button>
        {save && <button className="primary-button" disabled={working} onClick={save.onSave}>{save.busy ? S.saving : save.label}</button>}
      </div>
    </div></div>
}

function SaveFailures({ failures }: { failures?: string[] }) {
  if (!failures?.length) return null
  return <div role="alert"><p>{S.saveFailedBody}</p><ul>{failures.map((failure, index) => <li key={index}>{failure}</li>)}</ul></div>
}

export function ConfirmDialogs() {
  const shell = useProjectShell(), close = shell.closeDialog, quit = shell.quitRequest
  if (quit) {
    const failed = !!quit.failures?.length, files = !failed && !!quit.files
    return <Modal title={failed ? S.quitFailedTitle : S.quitTitle} busy={shell.quitting} confirmLabel={failed ? S.retry : files ? S.quitDiscard : S.quitConfirm}
      onCancel={shell.cancelQuit} onConfirm={() => void shell.confirmQuit()}
      {...(files ? { save: { label: S.quitSave, busy: shell.quitSaving, onSave: () => void shell.saveAndQuit() } } : {})}>
      <p>{failed ? S.quitFailedBody : S.quitBody(quit.sessions, quit.projects, quit.terminals, quit.files)}</p>
      <ResourceList resources={quit.resources} />
      {failed ? <ul role="alert">{quit.failures!.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : <SaveFailures failures={shell.quitSaveFailures} />}
    </Modal>
  }
  if (!close) return null
  const failed = close.failed.length > 0, files = !failed && !!close.counts.files
  return <Modal title={failed ? S.stopFailedTitle : S.closeTitle(shell.projects[close.projectId]!.name)} busy={close.stopping}
    confirmLabel={failed ? S.retry : files ? S.closeDiscard : S.closeConfirm} danger={!failed}
    onCancel={shell.cancelClose} onConfirm={() => void shell.requestClose(close.tabId, true)}
    {...(files ? { save: { label: S.closeSave, busy: !!close.saving, onSave: () => void shell.saveAndClose() } } : {})}>
    <p>{failed ? S.stopFailedBody : S.closeBody(close.counts.running + close.counts.needsInput, close.counts.terminals, close.counts.files)}</p>
    <ResourceList resources={close.counts.resources} />
    {failed && <ul>{close.failed.map((failure, i) => <li key={i}>{failure.sessionId}{failure.sessionId ? '：' : ''}{failure.reason}</li>)}</ul>}
    <SaveFailures failures={close.saveFailures} />
  </Modal>
}
