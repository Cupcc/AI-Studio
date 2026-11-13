import selectionTemplate from '../../../../../build/workbenches/product-selection/manifest.json'
import { useEffect, type ReactNode } from 'react'
import { type WorkbenchSnapshot } from '@shared/workbench/types'
import { WorkbenchPage } from './WorkbenchPage'
import type { ViewSlotProps } from '../project/integration'
import { Icon } from '../../app/Icon'
import { explainWorkbenchError, refreshWorkbench, resetPage, upgradeWorkbench, useWorkbenchHost } from './host'
import { useWorkbenches, workbenchKey } from './store'
import './workbench.css'

function ErrorBanner({ title, message, hint, children }: { title: string; message: string; hint?: string; children: ReactNode }) {
  return <div className="workbench-error" role="alert"><Icon name="alert" />
    <div className="workbench-error__text"><strong>{title}</strong><p>{message}</p>{hint && <p className="workbench-error__hint">{hint}</p>}</div>
    <div className="workbench-error__actions">{children}</div>
  </div>
}

function WorkbenchContent({ active, snapshot }: ViewSlotProps & { snapshot: WorkbenchSnapshot }) {
  const { ref, entry, page } = snapshot
  const { host, loading, error, pageError } = useWorkbenchHost(ref)
  useEffect(() => { if (active) resetPage(ref) }, [active, page?.packageRevision])
  const editing = entry.kind === 'draft'
  const upgradeAvailable = !editing && entry.origin === 'custom' && page?.manifest.pluginId === selectionTemplate.pluginId && page.manifest.version !== selectionTemplate.version
  return <section className="workbench-preview" aria-label={editing ? '工作台草稿预览' : '工作台实例'}>
    {upgradeAvailable && <div className="workbench-notice"><span>选品模板有新版界面。升级保留任务、候选和执行记录，会替换当前页面定制；先预览，再应用。</span><button className="secondary-button button--small" disabled={host.pending} onClick={() => void upgradeWorkbench(ref)}>预览新版选品画布</button></div>}
    {editing && <p className="workbench-notice">{entry.targetInstanceId ? '应用前原工作台保持不变；应用只替换页面，保留已保存的数据。' : '草稿用独立数据预览，添加后才写入项目。'}</p>}
    {(error || pageError) && <ErrorBanner title={error ? '无法预览工作台' : '页面未正常运行'} message={error || pageError!} hint="可在左侧对话中修正文件后重试。对话和已保存的数据都还在。">
      <button className="secondary-button button--small" disabled={loading} onClick={() => void refreshWorkbench(ref)}>重试预览</button>
      <button className="primary-button button--small" onClick={() => void explainWorkbenchError(ref)}>将错误填入对话</button>
    </ErrorBanner>}
    {page && active ? <WorkbenchPage key={`${page.packageRevision}:${host.reload}`} workbenchRef={ref} page={page} onPageStatus={status => useWorkbenches.getState().updateHost(ref, previous => ({
        connectedRevision: page.packageRevision,
        pageStatus: previous.pageStatus.kind === 'error' && status.kind === 'ready' ? previous.pageStatus : status
      }))} onSaveStatus={(saveStatus, failed = false) => useWorkbenches.getState().updateHost(ref, { saveStatus, saveFailed: failed })} />
      : !loading && !page ? <div className="workbench-idle"><Icon name="pencil" size={28} /><h2>等待工作台页面</h2><p>在左侧告诉 AI 你需要的工作方式。文件准备好后，在“更多操作”中重新加载。</p></div> : null}
  </section>
}

export function WorkbenchPreview(props: ViewSlotProps) {
  const ref = { projectId: props.project.id, viewId: props.viewId }, key = workbenchKey(ref)
  const snapshot = useWorkbenches(s => s.snapshots[key]), error = useWorkbenches(s => s.snapshotErrors[key])
  const loading = useWorkbenches(s => s.loading[key])
  useEffect(() => {
    if (props.active) void useWorkbenches.getState().loadSnapshot({ projectId: props.project.id, viewId: props.viewId })
  }, [props.project.id, props.viewId, props.active])
  return <>{error && <ErrorBanner title="无法读取工作台" message={error}>
    <button className="secondary-button button--small" disabled={loading} onClick={() => void useWorkbenches.getState().loadSnapshot(ref)}>重试</button>
  </ErrorBanner>}
    {snapshot ? <WorkbenchContent key={key} {...props} snapshot={snapshot} />
      : !error && <div className="workbench-idle" role="status">正在读取工作台…</div>}
  </>
}
