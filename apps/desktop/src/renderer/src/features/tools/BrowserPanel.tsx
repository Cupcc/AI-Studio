import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { BrowserBounds, BrowserRef, BrowserState, BrowserSuggestion, BrowserTab } from '@shared/tools/browser'
import { Icon } from '../../app/Icon'
import { below, popupMenu, separator } from '../../lib/menu'
import { browserApi } from './api'
import { scheduleBrowserLayout } from './browser-layout'
import { useBrowserRequests } from './browser-requests'

const browserRef = ({ projectId, generation }: BrowserRef): BrowserRef => ({ projectId, generation })
const hostOf = (url: string) => { try { return new URL(url).host || url } catch { return url } }
const PERMISSION_LABELS: Record<string, string> = {
  media: '使用摄像头或麦克风', geolocation: '获取你的位置', notifications: '显示通知', 'clipboard-read': '读取剪贴板',
  'display-capture': '共享屏幕', midiSysex: '使用 MIDI 设备', 'idle-detection': '检测你是否在使用设备'
}
const permissionLabel = (permission: string) => PERMISSION_LABELS[permission] ?? `使用 ${permission}`
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
  const [confirmClear, setConfirmClear] = useState(false)
  const [suggestions, setSuggestions] = useState<BrowserSuggestion[] | null>(null)
  const [suggested, setSuggested] = useState(-1)
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
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
    if (incoming.projectId !== projectId) return
    // Main publishes the Project's current tab, ordered by the Project-wide `revision`.
    if (previous && incoming.generation !== previous.generation) {
      // Another current tab is accepted only when it is a tab of this same Browser; anything else is a stale instance.
      const related = previous.tabs.some(tab => tab.generation === incoming.generation) || incoming.tabs.some(tab => tab.generation === previous.generation)
      if (!related) return
    }
    if (previous && incoming.revision < previous.revision) return
    // Another tab became current: its own address replaces whatever was typed.
    if (previous && incoming.generation !== previous.generation) dirty.current = false
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
      receive.current(incoming)
    })
    const unsubscribeFocus = browserApi().onFocusAddress(request => {
      if (disposed || request.projectId !== projectId || request.generation !== latest.current?.generation) return
      input.current?.focus(); input.current?.select()
    })
    void browserApi().getState({ projectId }).then(result => {
      ref = browserRef(result)
      if (disposed) return
      receive.current(result)
      for (const incoming of buffered) receive.current(incoming)
      setInitializing(false)
    }).catch(reason => { if (!disposed) { setInitializing(false); setError(`无法打开 Browser：${String(reason)}`) } })
    return () => {
      disposed = true; mounted.current = false; operation.current++; unsubscribe(); unsubscribeFocus()
      const shown = latest.current ?? ref
      if (shown) scheduleBrowserLayout({ ref: browserRef(shown), visible: false })
    }
  }, [projectId, retry, activatedProject])

  const generation = state?.generation
  const requestedVisible = active && !overlayBlocked && !confirmClear && !state?.externalRequest && !state?.permissionRequest && (state?.status === 'loading' || state?.status === 'ready')
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
    const chosen = suggestions && suggested >= 0 ? suggestions[suggested] : undefined
    const url = chosen?.url ?? address.trim()
    closeSuggestions()
    if (!url) { input.current?.focus(); return }
    dirty.current = false
    void run(ref => browserApi().navigate({ ...ref, url }), true)
  }
  function closeSuggestions() { clearTimeout(suggestTimer.current); setSuggestions(null); setSuggested(-1) }
  /** Favorites and history matching the address text, as VS Code's address bar suggests them. */
  function suggest(query: string) {
    clearTimeout(suggestTimer.current)
    suggestTimer.current = setTimeout(() => {
      void browserApi().suggest({ query }).then(items => { if (mounted.current && document.activeElement === input.current) { setSuggestions(items.length ? items : null); setSuggested(-1) } }).catch(() => {})
    }, 80)
  }
  function onAddressKey(event: KeyboardEvent<HTMLInputElement>) {
    if (suggestions && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      setSuggested(index => event.key === 'ArrowDown' ? Math.min(suggestions.length - 1, index + 1) : Math.max(-1, index - 1))
      return
    }
    // Escape closes the suggestions, then restores the page's address, as in VS Code and Chrome.
    if (event.key !== 'Escape') return
    if (suggestions) { closeSuggestions(); return }
    dirty.current = false
    setAddress(latest.current?.address ?? '')
    event.currentTarget.blur()
  }
  async function openMenu(anchor: HTMLElement) {
    const current = latest.current
    if (!current) return
    const loaded = !!current.address && current.status !== 'crashed'
    const choice = await popupMenu([
      { id: 'new-tab', label: '新建标签页' },
      { id: 'close-tab', label: '关闭标签页' },
      separator,
      { id: 'system', label: '在系统浏览器中打开', enabled: !!current.address },
      { id: 'devtools', label: '开发者工具', type: 'checkbox', checked: current.devTools, enabled: loaded, accelerator: 'Alt+CmdOrCtrl+I' },
      separator,
      { id: 'zoom-in', label: '放大', enabled: loaded, accelerator: 'CmdOrCtrl+=' },
      { id: 'zoom-out', label: '缩小', enabled: loaded, accelerator: 'CmdOrCtrl+-' },
      { id: 'zoom-reset', label: `实际大小（当前 ${current.zoom}%）`, enabled: loaded && current.zoom !== 100, accelerator: 'CmdOrCtrl+0' },
      separator,
      { id: 'clear-history', label: '清除浏览历史' },
      { id: 'reset-permissions', label: '重置网站权限' },
      { id: 'clear', label: '清除浏览数据…' }
    ], below(anchor))
    if (choice === 'new-tab') void run(() => browserApi().newTab({ projectId }))
    else if (choice === 'close-tab') void run(ref => browserApi().closeTab(ref))
    else if (choice === 'system') void run(ref => browserApi().openInSystemBrowser(ref))
    else if (choice === 'devtools') void run(ref => browserApi().toggleDevTools(ref))
    else if (choice === 'zoom-in' || choice === 'zoom-out' || choice === 'zoom-reset') void run(ref => browserApi().zoom({ ...ref, zoom: choice === 'zoom-in' ? 'in' : choice === 'zoom-out' ? 'out' : 'reset' }), true)
    else if (choice === 'clear-history') void run(ref => browserApi().clearHistory(ref))
    else if (choice === 'reset-permissions') void run(ref => browserApi().resetPermissions(ref))
    else if (choice === 'clear') setConfirmClear(true)
  }
  // A link clicked elsewhere (Terminal) asks this Project's Browser to navigate once the page instance exists.
  const request = useBrowserRequests(store => store.pending[projectId])
  useEffect(() => {
    if (!request || !state || initializing || pending) return
    useBrowserRequests.getState().take(projectId, request.nonce)
    dirty.current = false
    void run(ref => browserApi().navigate({ ...ref, url: request.url }), true)
  }, [request?.nonce, state?.generation, initializing, pending])
  const external = state?.externalRequest
  const permission = state?.permissionRequest
  const loading = state?.status === 'loading'
  const tabs = state?.tabs ?? []
  const tabName = (tab: BrowserTab) => tab.title || (tab.address ? hostOf(tab.address) : '新标签页')
  return <div className="runtime-tool browser-tool">
    {tabs.length > 1 && <div className="browser-tabs" role="tablist" aria-label="Browser 标签页">
      {tabs.map(tab => <div key={tab.generation} className={`browser-tab ${tab.generation === state?.generation ? 'is-current' : ''}`} title={tab.address || undefined}>
        <button role="tab" aria-selected={tab.generation === state?.generation} disabled={pending} onClick={() => { if (tab.generation !== state?.generation) void run(() => browserApi().selectTab({ projectId, generation: tab.generation }), true) }}>
          {tab.status === 'loading' && <span className="browser-tab__spinner" aria-hidden="true" />}<span>{tabName(tab)}</span>
        </button>
        <button className="browser-tab__close" aria-label={`关闭标签页 ${tabName(tab)}`} disabled={pending} onClick={() => void run(() => browserApi().closeTab({ projectId, generation: tab.generation }))}><Icon name="close" size={10} /></button>
      </div>)}
    </div>}
    <form className="browser-toolbar" onSubmit={navigate} aria-label="Browser 导航">
      <button className="icon-button" aria-label="后退" data-tip="后退" type="button" disabled={!state?.canGoBack || pending} onClick={() => void run(ref => browserApi().goBack(ref), true)}><Icon name="arrow-left" size={15} /></button>
      <button className="icon-button" aria-label="前进" data-tip="前进" type="button" disabled={!state?.canGoForward || pending} onClick={() => void run(ref => browserApi().goForward(ref), true)}><Icon name="arrow-right" size={15} /></button>
      {loading
        ? <button className="icon-button" aria-label="停止加载" data-tip="停止加载" type="button" disabled={pending} onClick={() => void run(ref => browserApi().stop(ref))}><Icon name="close" size={15} /></button>
        : <button className="icon-button" aria-label="刷新网页" data-tip="刷新网页" type="button" disabled={!state?.address || pending} onClick={() => void run(ref => browserApi().reload(ref), true)}><Icon name="refresh" size={15} /></button>}
      <div className="browser-address-field">
        <input ref={input} className="browser-address" type="text" aria-label="网址" placeholder="输入网址，如 localhost:3000 或 example.com" value={address} autoComplete="off" spellCheck={false} disabled={!state || pending}
          title={state?.title || undefined} role="combobox" aria-expanded={!!suggestions} aria-controls="browser-suggestions" aria-autocomplete="list"
          aria-activedescendant={suggestions && suggested >= 0 ? `browser-suggestion-${suggested}` : undefined}
          onFocus={event => { event.currentTarget.select(); suggest(event.currentTarget.value === latest.current?.address ? '' : event.currentTarget.value) }}
          onBlur={() => setTimeout(closeSuggestions, 120)} onKeyDown={onAddressKey}
          onChange={event => { dirty.current = true; setAddress(event.target.value); suggest(event.target.value) }} />
        <button className={`browser-star ${state?.favorite ? 'is-on' : ''}`} type="button" aria-label={state?.favorite ? '取消收藏' : '收藏此页'} aria-pressed={state?.favorite ?? false} data-tip={state?.favorite ? '取消收藏' : '收藏此页'}
          disabled={!state?.address || pending} onClick={() => void run(ref => browserApi().toggleFavorite(ref))}><Icon name={state?.favorite ? 'star-filled' : 'star'} size={14} /></button>
        {suggestions && <div className="browser-suggestions popover" id="browser-suggestions" role="listbox" aria-label="网址建议">
          {suggestions.map((item, index) => <div key={`${item.kind}:${item.url}`} id={`browser-suggestion-${index}`} role="option" aria-selected={index === suggested}
            className={`browser-suggestion ${index === suggested ? 'is-active' : ''}`}
            onMouseDown={event => { event.preventDefault(); closeSuggestions(); dirty.current = false; setAddress(item.url); void run(ref => browserApi().navigate({ ...ref, url: item.url }), true) }}>
            <Icon name={item.kind === 'favorite' ? 'star-filled' : 'history'} size={13} />
            <span className="browser-suggestion__title">{item.title || hostOf(item.url)}</span>
            <span className="browser-suggestion__url">{item.url}</span>
          </div>)}
        </div>}
      </div>
      <button className="icon-button" aria-label="前往网址" data-tip="前往网址" disabled={!state || pending || !address.trim()} type="submit"><Icon name="arrow-up" size={15} /></button>
      <button className="icon-button" aria-label="新建 Browser 标签页" data-tip="新建标签页" type="button" disabled={!state || pending || tabs.length >= 12} onClick={() => void run(() => browserApi().newTab({ projectId }))}><Icon name="plus" size={15} /></button>
      <button className="icon-button" aria-label="更多 Browser 操作" data-tip="更多操作" data-tip-align="end" type="button" disabled={!state} onClick={event => void openMenu(event.currentTarget)}><Icon name="dots" size={15} /></button>
    </form>
    {loading && <div className="browser-loading" role="status">正在加载网页…</div>}
    {state?.notice && <div className="browser-notice" role="status"><span>{state.notice}</span><button className="icon-button" aria-label="关闭提示" onClick={() => void run(ref => browserApi().dismissNotice(ref))}><Icon name="close" size={12} /></button></div>}
    {error && <div className="runtime-tool__error" role="alert">{error}{!state && <button className="secondary-button button--small" onClick={() => setRetry(v => v + 1)}>重试</button>}</div>}
    {state?.error && state.status !== 'failed' && state.status !== 'crashed' && <div className="runtime-tool__error" role="alert">{state.error}</div>}
    {permission && <div className="browser-external" role="alertdialog" aria-label="网站请求权限">
      <p><strong>{permission.origin}</strong> 请求{permissionLabel(permission.permission)}</p><p className="browser-external__url">你的选择会按网站记住，可在“更多操作 › 重置网站权限”中撤销。</p>
      <div className="terminal-confirm__actions">
        <button className="secondary-button button--small" disabled={pending} onClick={() => void run(ref => browserApi().answerPermission({ ...ref, requestId: permission.id, allow: false }), true)}>拒绝</button>
        <button className="primary-button button--small" disabled={pending} onClick={() => void run(ref => browserApi().answerPermission({ ...ref, requestId: permission.id, allow: true }), true)}>允许</button>
      </div>
    </div>}
    {confirmClear && <div className="browser-external" role="alertdialog" aria-label="清除浏览数据？">
      <p>清除所有 Project 共享的 Cookie、登录状态和缓存？</p><p className="browser-external__url">已登录的网站需要重新登录。</p>
      <div className="terminal-confirm__actions"><button className="secondary-button button--small" disabled={pending} onClick={() => setConfirmClear(false)}>取消</button><button className="danger-button button--small" disabled={pending} onClick={() => { setConfirmClear(false); void run(ref => browserApi().clearData(ref)) }}>清除</button></div>
    </div>}
    {external && <div className="browser-external" role="alertdialog" aria-label="用系统应用打开？">
      <p>用系统应用打开此链接？</p><p className="browser-external__url">{external.url}</p>
      <div className="terminal-confirm__actions"><button className="secondary-button button--small" disabled={pending} onClick={() => void run(ref => browserApi().dismissExternal({ ...ref, requestId: external.id }), true)}>取消</button><button className="primary-button button--small" disabled={pending} onClick={() => void run(ref => browserApi().openExternal({ ...ref, requestId: external.id }))}>打开</button></div>
    </div>}
    <div className="browser-preview" ref={host} aria-label="网页预览" tabIndex={state?.status === 'ready' ? 0 : -1} onFocus={event => {
      if (event.target === event.currentTarget && latest.current && requestedVisible) void browserApi().focus(browserRef(latest.current)).catch(reason => setError(String(reason)))
    }}>
      {initializing && <div className="runtime-tool__empty" role="status">正在打开 Browser…</div>}
      {!initializing && state?.status === 'idle' && <div className="runtime-tool__empty"><Icon name="browser" size={28} /><h2>打开网页</h2><p>输入网址，本地地址可省略 http://。可在 Terminal 启动开发服务器。</p></div>}
      {(state?.status === 'failed' || state?.status === 'crashed') && <div className="runtime-tool__empty" role="alert"><Icon name="browser" size={28} /><h2>{state.status === 'crashed' ? '网页进程已退出' : '无法加载网页'}</h2><p>{state.error ?? '检查网址和网络，然后重试。'}</p><button className="secondary-button" disabled={pending} onClick={() => void run(ref => browserApi().reload(ref), true)}>重新加载</button></div>}
    </div>
  </div>
}
