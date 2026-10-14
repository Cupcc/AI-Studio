import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { BrowserBounds, BrowserRef, BrowserState } from '@shared/tools/browser'
import { Icon } from '../../app/Icon'
import { browserApi } from './api'
import { scheduleBrowserLayout } from './browser-layout'

const browserRef = ({ projectId, generation }: BrowserRef): BrowserRef => ({ projectId, generation })
export function previewBounds(rect: DOMRect, width: number, height: number): BrowserBounds {
  const x = Math.max(0, Math.min(width, Math.round(rect.left)))
  const y = Math.max(0, Math.min(height, Math.round(rect.top)))
  return { x, y, width: Math.max(0, Math.min(width - x, Math.round(rect.right) - x)), height: Math.max(0, Math.min(height - y, Math.round(rect.bottom) - y)) }
}

export function BrowserPanel({ projectId, active, overlayBlocked = false }: { projectId: string; active: boolean; overlayBlocked?: boolean }) {
  const [state, setState] = useState<BrowserState | null>(null)
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [retry, setRetry] = useState(0)
  const [pending, setPending] = useState(false)
  const [activatedProject, setActivatedProject] = useState<string | null>(active ? projectId : null)
  const host = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const latest = useRef<BrowserState | null>(null)
  const dirty = useRef(false)
  const mounted = useRef(true)
  const operation = useRef(0)
  const focusPending = useRef(false)
  const visibility = useRef({ active, overlayBlocked })
  visibility.current = { active, overlayBlocked }
  const accept = (incoming: BrowserState) => {
    const previous = latest.current
    if (incoming.projectId !== projectId || (previous && (incoming.generation !== previous.generation || incoming.revision < previous.revision))) return
    latest.current = incoming; setState(incoming)
    if (!dirty.current && incoming.address !== previous?.address) setAddress(incoming.address)
  }
  const receive = useRef(accept)
  receive.current = accept
  useEffect(() => { if (active) setActivatedProject(projectId) }, [active, projectId])
  useEffect(() => {
    // Restored background Workspaces do not create or load a native page until selected.
    if (activatedProject !== projectId) return
    mounted.current = true
    latest.current = null; setState(null); setAddress(''); dirty.current = false; focusPending.current = false
    setPending(false); setError(null); setInitializing(true)
    let disposed = false, ref: BrowserRef | null = null
    const buffered: BrowserState[] = []
    const unsubscribe = browserApi().onStateChanged(incoming => {
      if (disposed || incoming.projectId !== projectId) return
      if (!ref) { buffered.push(incoming); if (buffered.length > 32) buffered.shift(); return }
      if (incoming.generation === ref.generation) receive.current(incoming)
    })
    void browserApi().getState({ projectId }).then(result => {
      ref = browserRef(result)
      if (disposed) return
      receive.current(result)
      for (const incoming of buffered) if (incoming.generation === ref.generation) receive.current(incoming)
      setInitializing(false)
    }).catch(reason => { if (!disposed) { setInitializing(false); setError(`无法打开 Browser：${String(reason)}`) } })
    return () => {
      disposed = true; mounted.current = false; operation.current++; unsubscribe()
      if (ref) scheduleBrowserLayout({ ref, visible: false })
    }
  }, [projectId, retry, activatedProject])

  const generation = state?.generation
  const requestedVisible = active && !overlayBlocked && !state?.externalRequest && (state?.status === 'loading' || state?.status === 'ready')
  useEffect(() => {
    if (!generation || !host.current) return
    const ref = { projectId, generation }
    let disposed = false, frame = 0, lastLayout = ''
    const measure = () => {
      if (disposed) return
      const bounds = previewBounds(host.current!.getBoundingClientRect(), window.innerWidth, window.innerHeight)
      const key = `${requestedVisible}:${JSON.stringify(bounds)}`
      const visible = requestedVisible && bounds.width > 0 && bounds.height > 0
      if (key === lastLayout) return
      lastLayout = key
      scheduleBrowserLayout({ ref, bounds, visible,
        accepted: result => {
          if (disposed) return
          receive.current(result)
          if (focusPending.current && result.visible && visibility.current.active && !visibility.current.overlayBlocked) {
            focusPending.current = false
            void browserApi().focus(ref).catch(reason => { if (!disposed) setError(`Browser 聚焦失败：${String(reason)}`) })
          }
        },
        failed: reason => { if (!disposed) setError(`Browser 布局更新失败：${String(reason)}`) }
      })
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(schedule); observer.observe(host.current)
    window.addEventListener('resize', schedule); schedule()
    return () => {
      disposed = true; observer.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame)
      scheduleBrowserLayout({ ref, visible: false })
    }
  }, [projectId, generation, requestedVisible])

  async function run(work: (ref: BrowserRef) => Promise<BrowserState>, focusAfter = false) {
    const current = latest.current
    if (!current || pending) return
    const id = ++operation.current, ref = browserRef(current)
    focusPending.current = focusAfter
    setPending(true); setError(null)
    try {
      const result = await work(ref)
      if (!mounted.current || id !== operation.current || latest.current?.generation !== ref.generation) return
      receive.current(result)
      if (focusAfter && result.visible && !result.externalRequest && !visibility.current.overlayBlocked && visibility.current.active) {
        focusPending.current = false
        void browserApi().focus(ref).catch(reason => { if (mounted.current && id === operation.current) setError(`Browser 聚焦失败：${String(reason)}`) })
      }
    } catch (reason) {
      if (mounted.current && id === operation.current) {
        focusPending.current = false; setError(String(reason))
        if (visibility.current.active && !visibility.current.overlayBlocked) input.current?.focus()
      }
    } finally { if (mounted.current && id === operation.current) setPending(false) }
  }
  function navigate(event: FormEvent) {
    event.preventDefault()
    const url = address.trim()
    if (!url) { input.current?.focus(); return }
    dirty.current = false
    void run(ref => browserApi().navigate({ ...ref, url }), true)
  }
  const external = state?.externalRequest
  return <div className="runtime-tool browser-tool">
    <form className="browser-toolbar" onSubmit={navigate} aria-label="Browser 导航">
      <input ref={input} className="browser-address" type="text" aria-label="本地 Web 地址" placeholder="http://localhost:3000" value={address} autoComplete="off" spellCheck={false} disabled={!state || pending} onChange={event => { dirty.current = true; setAddress(event.target.value) }} />
      <button className="icon-button" aria-label="前往地址" data-tip="前往地址" disabled={!state || pending || !address.trim()} type="submit"><Icon name="arrow-up" size={15} /></button>
      <button className="icon-button" aria-label="刷新网页" data-tip="刷新网页" data-tip-align="end" type="button" disabled={!state?.address || pending} onClick={() => void run(ref => browserApi().reload(ref), true)}><Icon name="refresh" size={15} /></button>
    </form>
    {state?.status === 'loading' && <div className="browser-loading" role="status">正在加载网页…</div>}
    {error && <div className="runtime-tool__error" role="alert">{error}{!state && <button className="secondary-button button--small" onClick={() => setRetry(v => v + 1)}>重试</button>}</div>}
    {external && <div className="browser-external" role="alertdialog" aria-label="在系统浏览器中打开？">
      <p>在系统浏览器中打开此地址？</p><p className="browser-external__url">{external.url}</p>
      <div className="terminal-confirm__actions"><button className="secondary-button button--small" disabled={pending} onClick={() => void run(ref => browserApi().dismissExternal({ ...ref, requestId: external.id }), true)}>取消</button><button className="primary-button button--small" disabled={pending} onClick={() => void run(ref => browserApi().openExternal({ ...ref, requestId: external.id }))}>用系统浏览器打开</button></div>
    </div>}
    <div className="browser-preview" ref={host} aria-label="本地网页预览" tabIndex={state?.status === 'ready' ? 0 : -1} onFocus={event => {
      if (event.target === event.currentTarget && latest.current && requestedVisible) void browserApi().focus(browserRef(latest.current)).catch(reason => setError(String(reason)))
    }}>
      {initializing && <div className="runtime-tool__empty" role="status">正在打开 Browser…</div>}
      {!initializing && state?.status === 'idle' && <div className="runtime-tool__empty"><Icon name="browser" size={28} /><h2>预览本地网页</h2><p>输入 localhost 或回环地址。可在 Terminal 启动开发服务器。</p></div>}
      {(state?.status === 'failed' || state?.status === 'crashed') && <div className="runtime-tool__empty" role="alert"><Icon name="browser" size={28} /><h2>{state.status === 'crashed' ? '网页进程已退出' : '无法加载网页'}</h2><p>{state.error ?? '检查地址和本地服务器，然后重试。'}</p><button className="secondary-button" disabled={pending} onClick={() => void run(ref => browserApi().reload(ref), true)}>重新加载</button></div>}
    </div>
  </div>
}
