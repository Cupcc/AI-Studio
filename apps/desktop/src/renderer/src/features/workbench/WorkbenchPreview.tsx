import selectionTemplate from '../../../../../build/workbenches/product-selection/manifest.json'
import { useEffect, useRef, useState } from 'react'
import { type WorkbenchSnapshot } from '@shared/workbench/types'
import { WorkbenchPage, type PageStatus } from './WorkbenchPage'
import type { ViewSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { appendWorkbenchDraft } from './conversation'
import { Icon } from '../../app/Icon'
import { describeWorkbenchError, workbenchApi } from './api'
import { openWorkbenchDraft } from './actions'
import { useWorkbenches, workbenchKey } from './store'
import './workbench.css'

function WorkbenchContent({ project, active, snapshot, loading }: ViewSlotProps & { snapshot: WorkbenchSnapshot; loading: boolean }) {
  const { ref, entry, page } = snapshot
  const zoom = useWorkbenches(s => s.zoom[workbenchKey(ref)] ?? 1)
  const [actionError, setActionError] = useState<string | null>(null), [pending, setPending] = useState(false), [reload, setReload] = useState(0)
  const [pageStatus, setPageStatus] = useState<PageStatus>({ kind: 'loading' }), [connectedRevision, setConnectedRevision] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState('已保存')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (active) { setPageStatus({ kind: 'loading' }); setConnectedRevision(null); setSaveStatus('已读取保存状态') }
  }, [active, page?.packageRevision])
  const pageReady = pageStatus.kind === 'ready' && connectedRevision === page?.packageRevision
  const pageError = pageStatus.kind === 'error' && connectedRevision === page?.packageRevision ? pageStatus.message : null
  const error = actionError || snapshot.error
  async function refresh() {
    setActionError(null); setPageStatus({ kind: 'loading' }); setConnectedRevision(null)
    await useWorkbenches.getState().loadSnapshot(ref)
    if (alive.current) { setReload(value => value + 1); setSaveStatus('已读取保存状态') }
  }
  async function apply() {
    if (!page || !pageReady || entry.kind !== 'draft') return
    setPending(true); setActionError(null)
    try {
      const instance = await workbenchApi().applyDraft({ ref: { projectId: project.id, viewId: entry.viewId }, expectedPackageRevision: page.packageRevision })
      await useWorkbenches.getState().loadCatalog(project.id)
      useProjectShell.getState().enterView(project.id, instance.viewId)
    } catch (error) { if (alive.current) setActionError(describeWorkbenchError(error)) }
    finally { if (alive.current) setPending(false) }
  }
  async function upgrade() {
    if (entry.origin !== 'custom' || entry.kind !== 'instance') return
    setPending(true); setActionError(null)
    try { await openWorkbenchDraft(project.id, 'template', entry.id, 'product-selection') }
    catch (error) { if (alive.current) setActionError(describeWorkbenchError(error)) }
    finally { if (alive.current) setPending(false) }
  }
  async function edit() {
    setPending(true); setActionError(null)
    try { if (entry.origin === 'custom') await openWorkbenchDraft(project.id, 'ai', entry.id) }
    catch (error) { if (alive.current) setActionError(describeWorkbenchError(error)) }
    finally { if (alive.current) setPending(false) }
  }
  async function toggleEnabled() {
    if (!page || entry.origin !== 'custom' || entry.kind !== 'instance') return
    setPending(true); setActionError(null)
    try {
      await workbenchApi().setEnabled({ ref: { projectId: project.id, viewId: entry.viewId }, enabled: !page.enabled })
      await refresh()
    } catch (error) { if (alive.current) setActionError(describeWorkbenchError(error)) }
    finally { if (alive.current) setPending(false) }
  }
  async function explainError() {
    try { await appendWorkbenchDraft(ref, `工作台预览失败，请检查开发说明和草稿文件并修复：\n${error || pageError || ''}`, () => alive.current) }
    catch (failure) { setActionError(describeWorkbenchError(failure)) }
  }
  const editing = entry.kind === 'draft'
  const upgradeAvailable = !editing && entry.origin === 'custom' && page?.manifest.pluginId === selectionTemplate.pluginId && page.manifest.version !== selectionTemplate.version
  return <section className="workbench-preview" aria-label={editing ? '工作台草稿预览' : '工作台实例'}>
    <div className="workbench-toolbar">
      <span className="workbench-toolbar__stage">{editing ? entry.targetInstanceId ? '编辑草稿' : '新工作台草稿' : entry.origin === 'preset' ? 'App 预设工作台' : '已添加至项目'}</span><span className="grow" />
      <button className="icon-button" aria-label="缩小 Preview" disabled={zoom <= .5} onClick={() => useWorkbenches.getState().setZoom(ref, zoom - .1)}>−</button>
      <button className="text-button" aria-label="重置 Preview 缩放" onClick={() => useWorkbenches.getState().setZoom(ref, 1)}>{Math.round(zoom * 100)}%</button>
      <button className="icon-button" aria-label="放大 Preview" disabled={zoom >= 2} onClick={() => useWorkbenches.getState().setZoom(ref, zoom + .1)}>+</button>
      <button className="icon-button" aria-label="刷新工作台预览" data-tip="刷新工作台预览" disabled={loading || pending} onClick={() => void refresh()}><Icon name="refresh" /></button>
      {editing ? <button className="primary-button" disabled={pending || loading || !!error || !page || !pageReady} onClick={() => void apply()}>{pending ? '正在应用…' : entry.targetInstanceId ? '应用更改' : '添加至当前项目'}</button>
        : <>{entry.editable && <button className="secondary-button" disabled={pending || !page} onClick={() => void edit()}>编辑工作台</button>}{entry.canDisable && <button className="text-button" disabled={pending || !page} onClick={() => void toggleEnabled()}>{page?.enabled === false ? '启用工作台' : '停用工作台'}</button>}</>}
    </div>
    {upgradeAvailable && <div className="workbench-notice">新版选品模板提供无限画布。升级保留任务、候选和执行记录，会替换当前页面定制；先预览，再应用。 <button className="secondary-button" disabled={pending} onClick={() => void upgrade()}>预览新版选品画布</button></div>}
    {editing && <p className="workbench-notice">在左侧描述或修改页面，完成后刷新预览。{entry.targetInstanceId ? '应用前，原实例保持不变；应用只更新此实例并保留已保存状态。' : '预览使用独立草稿状态，确认后再添加到项目。'}</p>}
    <details className="workbench-details">
      <summary>{editing ? '来源、能力与开发文件' : '插件信息与备份'}</summary>
      <p>来源：{editing ? entry.source === 'template' ? '内置简单模板' : '本地 AI 创建 / 编辑草稿' : entry.origin === 'preset' ? 'App 随附的标准页面包' : '当前项目的已校验本地包'}{page && ` · ${page.manifest.pluginId} · ${page.manifest.version}`}</p>
      <p>页面能力：{page?.manifest.capabilities.join('、') || '等待包检查'}。填写对话后仍需用户发送。</p>
      {editing && <p>草稿目录：<code>{entry.directory}</code></p>}
      <p>完整备份需要同时保留项目中的工作台文件和应用宿主状态；仅复制项目目录无法恢复全部实例状态。</p>
    </details>
    <div className="workbench-status" role="status"><span>{loading ? '正在检查包…' : error ? '包检查失败' : page ? '包检查通过' : '等待页面文件'}</span><span>{page?.enabled === false ? '页面已停用' : pageReady ? '页面已连接' : pageError ? '页面运行失败' : '正在加载页面…'}</span><span className="workbench-status__saved">{saveStatus}</span></div>
    {(error || pageError) && <div className="workbench-error" role="alert"><strong>{error ? '无法预览工作台' : '页面未正常运行'}</strong><p>{error || pageError}</p><p>可在左侧对话中修正文件，然后重试。对话和已保存状态会保留。</p><button className="secondary-button" disabled={loading} onClick={() => void refresh()}>重试预览</button> <button className="text-button" onClick={() => void explainError()}>将错误填入对话</button></div>}
    {page?.enabled === false ? <div className="workbench-idle"><Icon name="preview" size={28} /><h2>此工作台已停用</h2><p>页面已卸载，已保存状态保留。普通对话继续运行；如需停止对话，请使用对话中的 Stop。</p></div>
      : page && active ? <WorkbenchPage key={`${page.packageRevision}:${reload}`} workbenchRef={snapshot.ref} page={page} zoom={zoom} onPageStatus={status => {
        setConnectedRevision(page.packageRevision)
        setPageStatus(previous => previous.kind === 'error' && status.kind === 'ready' ? previous : status)
      }} onSaveStatus={setSaveStatus} />
      : !loading && !page ? <div className="workbench-idle"><Icon name="pencil" size={28} /><h2>等待工作台页面</h2><p>在左侧告诉 AI 你需要的工作方式。文件准备好后，刷新这里查看结果。</p></div> : null}
  </section>
}

export function WorkbenchPreview(props: ViewSlotProps) {
  const key = workbenchKey({ projectId: props.project.id, viewId: props.viewId })
  const snapshot = useWorkbenches(s => s.snapshots[key]), error = useWorkbenches(s => s.snapshotErrors[key])
  const loading = useWorkbenches(s => s.loading[key])
  useEffect(() => {
    if (props.active) void useWorkbenches.getState().loadSnapshot({ projectId: props.project.id, viewId: props.viewId })
  }, [props.project.id, props.viewId, props.active])
  return <>{error && <div className="workbench-error" role="alert"><strong>无法读取工作台</strong><p>{error}</p>
    <button className="secondary-button" disabled={loading} onClick={() => void useWorkbenches.getState().loadSnapshot({ projectId: props.project.id, viewId: props.viewId })}>重试</button>
  </div>}
    {snapshot ? <WorkbenchContent key={key} {...props} snapshot={snapshot} loading={!!loading} />
      : !error && <div className="workbench-idle" role="status">正在读取工作台…</div>}
  </>
}
