import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { PRESET_WORKBENCHES } from '@shared/workbench/presets'
import type { WorkbenchCatalog, WorkbenchEntry, WorkbenchId } from '@shared/workbench/types'
import type { ShellSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { Icon } from '../../app/Icon'
import { openWorkbenchDraft } from './actions'
import { describeWorkbenchError, workbenchApi } from './api'
import { WorkbenchDialog, WorkbenchMenu } from './WorkbenchControls'
import { useWorkbenches } from './store'
import './workbench.css'

type Dialog = { mode: 'rename' | 'delete'; entry: WorkbenchEntry; anchor: HTMLButtonElement }

export function WorkbenchNavigation({ project, canvas, active }: ShellSlotProps) {
  const catalog = useWorkbenches(s => s.catalogs[project.id]), error = useWorkbenches(s => s.errors[project.id])
  const [choosing, setChoosing] = useState(false), [pending, setPending] = useState(false), [actionError, setActionError] = useState<string | null>(null)
  const [removed, setRemoved] = useState<WorkbenchCatalog>([]), [choiceLoading, setChoiceLoading] = useState(false), [choiceError, setChoiceError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ entry: WorkbenchEntry; anchor: HTMLButtonElement } | null>(null), [dialog, setDialog] = useState<Dialog | null>(null)
  const [focusIndex, setFocusIndex] = useState(0), [dragging, setDragging] = useState<WorkbenchId | null>(null)
  const [drop, setDrop] = useState<{ viewId: WorkbenchId; after: boolean } | null>(null)
  const refs = useRef<(HTMLButtonElement | null)[]>([]), root = useRef<HTMLElement>(null), addButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { void useWorkbenches.getState().loadCatalog(project.id) }, [project.id])
  useEffect(() => {
    if (!active) { setChoosing(false); setMenu(null); setDialog(null); setDragging(null); setDrop(null) }
  }, [active])
  useEffect(() => {
    if (!catalog || pending) return
    const shell = useProjectShell.getState(), current = shell.uiStates[project.id]?.mainCanvas
    if (current?.mode !== 'view' || catalog.some(entry => entry.viewId === current.viewId)) return
    if (catalog[0]) shell.enterView(project.id, catalog[0].viewId)
    else shell.startDraft(project.id)
  }, [catalog, project.id, pending])
  useEffect(() => {
    if (!choosing) return
    let alive = true
    setChoiceLoading(true); setChoiceError(null)
    void workbenchApi().listRemoved({ projectId: project.id }).then(entries => { if (alive) setRemoved(entries) }).catch(error => { if (alive) setChoiceError(describeWorkbenchError(error)) }).finally(() => { if (alive) setChoiceLoading(false) })
    return () => { alive = false }
  }, [choosing, project.id, catalog])
  async function run(action: () => Promise<unknown>) {
    setPending(true); setActionError(null); setMenu(null)
    try { await action(); await useWorkbenches.getState().loadCatalog(project.id) }
    catch (error) { setActionError(describeWorkbenchError(error)) }
    finally { setPending(false) }
  }
  async function create(source: 'template' | 'ai', templateId?: 'product-selection') {
    await run(async () => { await openWorkbenchDraft(project.id, source, undefined, templateId); setChoosing(false) })
  }
  function reorder(viewId: WorkbenchId, before: WorkbenchId | null) {
    return run(() => workbenchApi().move({ ref: { projectId: project.id, viewId }, before }))
  }
  function moveBy(index: number, delta: -1 | 1) {
    const entry = catalog?.[index]
    if (!entry || !catalog || index + delta < 0 || index + delta >= catalog.length) return
    void reorder(entry.viewId, delta === -1 ? catalog[index - 1]!.viewId : catalog[index + 2]?.viewId ?? null)
  }
  function navigate(event: KeyboardEvent, index: number) {
    const count = catalog?.length ?? 0
    if (!count) return
    if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); if (!pending) moveBy(index, event.key === 'ArrowUp' ? -1 : 1); return }
    let next: number | undefined
    if (event.key === 'ArrowDown') next = (index + 1) % count
    if (event.key === 'ArrowUp') next = (index + count - 1) % count
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = count - 1
    if (next !== undefined) { event.preventDefault(); setFocusIndex(next); refs.current[next]?.focus() }
  }
  function visibility(entry: WorkbenchEntry, visible: boolean) {
    void run(async () => {
      await workbenchApi().setVisible({ ref: { projectId: project.id, viewId: entry.viewId }, visible })
      if (visible) { setChoosing(false); await useWorkbenches.getState().loadCatalog(project.id); useProjectShell.getState().enterView(project.id, entry.viewId) }
      else leaveRemoved(entry.viewId)
    })
  }
  function leaveRemoved(viewId: WorkbenchId) {
    const shell = useProjectShell.getState(), current = shell.uiStates[project.id]?.mainCanvas
    if (current?.mode !== 'view' || current.viewId !== viewId || !catalog) return
    const index = catalog.findIndex(item => item.viewId === viewId), next = catalog[index + 1] ?? catalog[index - 1]
    if (next) shell.enterView(project.id, next.viewId)
    else shell.startDraft(project.id)
  }
  const selected = canvas.mode === 'view' ? canvas.viewId : null
  return <section ref={root} className="workbench-navigation" aria-label="工作台">
    <div className="workbench-navigation__heading"><h2 className="navigation__heading">工作台</h2></div>
    <div className="workbench-navigation__items" aria-label="工作台列表">
      {catalog?.map((entry, index) => <div key={entry.viewId} data-workbench-id={entry.viewId} className={`workbench-navigation__row ${drop?.viewId === entry.viewId ? drop.after ? 'is-drop-after' : 'is-drop-before' : ''} ${dragging === entry.viewId ? 'is-dragging' : ''}`} draggable={!pending}
        onDragStart={event => { setMenu(null); setDragging(entry.viewId); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.viewId) }}
        onDragOver={event => { if (!dragging || pending) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const rect = event.currentTarget.getBoundingClientRect(); setDrop({ viewId: entry.viewId, after: event.clientY > rect.top + rect.height / 2 }) }}
        onDrop={event => { event.preventDefault(); if (dragging && !pending) { const rect = event.currentTarget.getBoundingClientRect(), after = event.clientY > rect.top + rect.height / 2; void reorder(dragging, after ? catalog[index + 1]?.viewId ?? null : entry.viewId) } setDragging(null); setDrop(null) }}
        onDragEnd={() => { setDragging(null); setDrop(null) }}>
        <button ref={element => { refs.current[index] = element }}
          tabIndex={Math.min(focusIndex, catalog.length - 1) === index ? 0 : -1}
          className={`navigation__view ${selected === entry.viewId ? 'is-selected' : ''}`}
          aria-label={entry.kind === 'draft' ? `草稿：${entry.title}` : entry.title}
          aria-current={selected === entry.viewId ? 'page' : undefined}
          onKeyDown={event => navigate(event, index)} onFocus={() => setFocusIndex(index)}
          onClick={() => useProjectShell.getState().enterView(project.id, entry.viewId)}>
          <Icon name={entry.icon} /><span>{entry.title}</span>
          {entry.kind === 'draft' ? <small className="workbench-navigation__badge">草稿</small>
            : !entry.enabled && <small className="workbench-navigation__badge">已停用</small>}
        </button>
        <button className="icon-button workbench-navigation__manage" aria-label={`管理 ${entry.kind === 'draft' ? '草稿：' : ''}${entry.title}`} data-tip="管理工作台" data-tip-align="end" aria-haspopup="menu" aria-expanded={menu?.entry.viewId === entry.viewId} disabled={pending} onClick={event => { setChoosing(false); setMenu(menu?.entry.viewId === entry.viewId ? null : { entry, anchor: event.currentTarget }) }}><Icon name="dots" size={14} /></button>
      </div>)}
      {catalog?.length === 0 && <p className="workbench-navigation__empty">还没有工作台，点击 + 添加。</p>}
    </div>
    <button ref={addButton} className="workbench-add-button" aria-label="添加工作台" data-tip="添加工作台" data-tip-align="end" aria-expanded={choosing} disabled={pending} onClick={() => { setMenu(null); setChoosing(!choosing) }}><Icon name="plus" size={14} /><span>添加工作台</span></button>
    {choosing && addButton.current && <WorkbenchMenu anchor={addButton.current} className="workbench-add-menu" dismiss={() => { setChoosing(false); addButton.current?.focus() }}>
      <div className="workbench-choices" aria-label="创建工作台" onKeyDown={event => { if (event.key === 'Escape') { setChoosing(false); addButton.current?.focus() } }}>
        <button disabled={pending} onClick={() => void create('ai')}><Icon name="chat" /><span>AI 对话创建<small>描述工作方式，由 AI 编写页面</small></span></button>
        <button disabled={pending} onClick={() => void create('template')}><Icon name="preview" /><span>从简单模板开始<small>先体验预览、保存与对话</small></span></button>
        <h3>预设工作台</h3>
        {PRESET_WORKBENCHES.map(preset => {
          const existing = catalog?.find(entry => entry.viewId === preset.viewId), entry = existing ?? removed.find(entry => entry.viewId === preset.viewId) ?? preset
          return <button key={preset.viewId} disabled={pending || choiceLoading || !!choiceError || !!existing} aria-label={`添加 ${entry.title}`} onClick={() => visibility(entry, true)}><Icon name={entry.icon} /><span>{existing?.title ?? entry.title}</span><small>{existing ? '已添加' : '添加'}</small></button>
        })}
        <button disabled={pending} aria-label="添加 选品工作台" onClick={() => void create('template', 'product-selection')}><Icon name="preview" /><span>选品工作台<small>四阶段画布，预览后添加到项目</small></span><small>添加</small></button>
        {removed.some(entry => entry.origin === 'custom') && <><h3>已移除的工作台</h3>{removed.filter(entry => entry.origin === 'custom').map(entry => <button key={entry.viewId} disabled={pending || choiceLoading || !!choiceError} aria-label={`恢复 ${entry.title}`} onClick={() => visibility(entry, true)}><Icon name={entry.icon} /><span>{entry.title}</span><small>恢复</small></button>)}</>}
        {choiceLoading && <p role="status">正在读取可用工作台…</p>}
        {choiceError && <p role="alert">{choiceError}<button className="text-button" onClick={() => { setChoosing(false); setActionError(choiceError) }}>关闭后重试</button></p>}
      </div>
    </WorkbenchMenu>}
    {menu && <WorkbenchMenu anchor={menu.anchor} dismiss={() => setMenu(null)}>
      <button role="menuitem" onClick={() => { setDialog({ mode: 'rename', entry: menu.entry, anchor: menu.anchor }); setMenu(null) }}>重命名</button>
      <button role="menuitem" disabled={catalog?.[0]?.viewId === menu.entry.viewId} onClick={() => moveBy(catalog?.findIndex(entry => entry.viewId === menu.entry.viewId) ?? -1, -1)}>上移</button>
      <button role="menuitem" disabled={catalog?.at(-1)?.viewId === menu.entry.viewId} onClick={() => moveBy(catalog?.findIndex(entry => entry.viewId === menu.entry.viewId) ?? -1, 1)}>下移</button>
      {menu.entry.kind === 'draft' ? <button role="menuitem" className="workbench-menu__danger" onClick={() => { setDialog({ mode: 'delete', entry: menu.entry, anchor: menu.anchor }); setMenu(null) }}>删除草稿…</button>
        : <button role="menuitem" onClick={() => visibility(menu.entry, false)}>移除工作台</button>}
    </WorkbenchMenu>}
    {dialog && <WorkbenchDialog entry={dialog.entry} mode={dialog.mode} dismiss={() => setDialog(null)} restoreFocus={() => {
      if (dialog.anchor.isConnected) { dialog.anchor.focus(); return }
      const current = useProjectShell.getState().uiStates[project.id]?.mainCanvas
      const entries = useWorkbenches.getState().catalogs[project.id]
      const index = current?.mode === 'view' ? entries?.findIndex(entry => entry.viewId === current.viewId) ?? -1 : -1
      ;(refs.current[index] ?? addButton.current)?.focus()
    }} submit={async title => {
      setPending(true)
      try {
        const ref = { projectId: project.id, viewId: dialog.entry.viewId }
        if (dialog.mode === 'rename') await workbenchApi().rename({ ref, title })
        else if (dialog.entry.kind === 'draft') { await workbenchApi().deleteDraft({ projectId: project.id, viewId: dialog.entry.viewId }); leaveRemoved(dialog.entry.viewId) }
        await useWorkbenches.getState().loadCatalog(project.id)
      } finally { setPending(false) }
    }} />}
    {(actionError || error) && <p className="workbench-navigation__error" role="alert">{actionError || error}<button className="text-button" onClick={() => { setActionError(null); void useWorkbenches.getState().loadCatalog(project.id) }}>重试</button></p>}
  </section>
}
