import { lazy, Suspense, useEffect, useState } from 'react'
import type { TerminalSummary } from '@shared/tools/terminal'
import { Icon } from '../../app/Icon'
import { useTerminals } from './terminal-store'

const TerminalScreen = lazy(() => import('./TerminalScreen'))

export function TerminalPanel({ projectId, active, overlayBlocked = false }: { projectId: string; active: boolean; overlayBlocked?: boolean }) {
  const project = useTerminals(s => s.projects[projectId])
  const [confirming, setConfirming] = useState<TerminalSummary | null>(null)
  const [screenError, setScreenError] = useState<string | null>(null)
  const [screenVersion, setScreenVersion] = useState(0)
  useEffect(() => { if (active) void useTerminals.getState().open(projectId) }, [projectId, active])
  useEffect(() => { setConfirming(null); setScreenError(null) }, [projectId, project?.activeId])
  const terminal = project?.terminals.find(t => t.terminalId === project.activeId)
  const busy = project?.loading || project?.pending
  async function close(tab: TerminalSummary, confirmed = false) {
    if (!confirmed && (tab.state === 'running' || tab.state === 'closing' || tab.state === 'close_failed')) { setConfirming(tab); return }
    const result = await useTerminals.getState().close(tab, confirmed)
    if (result?.status === 'needs_confirmation') setConfirming(result.terminal)
    else if (result?.status === 'closed') setConfirming(null)
  }
  return <div className="runtime-tool terminal-tool">
    <div className="terminal-tabs" aria-label="Terminal Tabs">
      <div className="terminal-tabs__list" role="tablist" aria-label="终端实例">
        {project?.terminals.map(tab => <div className={`terminal-tab ${tab.terminalId === project.activeId ? 'is-selected' : ''}`} key={tab.terminalId}>
          <button role="tab" aria-selected={tab.terminalId === project.activeId} aria-controls={`terminal-${projectId}`} onClick={() => useTerminals.getState().select(projectId, tab.terminalId)} title={tab.cwd}>
            <Icon name="terminal" size={14} /><span>{tab.title}</span>{tab.state === 'exited' && <span className="terminal-tab__state">已退出</span>}
          </button>
          <button className="terminal-tab__close" aria-label={`关闭 ${tab.title}`} disabled={busy} onClick={() => void close(tab)}><Icon name="close" size={12} /></button>
        </div>)}
      </div>
      <button className="icon-button" aria-label="新建终端" data-tip="新建终端" data-tip-align="end" disabled={busy || !project?.loaded} onClick={() => void useTerminals.getState().create(projectId)}><Icon name="plus" size={15} /></button>
    </div>
    {(project?.error || screenError) && <div className="runtime-tool__error" role="alert">{project?.error || screenError}{screenError && <button className="secondary-button button--small" onClick={() => { setScreenError(null); setScreenVersion(v => v + 1) }}>重新连接</button>}</div>}
    {confirming && <div className="terminal-confirm" role="alertdialog" aria-label={`关闭 ${confirming.title}？`}>
      <p>结束并关闭 {confirming.title}？</p><span className="muted">此终端中仍在运行的进程将结束。</span>
      <div className="terminal-confirm__actions"><button className="secondary-button button--small" disabled={busy} onClick={() => setConfirming(null)}>取消</button><button className="danger-button button--small" disabled={busy} onClick={() => void close(confirming, true)}>{busy ? '正在结束…' : '结束并关闭'}</button></div>
    </div>}
    {project?.loading && <div className="runtime-tool__empty" role="status">正在打开终端…</div>}
    {!project?.loading && terminal && <div id={`terminal-${projectId}`} className="terminal-panel" role="tabpanel" aria-label={terminal.title}>
      <Suspense fallback={<div className="runtime-tool__empty" role="status">正在加载终端…</div>}><TerminalScreen key={`${projectId}:${terminal.terminalId}:${terminal.generation}:${screenVersion}`} terminal={terminal} active={active && !overlayBlocked && !confirming} onError={setScreenError} /></Suspense>
      {terminal.state === 'exited' && <div className="terminal-exit" role="status">终端已退出{terminal.exitCode !== undefined ? `（退出码 ${terminal.exitCode}）` : ''}</div>}
      {terminal.error && <div className="runtime-tool__error" role="alert">{terminal.error}</div>}
    </div>}
    {!project?.loading && project?.loaded && !terminal && <div className="runtime-tool__empty"><Icon name="terminal" size={28} /><h2>没有打开的终端</h2><button className="secondary-button" disabled={busy} onClick={() => void useTerminals.getState().create(projectId)}>新建终端</button></div>}
    {!project?.loading && !project?.loaded && project?.error && <div className="runtime-tool__empty"><button className="secondary-button" onClick={() => void useTerminals.getState().open(projectId)}>重试打开终端</button></div>}
  </div>
}
