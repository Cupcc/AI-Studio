import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ShellSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { Icon } from '../../app/Icon'
import { openWorkbenchDraft } from './actions'
import { describeWorkbenchError } from './api'
import { useWorkbenches } from './store'
import './workbench.css'

export function WorkbenchNavigation({ project, canvas }: ShellSlotProps) {
  const catalog = useWorkbenches(s => s.catalogs[project.id]), error = useWorkbenches(s => s.errors[project.id])
  const [choosing, setChoosing] = useState(false), [pending, setPending] = useState(false), [actionError, setActionError] = useState<string | null>(null)
  const [focusIndex, setFocusIndex] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => { void useWorkbenches.getState().loadCatalog(project.id) }, [project.id])
  async function create(source: 'template' | 'ai') {
    setPending(true); setActionError(null)
    try { await openWorkbenchDraft(project.id, source); setChoosing(false) }
    catch (error) { setActionError(describeWorkbenchError(error)) }
    finally { setPending(false) }
  }
  function move(event: KeyboardEvent, index: number) {
    const count = catalog?.length ?? 0
    if (!count) return
    let next: number | undefined
    if (event.key === 'ArrowDown') next = (index + 1) % count
    if (event.key === 'ArrowUp') next = (index + count - 1) % count
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = count - 1
    if (next !== undefined) { event.preventDefault(); setFocusIndex(next); refs.current[next]?.focus() }
  }
  const selected = canvas.mode === 'view' ? canvas.viewId : null
  return <section className="workbench-navigation" aria-label="工作台">
    <div className="workbench-navigation__heading"><h2 className="navigation__heading">工作台</h2>
      <button className="icon-button" aria-label="添加工作台" data-tip="添加工作台" data-tip-align="end" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}><Icon name="plus" size={14} /></button>
    </div>
    {choosing && <div className="workbench-choices" aria-label="创建工作台" onKeyDown={event => { if (event.key === 'Escape') setChoosing(false) }}>
      <button disabled={pending} onClick={() => void create('ai')}><Icon name="chat" /><span>AI 对话创建<small>描述工作方式，由 AI 编写页面</small></span></button>
      <button disabled={pending} onClick={() => void create('template')}><Icon name="preview" /><span>从简单模板开始<small>先体验预览、保存与对话</small></span></button>
    </div>}
    <div className="workbench-navigation__items" aria-label="工作台列表">
      {catalog?.map((entry, index) => <button key={entry.viewId} ref={element => { refs.current[index] = element }}
        tabIndex={Math.min(focusIndex, catalog.length - 1) === index ? 0 : -1}
        className={`navigation__view ${selected === entry.viewId ? 'is-selected' : ''}`}
        aria-label={entry.kind === 'draft' ? `草稿：${entry.title}` : entry.title}
        aria-current={selected === entry.viewId ? 'page' : undefined}
        onKeyDown={event => move(event, index)} onFocus={() => setFocusIndex(index)}
        onClick={() => useProjectShell.getState().enterView(project.id, entry.viewId)}>
        <Icon name={entry.icon} /><span>{entry.title}</span>
        {entry.kind === 'draft' ? <small className="workbench-navigation__badge">设计草稿</small>
          : !entry.enabled && <small className="workbench-navigation__badge">已停用</small>}
      </button>)}
    </div>
    {(actionError || error) && <p className="workbench-navigation__error" role="alert">{actionError || error}<button className="text-button" onClick={() => void useWorkbenches.getState().loadCatalog(project.id)}>重试</button></p>}
  </section>
}
