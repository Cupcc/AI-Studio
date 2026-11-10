import { useEffect, useState } from 'react'
import { workbenchViewId } from '@shared/workbench/types'
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
  useEffect(() => { void useWorkbenches.getState().load(project.id) }, [project.id])
  async function create(source: 'template' | 'ai') {
    setPending(true); setActionError(null)
    try { await openWorkbenchDraft(project.id, source); setChoosing(false) }
    catch (error) { setActionError(describeWorkbenchError(error)) }
    finally { setPending(false) }
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
    <div className="workbench-navigation__items">
    {catalog?.instances.map(instance => {
      const viewId = workbenchViewId({ kind: 'instance', id: instance.id })
      return <button key={instance.id} className={`navigation__view ${selected === viewId ? 'is-selected' : ''}`} aria-current={selected === viewId ? 'page' : undefined} onClick={() => useProjectShell.getState().enterView(project.id, viewId)}>
        <Icon name="preview" /><span>{instance.title}</span>{!instance.enabled && <small className="workbench-navigation__badge">已停用</small>}
      </button>
    })}
    {!!catalog?.drafts.length && <details className="workbench-drafts" open={selected?.startsWith('workbench-draft:') || undefined}>
      <summary>设计草稿 · {catalog.drafts.length}</summary>
      {catalog.drafts.map(draft => {
        const viewId = workbenchViewId({ kind: 'draft', id: draft.id })
        return <button key={draft.id} className={`navigation__view ${selected === viewId ? 'is-selected' : ''}`} aria-label={`草稿：${draft.title}`} aria-current={selected === viewId ? 'page' : undefined} onClick={() => useProjectShell.getState().enterView(project.id, viewId)}><Icon name="pencil" /><span>{draft.title}</span></button>
      })}
    </details>}
    </div>
    {(actionError || error) && <p className="workbench-navigation__error" role="alert">{actionError || error}<button className="text-button" onClick={() => void useWorkbenches.getState().load(project.id)}>重试</button></p>}
  </section>
}
