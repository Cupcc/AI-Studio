import { useRef, useState } from 'react'
import type { WorkbenchRef } from '@shared/workbench/types'
import type { PreviewHeaderProps } from '../project/integration'
import { Icon } from '../../app/Icon'
import { applyWorkbenchDraft, editWorkbench, refreshWorkbench, useWorkbenchHost, type HostView } from './host'
import { WorkbenchAbout, WorkbenchMenu } from './WorkbenchControls'

/** Workbench parts of the right-area header: status after the title, the draft action, and "更多操作". */
export function WorkbenchHeader({ project, viewId, part }: PreviewHeaderProps) {
  const ref = { projectId: project.id, viewId }, view = useWorkbenchHost(ref)
  if (part === 'status') return <HeaderStatus view={view} />
  if (part === 'menu') return <HeaderMenu key={viewId} target={ref} view={view} />
  const entry = view.snapshot?.entry
  if (entry?.kind !== 'draft') return null
  return <button className="primary-button workbench-header-action" disabled={view.host.pending || view.loading || !!view.error || !view.page || !view.pageReady} onClick={() => void applyWorkbenchDraft(ref)}>
    <span>{view.host.pending ? '正在应用…' : entry.targetInstanceId ? '应用更改' : '添加至当前项目'}</span>
  </button>
}

function HeaderStatus({ view }: { view: HostView }) {
  const { status } = view
  if (!view.snapshot && status.kind === 'waiting') return null
  return <div className="workbench-header-status">
    {view.snapshot?.entry.kind === 'draft' && <span className="workbench-chip workbench-chip--draft">草稿</span>}
    {status.kind === 'loading' ? <span className="workbench-header-status__text" role="status"><span className="workbench-spinner" aria-hidden="true" />{status.text}</span>
      : status.kind === 'waiting' ? <span className="workbench-header-status__text" role="status">{status.text}</span>
      : <span className={`workbench-status-mark workbench-status-mark--${status.kind}`} role="status" data-tip={status.visible ? undefined : status.text}>
        <span className={`workbench-status-dot workbench-status-dot--${status.kind}`} aria-hidden="true" />
        <span className={status.visible ? 'workbench-header-status__text' : 'sr-only'}>{status.text}</span>
      </span>}
  </div>
}

function HeaderMenu({ target: ref, view }: { target: WorkbenchRef; view: HostView }) {
  const [open, setOpen] = useState(false), [about, setAbout] = useState(false), button = useRef<HTMLButtonElement>(null)
  const entry = view.snapshot?.entry, { page, host, loading } = view
  const choose = (action: () => unknown) => { setOpen(false); button.current?.focus(); void action() }
  return <>
    <button ref={button} className="icon-button" aria-label="更多操作" data-tip="更多操作" data-tip-align="end" aria-haspopup="menu" aria-expanded={open} disabled={!entry} onClick={() => setOpen(!open)}><Icon name="dots" /></button>
    {open && entry && button.current && <WorkbenchMenu anchor={button.current} label="更多操作" align="end" className="workbench-more-menu" dismiss={() => setOpen(false)}>
      {entry.editable && entry.kind === 'instance' && <button role="menuitem" disabled={host.pending || !page} onClick={() => choose(() => editWorkbench(ref))}><Icon name="pencil" />编辑工作台</button>}
      <button role="menuitem" disabled={loading || host.pending} onClick={() => choose(() => refreshWorkbench(ref))}><Icon name="refresh" />重新加载</button>
      <button role="menuitem" onClick={() => { setOpen(false); setAbout(true) }}><Icon name="info" /><span>关于此工作台</span>{page && <span className="menu-item__meta" aria-hidden="true">{page.manifest.version}</span>}</button>
    </WorkbenchMenu>}
    {about && entry && <WorkbenchAbout entry={entry} view={view} dismiss={() => { setAbout(false); button.current?.focus() }} />}
  </>
}
