import { useCallback, useEffect, useRef, useState } from 'react'
import { WORKBENCH_MESSAGE, workbenchTarget, workbenchViewId, type WorkbenchSnapshot, type WorkbenchViewId } from '@shared/workbench/types'
import type { ViewSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { appendWorkbenchDraft } from './conversation'
import { Icon } from '../../app/Icon'
import { describeWorkbenchError, workbenchApi } from './api'
import { openWorkbenchDraft } from './actions'
import { attachWorkbenchPageBridge } from './page-bridge'
import { useWorkbenches } from './store'
import './workbench.css'

const capabilityNames = { 'state.read': '读取当前状态', 'state.write': '保存当前状态', 'conversation.draft': '填写对话草稿' }

type PageStatus = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string }
function WorkbenchPage({ snapshot, onSnapshot, onPageStatus, onSaveStatus }: {
  snapshot: WorkbenchSnapshot
  onSnapshot(value: WorkbenchSnapshot): void
  onPageStatus(status: PageStatus): void
  onSaveStatus(status: string): void
}) {
  const iframe = useRef<HTMLIFrameElement>(null), current = useRef(snapshot)
  current.current = snapshot
  useEffect(() => {
    const frame = iframe.current?.contentWindow
    if (!frame) return
    let disposed = false
    const timer = window.setTimeout(() => onPageStatus({ kind: 'error', message: '页面未能连接宿主，请检查入口脚本后重试。' }), 10_000)
    const detach = attachWorkbenchPageBridge({
      frame, snapshot: () => current.current,
      ready: () => { window.clearTimeout(timer); onPageStatus({ kind: 'ready' }) },
      error: error => { window.clearTimeout(timer); onPageStatus({ kind: 'error', message: error }) },
      updateState: async (state, expectedRevision) => {
        onSaveStatus('正在保存…')
        try {
          const next = await workbenchApi().updateState({ target: current.current.target, state, expectedRevision })
          if (!disposed) { current.current = next; onSnapshot(next); onSaveStatus('已保存') }
          return next
        } catch (error) { if (!disposed) onSaveStatus(`保存失败：${describeWorkbenchError(error)}`); throw error }
      },
      setDraft: (text, isActive) => appendWorkbenchDraft(current.current.target, text, isActive)
    })
    return () => { disposed = true; window.clearTimeout(timer); detach() }
  }, [])
  useEffect(() => {
    iframe.current?.contentWindow?.postMessage({ channel: WORKBENCH_MESSAGE, type: 'snapshot', snapshot }, '*')
  }, [snapshot])
  return <iframe ref={iframe} className="workbench-page" title="工作台页面" src={snapshot.pageUrl} sandbox="allow-scripts allow-same-origin" onError={() => onPageStatus({ kind: 'error', message: '页面加载失败，请检查文件后重试。' })} />
}

export function WorkbenchPreview(props: ViewSlotProps & { viewId: WorkbenchViewId }) {
  return <WorkbenchPreviewContent key={`${props.project.id}:${props.viewId}`} {...props} />
}
function WorkbenchPreviewContent({ project, viewId, active }: ViewSlotProps & { viewId: WorkbenchViewId }) {
  const target = workbenchTarget(project.id, viewId)
  const catalog = useWorkbenches(s => s.catalogs[project.id])
  const draft = target.kind === 'draft' ? catalog?.drafts.find(item => item.id === target.id) : undefined
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null), [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [reload, setReload] = useState(0)
  const [pageStatus, setPageStatus] = useState<PageStatus>({ kind: 'loading' }), [saveStatus, setSaveStatus] = useState('已保存')
  const requestSequence = useRef(0), alive = useRef(true), currentSnapshot = useRef<WorkbenchSnapshot | null>(null)
  const acceptSnapshot = useCallback((next: WorkbenchSnapshot) => {
    const previous = currentSnapshot.current
    if (previous?.packageRevision !== next.packageRevision) setPageStatus({ kind: 'loading' })
    else if (previous.stateRevision > next.stateRevision) return
    currentSnapshot.current = next
    setSnapshot(next)
  }, [])
  useEffect(() => { alive.current = true; return () => { alive.current = false; requestSequence.current++ } }, [])
  const refresh = useCallback(async (reloadPage: boolean) => {
    const sequence = ++requestSequence.current
    setLoading(true); setError(null)
    try {
      const result = await workbenchApi().getSnapshot(workbenchTarget(project.id, viewId))
      if (!alive.current || sequence !== requestSequence.current) return
      acceptSnapshot(result)
      if (reloadPage) { setReload(value => value + 1); setPageStatus({ kind: 'loading' }); setSaveStatus('已读取保存状态') }
    } catch (error) { if (alive.current && sequence === requestSequence.current) setError(describeWorkbenchError(error)) }
    finally { if (alive.current && sequence === requestSequence.current) setLoading(false) }
  }, [project.id, viewId, acceptSnapshot])
  useEffect(() => {
    if (!active) return
    void refresh(true)
    return workbenchApi().onChanged(({ target: changed }) => {
      if (changed.projectId === project.id && changed.kind === target.kind && changed.id === target.id) void refresh(false)
    })
  }, [project.id, viewId, active, refresh])
  async function apply() {
    if (!snapshot || pageStatus.kind !== 'ready') return
    setPending(true); setError(null)
    try {
      const instance = await workbenchApi().applyDraft({ projectId: project.id, draftId: target.id, expectedPackageRevision: snapshot.packageRevision })
      await useWorkbenches.getState().load(project.id)
      useProjectShell.getState().enterView(project.id, workbenchViewId({ kind: 'instance', id: instance.id }))
    } catch (error) { if (alive.current) setError(describeWorkbenchError(error)) }
    finally { if (alive.current) setPending(false) }
  }
  async function edit() {
    setPending(true); setError(null)
    try { await openWorkbenchDraft(project.id, 'ai', target.id) }
    catch (error) { if (alive.current) setError(describeWorkbenchError(error)) }
    finally { if (alive.current) setPending(false) }
  }
  async function toggleEnabled() {
    if (!snapshot) return
    setPending(true); setError(null)
    try {
      await workbenchApi().setEnabled({ projectId: project.id, instanceId: target.id, enabled: !snapshot.enabled })
      await refresh(true)
    } catch (error) { if (alive.current) setError(describeWorkbenchError(error)) }
    finally { if (alive.current) setPending(false) }
  }
  async function explainError() {
    const reason = error || (pageStatus.kind === 'error' ? pageStatus.message : '')
    try { await appendWorkbenchDraft(target, `工作台预览失败，请检查开发说明和草稿文件并修复：\n${reason}`, () => alive.current) }
    catch (failure) { setError(describeWorkbenchError(failure)) }
  }
  const editing = target.kind === 'draft'
  return <section className="workbench-preview" aria-label={editing ? '工作台草稿预览' : '工作台实例'}>
    <div className="workbench-toolbar">
      <span className="workbench-toolbar__stage">{editing ? draft?.targetInstanceId ? '编辑草稿' : '新工作台草稿' : '已添加至项目'}</span><span className="grow" />
      <button className="icon-button" aria-label="刷新工作台预览" data-tip="刷新工作台预览" disabled={loading || pending} onClick={() => void refresh(true)}><Icon name="refresh" /></button>
      {editing ? <button className="primary-button" disabled={pending || loading || !!error || !snapshot || pageStatus.kind !== 'ready'} onClick={() => void apply()}>{pending ? '正在应用…' : draft?.targetInstanceId ? '应用更改' : '添加至当前项目'}</button>
        : <><button className="secondary-button" disabled={pending || !snapshot} onClick={() => void edit()}>编辑工作台</button><button className="text-button" disabled={pending || !snapshot} onClick={() => void toggleEnabled()}>{snapshot?.enabled === false ? '启用工作台' : '停用工作台'}</button></>}
    </div>
    {editing && <p className="workbench-notice">在左侧描述或修改页面，完成后刷新预览。{draft?.targetInstanceId ? '应用前，原实例保持不变；应用只更新此实例并保留已保存状态。' : '预览使用独立草稿状态，确认后再添加到项目。'}</p>}
    <details className="workbench-details">
      <summary>{editing ? '来源、能力与开发文件' : '插件信息与备份'}</summary>
      <p>来源：{editing ? draft?.source === 'template' ? '内置简单模板' : '本地 AI 创建 / 编辑草稿' : '当前项目的已校验本地包'}{snapshot && ` · ${snapshot.manifest.pluginId} · ${snapshot.manifest.version}`}</p>
      <p>页面能力：{snapshot?.manifest.capabilities.map(item => capabilityNames[item]).join('、') || '等待包检查'}。填写对话后仍需用户发送。</p>
      {draft && <p>草稿目录：<code>{draft.directory}</code></p>}
      <p>完整备份需要同时保留项目中的工作台文件和应用宿主状态；仅复制项目目录无法恢复全部实例状态。</p>
    </details>
    <div className="workbench-status" role="status"><span>{loading ? '正在检查包…' : error ? '包检查失败' : snapshot ? '包检查通过' : '等待页面文件'}</span><span>{snapshot?.enabled === false ? '页面已停用' : pageStatus.kind === 'ready' ? '页面已连接' : pageStatus.kind === 'error' ? '页面运行失败' : '正在加载页面…'}</span><span className="workbench-status__saved">{saveStatus}</span></div>
    {(error || pageStatus.kind === 'error') && <div className="workbench-error" role="alert"><strong>{error ? '无法预览工作台' : '页面未正常运行'}</strong><p>{error || (pageStatus.kind === 'error' ? pageStatus.message : '')}</p><p>可在左侧对话中修正文件，然后重试。对话和已保存状态会保留。</p><button className="secondary-button" disabled={loading} onClick={() => void refresh(true)}>重试预览</button> <button className="text-button" onClick={() => void explainError()}>将错误填入对话</button></div>}
    {snapshot?.enabled === false ? <div className="workbench-idle"><Icon name="preview" size={28} /><h2>此工作台已停用</h2><p>页面已卸载，已保存状态保留。普通对话继续运行；如需停止对话，请使用对话中的 Stop。</p></div>
      : snapshot && active ? <WorkbenchPage key={`${snapshot.packageRevision}:${reload}`} snapshot={snapshot} onSnapshot={acceptSnapshot} onPageStatus={status => {
        if (currentSnapshot.current?.packageRevision === snapshot.packageRevision) setPageStatus(previous => previous.kind === 'error' && status.kind === 'ready' ? previous : status)
      }} onSaveStatus={setSaveStatus} />
      : !loading && !snapshot ? <div className="workbench-idle"><Icon name="pencil" size={28} /><h2>等待工作台页面</h2><p>在左侧告诉 AI 你需要的工作方式。文件准备好后，刷新这里查看结果。</p></div> : null}
  </section>
}
