import { useEffect, useMemo, useRef } from 'react'
import { WORKBENCH_MESSAGE, isCustomWorkbenchId, type WorkbenchPageSnapshot, type WorkbenchRef, type WorkbenchSessionLink } from '@shared/workbench/types'
import { useSessions } from '../session/store'
import { useSettings } from '../settings/store'
import { appendWorkbenchDraft, openWorkbenchSession } from './conversation'
import { describeWorkbenchError, workbenchApi } from './api'
import { attachWorkbenchPageBridge } from './page-bridge'
import { useWorkbenches } from './store'

export type PageStatus = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string }

export function pageWithEnvironment(page: WorkbenchPageSnapshot, sessions: WorkbenchSessionLink[], appearance: WorkbenchPageSnapshot['appearance']): WorkbenchPageSnapshot {
  const resources = {
    ...(page.manifest.capabilities.includes('project.knowledge.read') && page.resources?.knowledge ? { knowledge: page.resources.knowledge } : {}),
    ...(page.manifest.capabilities.includes('project.sessions.read') ? { sessions } : {})
  }
  return { ...page, resources, appearance }
}

export function WorkbenchPage({ workbenchRef, page, zoom, onPageStatus, onSaveStatus }: {
  workbenchRef: WorkbenchRef; page: WorkbenchPageSnapshot; zoom: number
  onPageStatus(status: PageStatus): void
  onSaveStatus(status: string): void
}) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const summaries = useSessions(s => s.summaries), appearance = useSettings(s => s.appearance)
  const sessionLinks = useMemo(() => Object.values(summaries).filter(session => session.projectId === workbenchRef.projectId).map(({ id, title, activity, status, lastOutcome, updatedAt, lastUserMessageAt, createdAt }) => ({ id, title, activity, status, lastOutcome, updatedAt, lastUserMessageAt, createdAt })), [summaries, workbenchRef.projectId])
  const pageAppearance = useMemo(() => {
    const computed = getComputedStyle(document.documentElement), variables: Record<string, string> = {}
    for (let index = 0; index < computed.length; index++) {
      const name = computed.item(index)
      if (name.startsWith('--')) variables[name] = computed.getPropertyValue(name).trim()
    }
    return { dark: appearance.dark, variables }
  }, [appearance])
  const decorated = useMemo(() => pageWithEnvironment(page, sessionLinks, pageAppearance), [page, sessionLinks, pageAppearance])
  const current = useRef({ page: decorated, workbenchRef })
  current.current = { page: decorated, workbenchRef }
  useEffect(() => {
    const frame = iframe.current?.contentWindow
    if (!frame) return
    let disposed = false
    const timer = window.setTimeout(() => onPageStatus({ kind: 'error', message: '页面未能连接宿主，请检查入口脚本后重试。' }), 10_000)
    const detach = attachWorkbenchPageBridge({
      frame, snapshot: () => current.current.page,
      ready: () => { window.clearTimeout(timer); onPageStatus({ kind: 'ready' }) },
      error: error => { window.clearTimeout(timer); onPageStatus({ kind: 'error', message: error }) },
      updateState: async (state, expectedRevision) => {
        const ref = current.current.workbenchRef
        if (!isCustomWorkbenchId(ref.viewId)) throw new Error('此工作台未声明保存状态能力')
        onSaveStatus('正在保存…')
        try {
          const next = await workbenchApi().updateState({ ref: { projectId: ref.projectId, viewId: ref.viewId }, state, expectedRevision })
          useWorkbenches.getState().acceptSnapshot(next)
          if (!next.page) throw new Error(next.error ?? '无法读取保存后的工作台状态')
          const result = pageWithEnvironment(next.page, current.current.page.resources?.sessions ?? [], current.current.page.appearance)
          if (!disposed) { current.current = { workbenchRef: next.ref, page: result }; onSaveStatus('已保存') }
          return result
        } catch (error) { if (!disposed) onSaveStatus(`保存失败：${describeWorkbenchError(error)}`); throw error }
      },
      setDraft: (text, isActive, target) => appendWorkbenchDraft(current.current.workbenchRef, text, isActive, target),
      openSession: (sessionId, isActive) => openWorkbenchSession(current.current.workbenchRef, sessionId, isActive)
    })
    return () => { disposed = true; window.clearTimeout(timer); detach() }
  }, [])
  useEffect(() => {
    iframe.current?.contentWindow?.postMessage({ channel: WORKBENCH_MESSAGE, type: 'snapshot', snapshot: decorated }, '*')
  }, [decorated])
  return <div className="workbench-page-viewport"><iframe ref={iframe} className="workbench-page" title="工作台页面" src={page.pageUrl}
    style={{ width: `${100 / zoom}%`, height: `${100 / zoom}%`, transform: `scale(${zoom})` }}
    sandbox="allow-scripts allow-same-origin" onError={() => onPageStatus({ kind: 'error', message: '页面加载失败，请检查文件后重试。' })} /></div>
}
