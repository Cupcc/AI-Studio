import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import type { BrowserWindow, DownloadItem, Event as ElectronEvent, Input, Session, WebContents, WebContentsView } from 'electron'
import {
  BROWSER_TAB_LIMIT,
  type BrowserBounds, type BrowserExternalRef, type BrowserExternalRequest, type BrowserFocusAddress, type BrowserRef, type BrowserState,
  type BrowserSuggestion, type BrowserZoom
} from '@shared/tools/browser'
import { ALLOWED_PERMISSIONS, BrowserData, PROMPTED_PERMISSIONS, type BrowserDataStorage } from './browser-data'
import { browserAddress, browserDestination, clampBrowserBounds, externalProtocolUrl } from './policy'

/**
 * One persistent partition shared by every Project (TOOLS-Q10, user decision 2026-10-26): logins and cookies survive a
 * restart and are visible to every Project's page. Cookies are encrypted at rest by the `enableCookieEncryption` fuse.
 */
export const BROWSER_PARTITION = 'persist:studio-browser'

/** Chromium's zoom steps, in percent. */
export const BROWSER_ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500] as const

export interface BrowserServiceOptions {
  requireProject(projectId: string): void
  /** Blocks creation/navigation during Project close or application quit. */
  canOperate(projectId: string): boolean
  isProjectVisible(projectId: string): boolean
  findWindow(senderId: number): BrowserWindow | null
  createView(partition: string): WebContentsView
  /** Address saved by versions without tabs; read when no tab list is saved. */
  readAddress(projectId: string): string | undefined
  /** The current tab's address (kept for older versions). */
  saveAddress(projectId: string, address: string): void
  /** The Project's tab list, JSON `{ urls, active }`. */
  readTabs?(projectId: string): string | undefined
  saveTabs?(projectId: string, value: string): void
  /** History, favorites and permission decisions, shared by every Project. */
  storage?: BrowserDataStorage
  changed(state: BrowserState): void
  openExternal(url: string): Promise<void>
  /** A shortcut typed inside the page (⌘L) asks the renderer to focus the address bar. */
  focusAddress?(event: BrowserFocusAddress): void
  /** Default folder offered by the download save dialog. */
  downloadsPath?(): string
  newId?: () => string
}

type TabState = Omit<BrowserState, 'revision' | 'tabs' | 'favorite' | 'permissionRequest'>

interface PendingPermission { id: string; origin: string; permission: string; tab: Tab; answer(allow: boolean): void }

interface ProjectBrowser {
  projectId: string
  owner: BrowserWindow
  senderId: number
  tabs: Tab[]
  active: Tab
  /** Counts every change of this Project's Browser; the renderer keeps the newest snapshot. */
  revision: number
  bounds: BrowserBounds
  requestedVisible: boolean
  closing: boolean
  permissions: PendingPermission[]
  removeWindowListeners(): void
}

interface Tab {
  project: ProjectBrowser
  state: TabState
  view: WebContentsView
  /** Remains accessible when the webContents has already been destroyed. */
  session: Session
  attached: boolean
  closing: boolean
  navigation: number
  /** A cancelled provisional load must not replace the still committed page. */
  committed: { address: string; title: string } | null
  pendingLoad: string | null
  /** A restored background tab loads its address when it is first shown. */
  restore: string | null
}

/**
 * Removes the Electron and application tokens from the default user agent. Sites that refuse "embedded browsers"
 * (some sign-in pages) look for them; the page still runs without Node, Preload or app IPC.
 */
export function chromeUserAgent(userAgent: string): string {
  return userAgent.replace(/\s(?!AppleWebKit\/|Chrome\/|Safari\/|Mobile\/)[\w.-]+\/[\w.+-]+/g, '').replace(/\s{2,}/g, ' ').trim()
}

const nextZoom = (current: number, zoom: BrowserZoom): number => {
  if (zoom === 'reset') return 100
  const steps = BROWSER_ZOOM_STEPS as readonly number[]
  if (zoom === 'in') return steps.find(step => step > current + 0.5) ?? steps.at(-1)!
  return [...steps].reverse().find(step => step < current - 0.5) ?? steps[0]!
}

function memoryStorage(): BrowserDataStorage {
  const values = new Map<string, string>()
  return { read: key => values.get(key), write: (key, value) => { values.set(key, value) } }
}

/** Project Browsers with tabs. Native views and load state survive renderer panel unmounts; browsing data is shared. */
export class BrowserService {
  private readonly projects = new Map<string, ProjectBrowser>()
  private readonly preparedSessions = new WeakSet<Session>()
  private readonly data: BrowserData
  private overlayBlocked = false
  private disposed = false

  constructor(private readonly options: BrowserServiceOptions) {
    this.data = new BrowserData(options.storage ?? memoryStorage())
  }

  private id(): string { return this.options.newId?.() ?? randomUUID() }

  private snapshot(project: ProjectBrowser): BrowserState {
    const tab = project.active
    const request = project.permissions[0]
    return {
      ...tab.state,
      externalRequest: tab.state.externalRequest ? { ...tab.state.externalRequest } : null,
      revision: project.revision,
      tabs: project.tabs.map(item => ({ generation: item.state.generation, title: item.state.title, address: item.state.address, status: item.state.status })),
      favorite: this.data.isFavorite(tab.state.address),
      permissionRequest: request ? { id: request.id, origin: request.origin, permission: request.permission } : null
    }
  }
  /** Any change of any tab publishes the Project's current tab with the tab strip. */
  private changed(tab: Tab): void {
    const project = tab.project
    if (tab.closing || project.closing || this.projects.get(project.projectId) !== project || !project.tabs.includes(tab)) return
    project.revision++
    this.options.changed(this.snapshot(project))
  }
  private requireOperation(projectId: string): void {
    if (this.disposed || !this.options.canOperate(projectId)) throw new Error('Project 正在关闭，无法操作预览')
  }
  private project(projectId: string, senderId: number): ProjectBrowser {
    this.options.requireProject(projectId)
    const project = this.projects.get(projectId)
    if (!project || project.closing) throw new Error('预览实例已失效，请重新打开 Browser')
    if (project.senderId !== senderId) throw new Error('Browser belongs to another application window')
    return project
  }
  private tab(ref: BrowserRef, senderId: number): Tab {
    this.options.requireProject(ref.projectId)
    const project = this.projects.get(ref.projectId)
    const tab = project?.tabs.find(item => item.state.generation === ref.generation)
    if (!project || !tab || tab.closing || project.closing) throw new Error('预览实例已失效，请重新打开 Browser')
    if (project.senderId !== senderId) throw new Error('Browser belongs to another application window')
    return tab
  }
  private live(tab: Tab): WebContents {
    const contents = tab.view.webContents
    if (contents.isDestroyed()) throw new Error('网页进程已关闭，请刷新或重新打开 Project')
    return contents
  }
  private tabOf(contents: WebContents): Tab | undefined {
    for (const project of this.projects.values()) for (const tab of project.tabs) if (tab.view.webContents === contents) return tab
    return undefined
  }
  private saveTabs(project: ProjectBrowser): void {
    const urls = project.tabs.map(tab => tab.state.address)
    this.options.saveTabs?.(project.projectId, JSON.stringify({ urls, active: project.tabs.indexOf(project.active) }))
    this.options.saveAddress(project.projectId, project.active.state.address)
  }
  private savedTabs(projectId: string): { urls: string[]; active: number } {
    try {
      const value = JSON.parse(this.options.readTabs?.(projectId) ?? 'null') as { urls?: unknown; active?: unknown } | null
      if (value && Array.isArray(value.urls)) {
        const urls = value.urls.filter((url): url is string => typeof url === 'string').slice(0, BROWSER_TAB_LIMIT)
        if (urls.length) return { urls, active: typeof value.active === 'number' ? Math.max(0, Math.min(urls.length - 1, value.active)) : 0 }
      }
    } catch { /* fall back to the single saved address */ }
    const address = this.options.readAddress(projectId)
    return { urls: [address ?? ''], active: 0 }
  }

  private createTab(project: ProjectBrowser, after?: Tab): Tab {
    const view = this.options.createView(BROWSER_PARTITION)
    view.setVisible(false)
    const tab: Tab = {
      project,
      state: {
        projectId: project.projectId, generation: this.id(), address: '', title: '', status: 'idle', error: null, visible: false, externalRequest: null,
        canGoBack: false, canGoForward: false, devTools: false, zoom: 100, notice: null
      },
      view, session: view.webContents.session, attached: false, closing: false, navigation: 0, committed: null, pendingLoad: null, restore: null
    }
    const index = after ? project.tabs.indexOf(after) + 1 : project.tabs.length
    project.tabs.splice(index, 0, tab)
    this.prepareSession(tab.session)
    this.installGuards(tab)
    return tab
  }

  getState(projectId: string, senderId: number): BrowserState {
    this.options.requireProject(projectId)
    const existing = this.projects.get(projectId)
    if (existing) return this.snapshot(this.project(projectId, senderId))
    this.requireOperation(projectId)
    const owner = this.options.findWindow(senderId)
    // Only the application's BrowserWindow renderer can own a preview.
    if (!owner || owner.isDestroyed() || owner.webContents.id !== senderId) throw new Error('Unknown application window')
    const project = {
      projectId, owner, senderId, tabs: [] as Tab[], revision: 0, bounds: { x: 0, y: 0, width: 0, height: 0 },
      requestedVisible: false, closing: false, permissions: [] as PendingPermission[], removeWindowListeners: () => {}
    } as unknown as ProjectBrowser
    this.projects.set(projectId, project)
    const saved = this.savedTabs(projectId)
    for (const url of saved.urls) {
      const tab = this.createTab(project)
      try { if (url) { tab.restore = browserDestination(url).url; tab.state.address = tab.restore } } catch { /* Invalid old state does not authorize a navigation. */ }
    }
    project.active = project.tabs[saved.active] ?? project.tabs[0]!
    const resize = () => this.sync(project)
    const hide = () => this.detachAll(project, false)
    const show = () => this.sync(project)
    const closed = () => { void this.close(projectId).catch(error => console.error('[browser] close failed', error)) }
    owner.on('resize', resize); owner.on('hide', hide); owner.on('show', show); owner.on('closed', closed)
    project.removeWindowListeners = () => {
      owner.off('resize', resize); owner.off('hide', hide); owner.off('show', show); owner.off('closed', closed)
    }
    this.restore(project.active)
    return this.snapshot(project)
  }
  /** A restored tab loads its saved address the first time it becomes the current one. */
  private restore(tab: Tab): void {
    if (!tab.restore) return
    const url = tab.restore
    tab.restore = null
    this.load(tab, url)
  }

  navigate(ref: BrowserRef, url: string, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    this.requireOperation(ref.projectId)
    tab.restore = null
    this.load(tab, browserAddress(url).url)
    return this.snapshot(tab.project)
  }
  reload(ref: BrowserRef, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    this.requireOperation(ref.projectId)
    if (!tab.state.address) return this.snapshot(tab.project)
    tab.restore = null
    this.load(tab, browserDestination(tab.state.address).url, true)
    return this.snapshot(tab.project)
  }
  stop(ref: BrowserRef, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    const contents = this.live(tab)
    if (tab.state.status === 'loading') contents.stop()
    return this.snapshot(tab.project)
  }
  goBack(ref: BrowserRef, senderId: number): BrowserState { return this.history(ref, senderId, 'back') }
  goForward(ref: BrowserRef, senderId: number): BrowserState { return this.history(ref, senderId, 'forward') }
  private history(ref: BrowserRef, senderId: number, direction: 'back' | 'forward'): BrowserState {
    const tab = this.tab(ref, senderId)
    this.requireOperation(ref.projectId)
    const history = this.live(tab).navigationHistory
    if (direction === 'back' ? history.canGoBack() : history.canGoForward()) {
      tab.state.externalRequest = null
      if (direction === 'back') history.goBack(); else history.goForward()
    }
    return this.snapshot(tab.project)
  }
  toggleDevTools(ref: BrowserRef, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    this.requireOperation(ref.projectId)
    const contents = this.live(tab)
    // Detached: a docked DevTools would share the native view's small bounds. It inspects this page only.
    if (contents.isDevToolsOpened()) contents.closeDevTools()
    else contents.openDevTools({ mode: 'detach', activate: true })
    return this.snapshot(tab.project)
  }
  zoom(ref: BrowserRef, zoom: BrowserZoom, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    this.applyZoom(tab, zoom)
    return this.snapshot(tab.project)
  }
  private applyZoom(tab: Tab, zoom: BrowserZoom): void {
    const contents = this.live(tab)
    const next = nextZoom(Math.round(contents.getZoomFactor() * 100), zoom)
    contents.setZoomFactor(next / 100)
    tab.state.zoom = next
    this.changed(tab)
  }
  async openInSystemBrowser(ref: BrowserRef, senderId: number): Promise<BrowserState> {
    const tab = this.tab(ref, senderId)
    if (!tab.state.address) throw new Error('当前没有打开的网页')
    // The saved address is revalidated; only http(s) ever reaches the system handler.
    await this.options.openExternal(browserDestination(tab.state.address).url)
    return this.snapshot(tab.project)
  }
  async clearData(ref: BrowserRef, senderId: number): Promise<BrowserState> {
    const tab = this.tab(ref, senderId)
    this.requireOperation(ref.projectId)
    await tab.session.clearStorageData()
    await tab.session.clearCache()
    await tab.session.clearAuthCache()
    for (const project of this.projects.values()) {
      project.active.state.notice = '已清除所有 Project 共享的浏览数据，刷新页面后生效'
      this.changed(project.active)
    }
    return this.snapshot(tab.project)
  }
  clearHistory(ref: BrowserRef, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    this.data.clearHistory()
    tab.state.notice = '已清除浏览历史'
    this.changed(tab)
    return this.snapshot(tab.project)
  }
  dismissNotice(ref: BrowserRef, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    if (tab.state.notice) { tab.state.notice = null; this.changed(tab) }
    return this.snapshot(tab.project)
  }

  // ---- tabs, favorites, suggestions, permissions -------------------------------------------------------------------

  newTab(projectId: string, url: string | undefined, senderId: number): BrowserState {
    const project = this.project(projectId, senderId)
    this.requireOperation(projectId)
    if (project.tabs.length >= BROWSER_TAB_LIMIT) throw new Error(`最多打开 ${BROWSER_TAB_LIMIT} 个 Browser 标签页`)
    const destination = url?.trim() ? browserAddress(url).url : null
    const tab = this.createTab(project, project.active)
    this.activate(project, tab)
    if (destination) this.load(tab, destination)
    else { this.saveTabs(project); this.changed(tab) }
    return this.snapshot(project)
  }
  selectTab(ref: BrowserRef, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    this.activate(tab.project, tab)
    this.restore(tab)
    this.saveTabs(tab.project)
    this.changed(tab)
    return this.snapshot(tab.project)
  }
  private activate(project: ProjectBrowser, tab: Tab): void {
    if (project.active === tab) return
    const previous = project.active
    project.active = tab
    if (previous) this.detach(previous, false)
    this.sync(project)
  }
  /** Closing the last tab leaves a new empty one: the tool always has a page to show. */
  closeTab(ref: BrowserRef, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    const project = tab.project
    const index = project.tabs.indexOf(tab)
    if (project.tabs.length === 1) this.createTab(project)
    const next = project.active === tab ? project.tabs[index + 1] ?? project.tabs[index - 1]! : project.active
    this.activate(project, next)
    this.disposeTab(tab)
    this.restore(next)
    this.saveTabs(project)
    this.changed(next)
    return this.snapshot(project)
  }
  private disposeTab(tab: Tab): void {
    const project = tab.project
    tab.closing = true
    this.detach(tab, false)
    for (const request of project.permissions.filter(item => item.tab === tab)) request.answer(false)
    project.permissions = project.permissions.filter(item => item.tab !== tab)
    project.tabs = project.tabs.filter(item => item !== tab)
    // Bypass beforeunload: pages must not veto closing their tab.
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close({ waitForBeforeUnload: false })
  }
  toggleFavorite(ref: BrowserRef, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    if (!tab.state.address) return this.snapshot(tab.project)
    this.data.toggleFavorite(tab.state.address, tab.state.title)
    this.changed(tab)
    return this.snapshot(tab.project)
  }
  suggest(query: string): BrowserSuggestion[] { return this.data.suggest(query) }
  answerPermission(ref: BrowserRef, requestId: string, allow: boolean, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    const project = tab.project
    const request = project.permissions.find(item => item.id === requestId)
    if (!request) throw new Error('权限请求已失效')
    project.permissions = project.permissions.filter(item => item !== request)
    this.data.remember(request.origin, request.permission, allow)
    request.answer(allow)
    this.sync(project); this.changed(project.active)
    return this.snapshot(project)
  }
  resetPermissions(ref: BrowserRef, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    this.data.resetPermissions()
    tab.state.notice = '已重置所有网站的权限，网站下次请求时会重新询问'
    this.changed(tab)
    return this.snapshot(tab.project)
  }

  // ---- layout ------------------------------------------------------------------------------------------------------

  setBounds(ref: BrowserRef, bounds: BrowserBounds, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    clampBrowserBounds(bounds, tab.project.owner.getContentSize())
    tab.project.bounds = { ...bounds }
    this.sync(tab.project)
    return this.snapshot(tab.project)
  }
  setVisible(ref: BrowserRef, visible: boolean, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    if (visible) this.requireOperation(ref.projectId)
    tab.project.requestedVisible = visible
    this.sync(tab.project)
    return this.snapshot(tab.project)
  }
  focus(ref: BrowserRef, senderId: number): void {
    const tab = this.tab(ref, senderId)
    if (tab.state.visible && !tab.view.webContents.isDestroyed()) tab.view.webContents.focus()
  }
  async openExternal(ref: BrowserExternalRef, senderId: number): Promise<BrowserState> {
    const tab = this.tab(ref, senderId)
    this.requireOperation(ref.projectId)
    const request = tab.state.externalRequest
    if (!request || request.id !== ref.requestId) throw new Error('外部跳转请求已失效')
    const url = externalProtocolUrl(request.url)
    if (!url) throw new Error('Expected a mailto: or tel: link')
    // Consume the exact pending request before awaiting the OS, preventing replay.
    tab.state.externalRequest = null
    try {
      await this.options.openExternal(url)
    } catch (error) {
      if (!tab.closing) { tab.state.error = `系统应用打开失败：${error instanceof Error ? error.message : String(error)}`; this.changed(tab) }
    }
    if (!tab.closing && this.projects.get(ref.projectId) === tab.project) { this.sync(tab.project); this.changed(tab) }
    return this.snapshot(tab.project)
  }
  dismissExternal(ref: BrowserExternalRef, senderId: number): BrowserState {
    const tab = this.tab(ref, senderId)
    if (!tab.state.externalRequest || tab.state.externalRequest.id !== ref.requestId) throw new Error('外部跳转请求已失效')
    tab.state.externalRequest = null
    this.sync(tab.project); this.changed(tab)
    return this.snapshot(tab.project)
  }

  private load(tab: Tab, url: string, refresh = false): void {
    if (tab.view.webContents.isDestroyed()) throw new Error('预览进程已关闭，请重新打开 Project')
    const sequence = ++tab.navigation
    tab.pendingLoad = url
    tab.state.address = url
    tab.state.status = 'loading'; tab.state.error = null; tab.state.externalRequest = null
    this.saveTabs(tab.project)
    this.sync(tab.project); this.changed(tab)
    const contents = tab.view.webContents
    const loading = refresh ? contents.loadURL(url, { extraHeaders: 'pragma: no-cache\n' }) : contents.loadURL(url)
    void loading.catch(error => {
      if (tab.closing || this.projects.get(tab.project.projectId) !== tab.project || sequence !== tab.navigation) return
      if ((error as { code?: string }).code === 'ERR_ABORTED') return
      tab.pendingLoad = null
      tab.state.status = 'failed'
      tab.state.error = `无法加载网页：${error instanceof Error ? error.message : String(error)}`
      this.changed(tab)
    })
  }

  private requestExternal(tab: Tab, url: string, source: BrowserExternalRequest['source']): void {
    // will-frame-navigate and will-navigate can refer to the same request.
    if (tab.state.externalRequest?.url === url) return
    tab.state.externalRequest = { id: this.id(), url, source }
    this.detach(tab, true); this.changed(tab)
  }

  private refreshHistory(tab: Tab): void {
    const contents = tab.view.webContents
    if (contents.isDestroyed()) return
    const history = contents.navigationHistory
    tab.state.canGoBack = history?.canGoBack() ?? false
    tab.state.canGoForward = history?.canGoForward() ?? false
  }

  /** Session-wide handlers are installed once: every Project's tabs share the partition. */
  private prepareSession(session: Session): void {
    if (this.preparedSessions.has(session)) return
    this.preparedSessions.add(session)
    // Per-site prompts (VS Code): the answer is remembered for the site; unknown permissions stay denied.
    session.setPermissionRequestHandler((contents, permission, callback, details) => {
      if (ALLOWED_PERMISSIONS.has(permission)) { callback(true); return }
      const tab = contents ? this.tabOf(contents) : undefined
      let origin: string
      try { origin = new URL(details?.requestingUrl ?? '').origin } catch { callback(false); return }
      if (!tab || tab.closing || !/^https?:/.test(origin) || !(PROMPTED_PERMISSIONS as readonly string[]).includes(permission)) { callback(false); return }
      const remembered = this.data.decision(origin, permission)
      if (remembered !== undefined) { callback(remembered); return }
      let answered = false
      const answer = (allow: boolean) => { if (!answered) { answered = true; callback(allow) } }
      tab.project.permissions.push({ id: this.id(), origin, permission, tab, answer })
      // The prompt is drawn in the panel, where the page would cover it.
      this.sync(tab.project)
      this.changed(tab.project.active)
    })
    session.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
      if (ALLOWED_PERMISSIONS.has(permission)) return true
      try { return this.data.decision(new URL(requestingOrigin).origin, permission) === true } catch { return false }
    })
    // USB / HID / serial / Bluetooth device choosers are not offered.
    session.setDevicePermissionHandler(() => false)
    if (typeof session.getUserAgent === 'function') session.setUserAgent(chromeUserAgent(session.getUserAgent()))
    session.on('will-download', (event: ElectronEvent, item: DownloadItem, contents: WebContents) => {
      const tab = contents ? this.tabOf(contents) : undefined
      if (!tab || tab.closing || this.disposed) { event.preventDefault(); return }
      // No save path: Electron asks where to save with the native dialog; cancelling there cancels the download.
      const folder = this.options.downloadsPath?.()
      if (folder) item.setSaveDialogOptions({ title: '保存下载文件', defaultPath: join(folder, basename(item.getFilename())) })
      tab.state.notice = `正在下载：${item.getFilename()}`
      this.changed(tab)
      item.once('done', (_event, state) => {
        if (tab.closing) return
        tab.state.notice = state === 'completed' ? `已下载：${basename(item.getSavePath())}` : state === 'cancelled' ? null : `下载失败：${item.getFilename()}`
        this.changed(tab)
      })
    })
  }

  /** Browser-style shortcuts while the page itself has keyboard focus (the app renderer never sees these keys). */
  private onPageKey(tab: Tab, event: ElectronEvent, input: Input): void {
    if (input.type !== 'keyDown' || !(input.meta || input.control) || tab.closing) return
    const key = input.key.toLowerCase()
    const plain = !input.shift && !input.alt
    const owner = tab.project.owner
    let handled = true
    if (plain && key === 'r') { if (tab.state.address) this.load(tab, browserDestination(tab.state.address).url, true) }
    else if (plain && key === '[') { if (tab.state.canGoBack) this.live(tab).navigationHistory.goBack() }
    else if (plain && key === ']') { if (tab.state.canGoForward) this.live(tab).navigationHistory.goForward() }
    else if (plain && key === 'l') {
      if (!owner.isDestroyed() && !owner.webContents.isDestroyed()) owner.webContents.focus()
      this.options.focusAddress?.({ projectId: tab.state.projectId, generation: tab.state.generation })
    } else if (!input.alt && (key === '=' || key === '+')) this.applyZoom(tab, 'in')
    else if (plain && key === '-') this.applyZoom(tab, 'out')
    else if (plain && key === '0') this.applyZoom(tab, 'reset')
    else if (input.alt && !input.shift && (key === 'i' || input.code === 'KeyI')) {
      const contents = this.live(tab)
      if (contents.isDevToolsOpened()) contents.closeDevTools(); else contents.openDevTools({ mode: 'detach', activate: true })
    } else handled = false
    if (handled) event.preventDefault()
  }

  private installGuards(tab: Tab): void {
    const contents = tab.view.webContents
    /** Main-frame navigation: any http(s) page; mailto:/tel: asks first; everything else is refused. */
    const guard = (event: { preventDefault(): void }, url: string, source: BrowserExternalRequest['source']) => {
      try { browserDestination(url); return } catch { /* not a web page */ }
      event.preventDefault()
      const external = externalProtocolUrl(url)
      if (external) { this.requestExternal(tab, external, source); return }
      tab.state.error = '已阻止非 HTTP / HTTPS 或无效地址的跳转'
      this.changed(tab)
    }
    contents.on('will-navigate', event => guard(event, event.url, 'navigation'))
    contents.on('will-frame-navigate', event => { if (event.isMainFrame) guard(event, event.url, 'navigation') })
    contents.on('will-redirect', event => { if (event.isMainFrame) guard(event, event.url, 'redirect') })
    contents.setWindowOpenHandler(({ url }) => {
      if (tab.closing || this.disposed) return { action: 'deny' }
      try {
        // Popups become tabs, as in VS Code's browser; at the tab limit the link opens in this tab.
        const destination = browserDestination(url).url
        const project = tab.project
        if (project.tabs.length < BROWSER_TAB_LIMIT) {
          const opened = this.createTab(project, tab)
          this.activate(project, opened)
          this.load(opened, destination)
        } else this.load(tab, destination)
      } catch {
        const external = externalProtocolUrl(url)
        if (external) this.requestExternal(tab, external, 'window')
        else { tab.state.error = '已阻止非 HTTP / HTTPS 或无效地址的新窗口'; this.changed(tab) }
      }
      return { action: 'deny' }
    })
    contents.on('will-attach-webview', event => event.preventDefault())
    contents.on('before-input-event', (event, input) => {
      try { this.onPageKey(tab, event, input) } catch (error) {
        tab.state.error = error instanceof Error ? error.message : String(error); this.changed(tab)
      }
    })
    contents.on('devtools-opened', () => { tab.state.devTools = true; this.changed(tab) })
    contents.on('devtools-closed', () => { tab.state.devTools = false; this.changed(tab) })
    contents.on('zoom-changed', (_event, direction) => { try { this.applyZoom(tab, direction === 'in' ? 'in' : 'out') } catch { /* destroyed */ } })
    contents.on('did-start-navigation', event => {
      if (!event.isMainFrame || event.isSameDocument || tab.closing || this.disposed) return
      try {
        tab.pendingLoad = browserDestination(event.url).url
        tab.state.status = 'loading'; tab.state.error = null; this.changed(tab)
      } catch { /* Guarded top-level URLs never become application addresses. */ }
    })
    const navigated = (url: string, sameDocument = false) => {
      if (tab.closing || this.disposed) return
      try {
        const destination = browserDestination(url)
        tab.state.address = destination.url
        if (sameDocument && tab.committed) tab.committed.address = destination.url
        this.refreshHistory(tab)
        this.saveTabs(tab.project)
        this.changed(tab)
      } catch { /* Ignore the initial empty document. */ }
    }
    contents.on('did-navigate', (_event, url) => navigated(url))
    contents.on('did-navigate-in-page', (_event, url, mainFrame) => { if (mainFrame) navigated(url, true) })
    contents.on('did-finish-load', () => {
      if (tab.closing || contents.isDestroyed() || tab.state.externalRequest || !tab.pendingLoad) return
      try {
        const destination = browserDestination(contents.getURL())
        tab.pendingLoad = null
        tab.state.address = destination.url
        tab.state.status = 'ready'; tab.state.error = null
        tab.state.title = contents.getTitle()
        tab.committed = { address: destination.url, title: tab.state.title }
        this.refreshHistory(tab)
        this.data.visit(destination.url, tab.state.title)
        this.saveTabs(tab.project)
        this.changed(tab)
      } catch { /* Empty initial documents aren't loaded previews. */ }
    })
    // Stop (or an aborted load) ends without did-finish-load: whatever is committed stays the shown page.
    contents.on('did-stop-loading', () => {
      if (tab.closing || contents.isDestroyed() || !tab.pendingLoad || tab.state.status !== 'loading') return
      tab.pendingLoad = null
      let shown: string | null = null
      try { shown = browserDestination(contents.getURL()).url } catch { /* nothing committed */ }
      tab.state.status = shown ? 'ready' : 'idle'
      if (shown) { tab.state.address = shown; tab.state.title = contents.getTitle() }
      this.refreshHistory(tab)
      this.changed(tab)
    })
    contents.on('page-title-updated', (_event, title) => {
      if (tab.closing) return
      tab.state.title = title
      if (!tab.pendingLoad && tab.committed) tab.committed.title = title
      if (tab.state.address) this.data.retitle(tab.state.address, title)
      this.changed(tab)
    })
    contents.on('did-fail-load', (_event, code, description, url, mainFrame) => {
      if (!mainFrame || code === -3 || tab.closing || tab.state.externalRequest || !tab.pendingLoad) return
      // An aborted older load must not replace a newer address's state.
      try { if (browserDestination(url).url !== tab.pendingLoad) return } catch { return }
      tab.pendingLoad = null
      tab.state.status = 'failed'; tab.state.error = `无法加载网页：${description} (${code})`
      this.refreshHistory(tab)
      this.changed(tab)
    })
    contents.on('render-process-gone', (_event, details) => {
      if (tab.closing) return
      tab.pendingLoad = null
      tab.state.status = 'crashed'; tab.state.error = `网页进程已退出（${details.reason}），可刷新重试`
      this.detach(tab, true); this.changed(tab)
    })
    contents.on('destroyed', () => {
      if (tab.closing) return
      tab.pendingLoad = null
      tab.state.status = 'crashed'; tab.state.error = '预览实例已关闭，请重新打开 Project'
      this.detach(tab, true); this.changed(tab)
    })
  }

  private detach(tab: Tab, returnFocus: boolean): void {
    const owner = tab.project.owner
    if (tab.attached && !owner.isDestroyed()) owner.contentView.removeChildView(tab.view)
    tab.attached = false
    tab.view.setVisible(false)
    if (tab.state.visible) {
      tab.state.visible = false
      if (returnFocus && !owner.isDestroyed() && !owner.webContents.isDestroyed()) owner.webContents.focus()
      this.changed(tab)
    }
  }
  private detachAll(project: ProjectBrowser, returnFocus: boolean): void { for (const tab of project.tabs) this.detach(tab, returnFocus) }
  /** Only the current tab is ever attached; a pending permission prompt or external request keeps the page hidden. */
  private sync(project: ProjectBrowser): void {
    for (const tab of project.tabs) if (tab !== project.active) this.detach(tab, false)
    const tab = project.active
    if (!tab) return
    const owner = project.owner
    const eligible = !this.disposed && !project.closing && !tab.closing && !this.overlayBlocked
      && project.requestedVisible && !tab.state.externalRequest && !project.permissions.length
      && this.options.canOperate(project.projectId) && this.options.isProjectVisible(project.projectId)
      && !owner.isDestroyed() && owner.isVisible() && !tab.view.webContents.isDestroyed()
      && tab.state.status !== 'crashed'
    if (!eligible) { this.detach(tab, true); return }
    const bounds = clampBrowserBounds(project.bounds, owner.getContentSize())
    if (bounds.width === 0 || bounds.height === 0) { this.detach(tab, true); return }
    tab.view.setBounds(bounds)
    if (!tab.attached) { owner.contentView.addChildView(tab.view); tab.attached = true }
    tab.view.setVisible(true)
    if (!tab.state.visible) { tab.state.visible = true; this.changed(tab) }
  }

  /** Called by trusted shell lifecycle hooks after active Project/tool changes. */
  syncVisibility(): void { for (const project of this.projects.values()) this.sync(project) }
  hideAll(): void { for (const project of this.projects.values()) { project.requestedVisible = false; this.detachAll(project, true) } }
  setOverlayBlocked(blocked: boolean): void { this.overlayBlocked = blocked; this.syncVisibility() }

  /** Closes the Project's tabs. The shared browsing data stays (TOOLS-Q10); clearing it is an explicit user action. */
  async close(projectId: string): Promise<void> {
    const project = this.projects.get(projectId)
    if (!project) return
    project.closing = true
    this.detachAll(project, false)
    project.removeWindowListeners()
    for (const request of project.permissions) request.answer(false)
    project.permissions = []
    const failures: unknown[] = []
    for (const tab of [...project.tabs]) {
      try {
        // Bypass beforeunload: pages must not veto the user's Project close.
        if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close({ waitForBeforeUnload: false })
        tab.closing = true
        project.tabs = project.tabs.filter(item => item !== tab)
      } catch (error) { failures.push(error) }
    }
    if (failures.length) {
      // Keep what could not be closed so the user can retry; the first remaining tab shows the failure.
      project.closing = false
      const error = failures[0]
      project.active = project.tabs[0]!
      project.active.state.status = 'failed'; project.active.state.error = `预览关闭失败：${error instanceof Error ? error.message : String(error)}`
      this.changed(project.active)
      throw error
    }
    this.projects.delete(projectId)
  }
  /** Reusable during quit confirmation; a failed attempt does not poison the service. */
  async closeAll(): Promise<void> {
    const results = await Promise.allSettled([...this.projects.keys()].map(id => this.close(id)))
    const failures = results.filter(result => result.status === 'rejected')
    if (failures.length) throw new AggregateError(failures.map(result => (result as PromiseRejectedResult).reason), 'Browser cleanup failed')
  }
  async dispose(): Promise<void> {
    this.disposed = true
    await this.closeAll()
  }
}
