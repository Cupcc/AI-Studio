import { randomUUID } from 'node:crypto'
import type { BrowserWindow, Session, WebContentsView } from 'electron'
import type { BrowserBounds, BrowserExternalRef, BrowserExternalRequest, BrowserRef, BrowserState } from '@shared/tools/browser'
import { browserDestination, clampBrowserBounds } from './policy'

export interface BrowserServiceOptions {
  requireProject(projectId: string): void
  /** Blocks creation/navigation during Project close or application quit. */
  canOperate(projectId: string): boolean
  isProjectVisible(projectId: string): boolean
  findWindow(senderId: number): BrowserWindow | null
  createView(partition: string): WebContentsView
  readAddress(projectId: string): string | undefined
  saveAddress(projectId: string, address: string): void
  changed(state: BrowserState): void
  openExternal(url: string): Promise<void>
  newId?: () => string
}

interface Instance {
  state: BrowserState
  view: WebContentsView
  /** Remains accessible when the webContents has already been destroyed. */
  session: Session
  owner: BrowserWindow
  senderId: number
  bounds: BrowserBounds
  requestedVisible: boolean
  attached: boolean
  closing: boolean
  navigation: number
  /** A cancelled provisional load must not replace the still committed page. */
  committed: { address: string; title: string } | null
  pendingLoad: string | null
  removeWindowListeners(): void
}

/** Native views, sessions and load state survive renderer panel unmounts. */
export class BrowserService {
  private readonly instances = new Map<string, Instance>()
  private overlayBlocked = false
  private disposed = false

  constructor(private readonly options: BrowserServiceOptions) {}

  private id(): string { return this.options.newId?.() ?? randomUUID() }
  private snapshot(instance: Instance): BrowserState {
    return { ...instance.state, externalRequest: instance.state.externalRequest ? { ...instance.state.externalRequest } : null }
  }
  private changed(instance: Instance): void {
    if (instance.closing || this.instances.get(instance.state.projectId) !== instance) return
    instance.state.revision++
    this.options.changed(this.snapshot(instance))
  }
  private requireOperation(projectId: string): void {
    if (this.disposed || !this.options.canOperate(projectId)) throw new Error('Project 正在关闭，无法操作预览')
  }
  private instance(ref: BrowserRef, senderId: number): Instance {
    this.options.requireProject(ref.projectId)
    const instance = this.instances.get(ref.projectId)
    if (!instance || instance.state.generation !== ref.generation || instance.closing) {
      throw new Error('预览实例已失效，请重新打开 Browser')
    }
    if (instance.senderId !== senderId) throw new Error('Browser belongs to another application window')
    return instance
  }

  getState(projectId: string, senderId: number): BrowserState {
    this.options.requireProject(projectId)
    const existing = this.instances.get(projectId)
    if (existing) return this.snapshot(this.instance(existing.state, senderId))
    this.requireOperation(projectId)
    const owner = this.options.findWindow(senderId)
    // Only the application's BrowserWindow renderer can own a preview.
    if (!owner || owner.isDestroyed() || owner.webContents.id !== senderId) throw new Error('Unknown application window')
    const generation = this.id()
    // No persist: prefix, no shared default session, no reuse after Project close.
    const view = this.options.createView(`studio-browser-${projectId}-${generation}`)
    view.setVisible(false)
    const instance: Instance = {
      state: { projectId, generation, revision: 0, address: '', title: '', status: 'idle', error: null, visible: false, externalRequest: null },
      view, session: view.webContents.session, owner, senderId, bounds: { x: 0, y: 0, width: 0, height: 0 },
      requestedVisible: false, attached: false, closing: false, navigation: 0, committed: null, pendingLoad: null,
      removeWindowListeners: () => {}
    }
    this.instances.set(projectId, instance)
    this.installGuards(instance)
    const resize = () => this.sync(instance)
    const hide = () => this.detach(instance, false)
    const show = () => this.sync(instance)
    const closed = () => { void this.close(projectId).catch(error => console.error('[browser] close failed', error)) }
    owner.on('resize', resize); owner.on('hide', hide); owner.on('show', show); owner.on('closed', closed)
    instance.removeWindowListeners = () => {
      owner.off('resize', resize); owner.off('hide', hide); owner.off('show', show); owner.off('closed', closed)
    }
    const stored = this.options.readAddress(projectId)
    if (stored) {
      try {
        const destination = browserDestination(stored)
        if (destination.kind === 'local') this.load(instance, destination.url)
      } catch { /* Invalid old state does not authorize a navigation. */ }
    }
    return this.snapshot(instance)
  }

  navigate(ref: BrowserRef, url: string, senderId: number): BrowserState {
    const instance = this.instance(ref, senderId)
    this.requireOperation(ref.projectId)
    const destination = browserDestination(url, true)
    if (destination.kind === 'external') this.requestExternal(instance, destination.url, 'address')
    else this.load(instance, destination.url)
    return this.snapshot(instance)
  }
  reload(ref: BrowserRef, senderId: number): BrowserState {
    const instance = this.instance(ref, senderId)
    this.requireOperation(ref.projectId)
    if (!instance.state.address) return this.snapshot(instance)
    // Recheck the saved URL, never reload a foreign top-level document.
    const destination = browserDestination(instance.state.address)
    if (destination.kind !== 'local') throw new Error('预览地址不是本地地址')
    this.load(instance, destination.url, true)
    return this.snapshot(instance)
  }
  setBounds(ref: BrowserRef, bounds: BrowserBounds, senderId: number): BrowserState {
    const instance = this.instance(ref, senderId)
    clampBrowserBounds(bounds, instance.owner.getContentSize())
    instance.bounds = { ...bounds }
    this.sync(instance)
    return this.snapshot(instance)
  }
  setVisible(ref: BrowserRef, visible: boolean, senderId: number): BrowserState {
    const instance = this.instance(ref, senderId)
    if (visible) this.requireOperation(ref.projectId)
    instance.requestedVisible = visible
    this.sync(instance)
    return this.snapshot(instance)
  }
  focus(ref: BrowserRef, senderId: number): void {
    const instance = this.instance(ref, senderId)
    if (instance.state.visible && !instance.view.webContents.isDestroyed()) instance.view.webContents.focus()
  }
  async openExternal(ref: BrowserExternalRef, senderId: number): Promise<BrowserState> {
    const instance = this.instance(ref, senderId)
    this.requireOperation(ref.projectId)
    const request = instance.state.externalRequest
    if (!request || request.id !== ref.requestId) throw new Error('外部跳转请求已失效')
    const destination = browserDestination(request.url)
    if (destination.kind !== 'external') throw new Error('Expected external HTTP / HTTPS URL')
    // Consume the exact pending request before awaiting the OS, preventing replay.
    instance.state.externalRequest = null
    try {
      await this.options.openExternal(destination.url)
    } catch (error) {
      if (this.instances.get(ref.projectId) === instance && !instance.closing) {
        instance.state.error = `系统浏览器打开失败：${error instanceof Error ? error.message : String(error)}`
        this.changed(instance)
      }
    }
    if (this.instances.get(ref.projectId) === instance && !instance.closing) { this.sync(instance); this.changed(instance) }
    return this.snapshot(instance)
  }
  dismissExternal(ref: BrowserExternalRef, senderId: number): BrowserState {
    const instance = this.instance(ref, senderId)
    if (!instance.state.externalRequest || instance.state.externalRequest.id !== ref.requestId) throw new Error('外部跳转请求已失效')
    instance.state.externalRequest = null
    this.sync(instance); this.changed(instance)
    return this.snapshot(instance)
  }

  private load(instance: Instance, url: string, refresh = false): void {
    if (instance.view.webContents.isDestroyed()) throw new Error('预览进程已关闭，请重新打开 Project')
    const sequence = ++instance.navigation
    instance.pendingLoad = url
    instance.state.address = url
    instance.state.status = 'loading'; instance.state.error = null; instance.state.externalRequest = null
    this.options.saveAddress(instance.state.projectId, url)
    this.sync(instance); this.changed(instance)
    const contents = instance.view.webContents
    const loading = refresh ? contents.loadURL(url, { extraHeaders: 'pragma: no-cache\n' }) : contents.loadURL(url)
    void loading.catch(error => {
      if (this.instances.get(instance.state.projectId) !== instance || instance.closing || sequence !== instance.navigation) return
      if ((error as { code?: string }).code === 'ERR_ABORTED') return
      instance.pendingLoad = null
      instance.state.status = 'failed'
      instance.state.error = `无法加载本地页面：${error instanceof Error ? error.message : String(error)}`
      this.changed(instance)
    })
  }

  private requestExternal(instance: Instance, url: string, source: BrowserExternalRequest['source']): void {
    // will-frame-navigate and will-navigate can refer to the same request.
    if (instance.state.externalRequest?.url === url) return
    // Electron rejects loadURL with ERR_FAILED when a redirect is prevented.
    // Invalidate that rejection even if the user dismisses the prompt first.
    instance.navigation++
    instance.pendingLoad = null
    instance.state.address = instance.committed?.address ?? instance.state.address
    instance.state.title = instance.committed?.title ?? ''
    instance.state.status = instance.committed ? 'ready' : 'idle'
    instance.state.error = null
    this.options.saveAddress(instance.state.projectId, instance.state.address)
    instance.state.externalRequest = { id: this.id(), url, source }
    this.detach(instance, true); this.changed(instance)
  }

  private installGuards(instance: Instance): void {
    const contents = instance.view.webContents
    const guard = (event: { preventDefault(): void }, url: string, source: BrowserExternalRequest['source']) => {
      try {
        const destination = browserDestination(url)
        if (destination.kind === 'local') return
        event.preventDefault()
        this.requestExternal(instance, destination.url, source)
      } catch {
        event.preventDefault()
        instance.state.error = '已阻止非 HTTP / HTTPS 或无效地址的跳转'
        this.changed(instance)
      }
    }
    contents.on('will-navigate', event => guard(event, event.url, 'navigation'))
    contents.on('will-frame-navigate', event => { if (event.isMainFrame) guard(event, event.url, 'navigation') })
    contents.on('will-redirect', event => { if (event.isMainFrame) guard(event, event.url, 'redirect') })
    contents.setWindowOpenHandler(({ url }) => {
      if (instance.closing || this.disposed) return { action: 'deny' }
      try {
        const destination = browserDestination(url)
        if (destination.kind === 'local') this.load(instance, destination.url)
        else this.requestExternal(instance, destination.url, 'window')
      } catch {
        instance.state.error = '已阻止非 HTTP / HTTPS 或无效地址的新窗口'
        this.changed(instance)
      }
      return { action: 'deny' }
    })
    contents.on('will-attach-webview', event => event.preventDefault())
    contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    contents.session.setPermissionCheckHandler(() => false)
    contents.session.setDevicePermissionHandler(() => false)
    contents.session.on('will-download', event => event.preventDefault())
    contents.on('did-start-navigation', event => {
      if (!event.isMainFrame || instance.closing || this.disposed) return
      try {
        const destination = browserDestination(event.url)
        if (destination.kind !== 'local') return
        instance.pendingLoad = destination.url
        instance.state.status = 'loading'; instance.state.error = null; this.changed(instance)
      } catch { /* Guarded top-level URLs never become application addresses. */ }
    })
    const navigated = (url: string, sameDocument = false) => {
      if (instance.closing || this.disposed) return
      try {
        const destination = browserDestination(url)
        if (destination.kind !== 'local') return
        instance.state.address = destination.url
        if (sameDocument && instance.committed) instance.committed.address = destination.url
        this.options.saveAddress(instance.state.projectId, destination.url)
        this.changed(instance)
      } catch { /* Ignore the initial empty document. */ }
    }
    contents.on('did-navigate', (_event, url) => navigated(url))
    contents.on('did-navigate-in-page', (_event, url, mainFrame) => { if (mainFrame) navigated(url, true) })
    contents.on('did-finish-load', () => {
      if (instance.closing || contents.isDestroyed() || instance.state.externalRequest || !instance.pendingLoad) return
      try {
        const destination = browserDestination(contents.getURL())
        if (destination.kind !== 'local') return
        instance.pendingLoad = null
        instance.state.address = destination.url
        instance.state.status = 'ready'; instance.state.error = null
        instance.state.title = contents.getTitle()
        instance.committed = { address: destination.url, title: instance.state.title }
        this.options.saveAddress(instance.state.projectId, destination.url)
        this.changed(instance)
      } catch { /* Empty initial documents aren't loaded previews. */ }
    })
    contents.on('page-title-updated', (_event, title) => {
      if (!instance.closing) {
        instance.state.title = title
        if (!instance.pendingLoad && instance.committed) instance.committed.title = title
        this.changed(instance)
      }
    })
    contents.on('did-fail-load', (_event, code, description, url, mainFrame) => {
      if (!mainFrame || code === -3 || instance.closing || instance.state.externalRequest || !instance.pendingLoad) return
      // An aborted older load must not replace a newer address's state.
      try { if (browserDestination(url).url !== instance.pendingLoad) return } catch { return }
      instance.pendingLoad = null
      instance.state.status = 'failed'; instance.state.error = `无法加载本地页面：${description} (${code})`
      this.changed(instance)
    })
    contents.on('render-process-gone', (_event, details) => {
      if (instance.closing) return
      instance.pendingLoad = null
      instance.state.status = 'crashed'; instance.state.error = `预览进程已退出（${details.reason}），可刷新重试`
      this.detach(instance, true); this.changed(instance)
    })
    contents.on('destroyed', () => {
      if (instance.closing) return
      instance.pendingLoad = null
      instance.state.status = 'crashed'; instance.state.error = '预览实例已关闭，请重新打开 Project'
      this.detach(instance, true); this.changed(instance)
    })
  }

  private detach(instance: Instance, returnFocus: boolean): void {
    if (instance.attached && !instance.owner.isDestroyed()) instance.owner.contentView.removeChildView(instance.view)
    instance.attached = false
    instance.view.setVisible(false)
    if (instance.state.visible) {
      instance.state.visible = false
      if (returnFocus && !instance.owner.isDestroyed() && !instance.owner.webContents.isDestroyed()) instance.owner.webContents.focus()
      this.changed(instance)
    }
  }
  private sync(instance: Instance): void {
    const eligible = !this.disposed && !instance.closing && !this.overlayBlocked
      && instance.requestedVisible && !instance.state.externalRequest
      && this.options.canOperate(instance.state.projectId) && this.options.isProjectVisible(instance.state.projectId)
      && !instance.owner.isDestroyed() && instance.owner.isVisible() && !instance.view.webContents.isDestroyed()
      && instance.state.status !== 'crashed'
    if (!eligible) { this.detach(instance, true); return }
    const bounds = clampBrowserBounds(instance.bounds, instance.owner.getContentSize())
    if (bounds.width === 0 || bounds.height === 0) { this.detach(instance, true); return }
    instance.view.setBounds(bounds)
    if (!instance.attached) { instance.owner.contentView.addChildView(instance.view); instance.attached = true }
    instance.view.setVisible(true)
    if (!instance.state.visible) { instance.state.visible = true; this.changed(instance) }
  }

  /** Called by trusted shell lifecycle hooks after active Project/tool changes. */
  syncVisibility(): void { for (const instance of this.instances.values()) this.sync(instance) }
  hideAll(): void { for (const instance of this.instances.values()) { instance.requestedVisible = false; this.detach(instance, true) } }
  setOverlayBlocked(blocked: boolean): void { this.overlayBlocked = blocked; this.syncVisibility() }

  async close(projectId: string): Promise<void> {
    const instance = this.instances.get(projectId)
    if (!instance) return
    instance.closing = true
    this.detach(instance, false)
    instance.removeWindowListeners()
    try {
      // Bypass beforeunload: pages must not veto the user's Project close.
      if (!instance.view.webContents.isDestroyed()) instance.view.webContents.close({ waitForBeforeUnload: false })
      this.instances.delete(projectId)
      await instance.session.clearStorageData()
    } catch (error) {
      instance.closing = false
      instance.state.status = 'failed'; instance.state.error = `预览关闭失败：${error instanceof Error ? error.message : String(error)}`
      this.instances.set(projectId, instance); this.changed(instance)
      throw error
    }
  }
  /** Reusable during quit confirmation; a failed attempt does not poison the service. */
  async closeAll(): Promise<void> {
    const results = await Promise.allSettled([...this.instances.keys()].map(id => this.close(id)))
    const failures = results.filter(result => result.status === 'rejected')
    if (failures.length) throw new AggregateError(failures.map(result => (result as PromiseRejectedResult).reason), 'Browser cleanup failed')
  }
  async dispose(): Promise<void> {
    this.disposed = true
    await this.closeAll()
  }
}
