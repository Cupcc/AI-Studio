import { EventEmitter } from 'node:events'
import type { BrowserWindow, WebContentsView } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { BrowserFocusAddress, BrowserState } from '@shared/tools/browser'
import { BROWSER_PARTITION, BrowserService, chromeUserAgent } from './browser-service'
import { browserAddress, browserDestination, clampBrowserBounds, externalProtocolUrl, isLocalHost } from './policy'

class FakeSession extends EventEmitter {
  setPermissionRequestHandler = vi.fn()
  setPermissionCheckHandler = vi.fn()
  setDevicePermissionHandler = vi.fn()
  clearStorageData = vi.fn(async () => {})
  clearCache = vi.fn(async () => {})
  clearAuthCache = vi.fn(async () => {})
  getUserAgent = () => 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) ai-studio/1.0.0 Chrome/140.0.0.0 Electron/44.4.5 Safari/537.36'
  setUserAgent = vi.fn()
}
class FakeContents extends EventEmitter {
  id = 12
  destroyed = false
  url = ''
  back = false
  forward = false
  devTools = false
  zoomFactor = 1
  constructor(public session = new FakeSession()) { super() }
  isDestroyed = () => this.destroyed
  getURL = () => this.url
  getTitle = () => 'Preview'
  focus = vi.fn()
  stop = vi.fn()
  loadURL = vi.fn(async (url: string, _options?: unknown) => { this.url = url })
  navigationHistory = { canGoBack: () => this.back, canGoForward: () => this.forward, goBack: vi.fn(), goForward: vi.fn() }
  isDevToolsOpened = () => this.devTools
  openDevTools = vi.fn(() => { this.devTools = true; this.emit('devtools-opened') })
  closeDevTools = vi.fn(() => { this.devTools = false; this.emit('devtools-closed') })
  getZoomFactor = () => this.zoomFactor
  setZoomFactor = vi.fn((factor: number) => { this.zoomFactor = factor })
  windowOpen?: (input: { url: string }) => { action: string }
  setWindowOpenHandler = (handler: typeof this.windowOpen) => { this.windowOpen = handler }
  close = vi.fn((_options: unknown) => { this.destroyed = true; this.emit('destroyed') })
}
class FakeView {
  webContents: FakeContents
  setVisible = vi.fn()
  setBounds = vi.fn()
  constructor(session: FakeSession) { this.webContents = new FakeContents(session) }
}
class FakeWindow extends EventEmitter {
  webContents = new FakeContents()
  contentView = { addChildView: vi.fn(), removeChildView: vi.fn() }
  visible = true
  destroyed = false
  size = [1000, 700]
  isDestroyed = () => this.destroyed
  isVisible = () => this.visible
  getContentSize = () => this.size
}
class FakeDownload extends EventEmitter {
  setSaveDialogOptions = vi.fn()
  getFilename = () => 'report.pdf'
  getSavePath = () => '/Users/test/Downloads/report.pdf'
}
function setup(address?: string, tabs?: string) {
  const window = new FakeWindow()
  // Every view uses the same partition, so Electron hands out the same Session object.
  const session = new FakeSession()
  const views: FakeView[] = []
  const partitions: string[] = []
  const events: BrowserState[] = []
  const focusRequests: BrowserFocusAddress[] = []
  const addresses = new Map<string, string>(address ? [['p1', address]] : [])
  const savedTabs = new Map<string, string>(tabs ? [['p1', tabs]] : [])
  const meta = new Map<string, string>()
  const openExternal = vi.fn(async (_url: string) => {})
  let activeProject = 'p1'
  let canOperate = true
  let sequence = 0
  const service = new BrowserService({
    requireProject: id => { if (!['p1', 'p2'].includes(id)) throw new Error('Unknown Project') },
    canOperate: () => canOperate,
    isProjectVisible: id => id === activeProject,
    findWindow: sender => sender === window.webContents.id ? window as unknown as BrowserWindow : null,
    createView: partition => { const view = new FakeView(session); views.push(view); partitions.push(partition); return view as unknown as WebContentsView },
    readAddress: id => addresses.get(id),
    saveAddress: (id, value) => { addresses.set(id, value) },
    readTabs: id => savedTabs.get(id),
    saveTabs: (id, value) => { savedTabs.set(id, value) },
    storage: { read: key => meta.get(key), write: (key, value) => { meta.set(key, value) } },
    changed: state => { events.push(state) },
    focusAddress: event => { focusRequests.push(event) },
    downloadsPath: () => '/Users/test/Downloads',
    openExternal,
    newId: () => `generation-${++sequence}`
  })
  const state = service.getState('p1', 12)
  return { service, state, window, session, views, partitions, events, focusRequests, addresses, savedTabs, meta, openExternal,
    activate: (id: string) => { activeProject = id; service.syncVisibility() },
    closing: () => { canOperate = false; service.syncVisibility() }
  }
}
function event(url: string, isMainFrame = true) { return { url, isMainFrame, preventDefault: vi.fn() } }
function key(input: Partial<{ key: string; code: string; meta: boolean; shift: boolean; alt: boolean; control: boolean }>) {
  return [{ preventDefault: vi.fn() }, { type: 'keyDown', key: '', code: '', meta: true, shift: false, alt: false, control: false, ...input }] as const
}

describe('Browser address policy', () => {
  it.each([
    ['http://localhost:3000/', true], ['https://LOCALHOST:443/', true], ['http://127.90.20.1:4000/', true], ['http://[0:0:0:0:0:0:0:1]/', true],
    ['http://0x7f000001/', true], ['http://192.168.1.20:5173/', true], ['http://10.0.0.2/', true], ['http://myapp.test/', true],
    ['https://example.com/path', false], ['https://localhost.example/', false], ['http://[::ffff:127.0.0.1]/', false]
  ])('accepts every http(s) page %s and classifies it (local: %s)', (url, local) => {
    expect(browserDestination(url).local).toBe(local)
  })
  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hello', 'app://studio/', 'mailto:a@b.c', 'http://user:secret@example.com/', 'http://local\nhost/', 'http://localhost:99999/', ''])('rejects non-web or unsafe URL %s', url => {
    expect(() => browserDestination(url)).toThrow()
  })
  it.each([
    ['localhost:3000/a', 'http://localhost:3000/a'],
    ['127.0.0.1:8080', 'http://127.0.0.1:8080/'],
    ['192.168.1.5:3000', 'http://192.168.1.5:3000/'],
    ['0.0.0.0:5173', 'http://0.0.0.0:5173/'],
    ['devbox:8080', 'http://devbox:8080/'],
    ['shop.local', 'http://shop.local/'],
    ['example.com', 'https://example.com/'],
    ['github.com/openai/codex?tab=readme', 'https://github.com/openai/codex?tab=readme'],
    ['  https://example.com/x  ', 'https://example.com/x'],
    ['http://example.com', 'http://example.com/']
  ])('completes the typed address %s like VS Code', (typed, url) => {
    expect(browserAddress(typed).url).toBe(url)
  })
  it.each(['hello', 'hello world', 'javascript:alert(1)', 'file:///etc/passwd', 'mailto:a@b.c', 'about:blank'])('does not turn %s into a navigation', typed => {
    expect(() => browserAddress(typed)).toThrow()
  })
  it('recognises local hosts, external protocols, user agents and clips bounds', () => {
    expect(isLocalHost('172.20.1.1')).toBe(true)
    expect(isLocalHost('172.32.1.1')).toBe(false)
    expect(isLocalHost('api.localhost')).toBe(true)
    expect(externalProtocolUrl('mailto:dev@example.com')).toBe('mailto:dev@example.com')
    expect(externalProtocolUrl('vscode://file/etc/passwd')).toBeNull()
    expect(chromeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ai-studio/1.0.0 Chrome/140.0.0.0 Electron/44.4.5 Safari/537.36'))
      .toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')
    expect(clampBrowserBounds({ x: -10.5, y: 680, width: 200, height: 300 }, [1000, 700])).toEqual({ x: 0, y: 680, width: 189, height: 20 })
    expect(() => clampBrowserBounds({ x: NaN, y: 0, width: 10, height: 10 }, [1000, 700])).toThrow()
  })
})

describe('Project Browser service', () => {
  it('shares one persistent partition across Projects, prepares the session once and restores any saved web address', () => {
    const fixture = setup('https://example.com/restored')
    const second = fixture.service.getState('p2', 12)
    expect(fixture.service.getState('p1', 12).generation).toBe(fixture.state.generation)
    expect(second.generation).not.toBe(fixture.state.generation)
    expect(fixture.partitions).toEqual([BROWSER_PARTITION, BROWSER_PARTITION])
    expect(fixture.session.setPermissionRequestHandler).toHaveBeenCalledOnce()
    expect(fixture.session.listenerCount('will-download')).toBe(1)
    expect(fixture.session.setUserAgent).toHaveBeenCalledOnce()
    expect(fixture.views[0]!.webContents.loadURL).toHaveBeenCalledWith('https://example.com/restored')
    const invalid = setup('file:///etc/passwd')
    expect(invalid.views[0]!.webContents.loadURL).not.toHaveBeenCalled()
    expect(invalid.state.address).toBe('')
  })

  it('rejects unknown Projects, foreign window ownership and stale generations', async () => {
    const { service, state } = setup()
    expect(() => service.getState('missing', 12)).toThrow('Unknown Project')
    expect(() => service.getState('p1', 99)).toThrow('another application window')
    expect(() => service.navigate({ ...state, generation: 'old' }, 'http://localhost/', 12)).toThrow('失效')
    await service.close('p1')
    const reopened = service.getState('p1', 12)
    expect(reopened.generation).not.toBe(state.generation)
    expect(() => service.reload(state, 12)).toThrow('失效')
  })

  it('retains the loaded view across hides, clamps resize, removes it for Project/tool switch and overlay', () => {
    const { service, state, window, views, activate } = setup()
    const view = views[0]!
    service.setBounds(state, { x: 600, y: 100, width: 600, height: 800 }, 12)
    expect(service.setVisible(state, true, 12).visible).toBe(true)
    expect(view.setBounds).toHaveBeenLastCalledWith({ x: 600, y: 100, width: 400, height: 600 })
    service.setOverlayBlocked(true)
    expect(window.contentView.removeChildView).toHaveBeenCalledWith(view)
    expect(service.getState('p1', 12).visible).toBe(false)
    expect(window.webContents.focus).toHaveBeenCalled()
    service.setOverlayBlocked(false)
    expect(service.getState('p1', 12).visible).toBe(true)
    activate('p2')
    expect(service.getState('p1', 12).visible).toBe(false)
    activate('p1')
    window.size = [700, 200]; window.emit('resize')
    expect(view.setBounds).toHaveBeenLastCalledWith({ x: 600, y: 100, width: 100, height: 100 })
    window.visible = false; window.emit('hide')
    expect(service.getState('p1', 12).visible).toBe(false)
    expect(view.webContents.close).not.toHaveBeenCalled()
    window.visible = true; window.emit('show')
    expect(service.getState('p1', 12).visible).toBe(true)
    service.setVisible(state, false, 12)
    expect(view.webContents.close).not.toHaveBeenCalled()
  })

  it.each(['will-navigate', 'will-frame-navigate', 'will-redirect'])('lets %s reach any web page, asks before mailto: and refuses other schemes', async type => {
    const { service, state, views, openExternal } = setup()
    const contents = views[0]!.webContents
    for (const url of ['http://127.0.0.1:3000/', 'https://example.com/path']) {
      const web = event(url)
      contents.emit(type, web)
      expect(web.preventDefault).not.toHaveBeenCalled()
    }
    const mail = event('mailto:dev@example.com')
    contents.emit(type, mail)
    expect(mail.preventDefault).toHaveBeenCalledOnce()
    const request = service.getState('p1', 12).externalRequest!
    expect(request.url).toBe('mailto:dev@example.com')
    await service.openExternal({ ...state, requestId: request.id }, 12)
    expect(openExternal).toHaveBeenCalledWith('mailto:dev@example.com')
    await expect(service.openExternal({ ...state, requestId: request.id }, 12)).rejects.toThrow('失效')
    const unsafe = event('vscode://file/etc/passwd')
    contents.emit(type, unsafe)
    expect(unsafe.preventDefault).toHaveBeenCalled()
    expect(service.getState('p1', 12)).toMatchObject({ externalRequest: null, error: expect.stringContaining('已阻止') })
  })

  it('opens new-window links as a new tab after the current one, and asks before mailto: windows', () => {
    const { service, state, views, openExternal } = setup()
    const contents = views[0]!.webContents
    const resource = event('https://example.com/widget', false)
    contents.emit('will-frame-navigate', resource)
    expect(resource.preventDefault).not.toHaveBeenCalled()
    expect(contents.windowOpen!({ url: 'https://example.com/docs' })).toEqual({ action: 'deny' })
    expect(views).toHaveLength(2)
    expect(views[1]!.webContents.loadURL).toHaveBeenLastCalledWith('https://example.com/docs')
    const shown = service.getState('p1', 12)
    expect(shown.generation).not.toBe(state.generation)
    expect(shown.tabs.map(tab => tab.address)).toEqual(['', 'https://example.com/docs'])
    expect(contents.windowOpen!({ url: 'mailto:dev@example.com' })).toEqual({ action: 'deny' })
    const first = service.selectTab(state, 12)
    const request = first.externalRequest!
    expect(request.source).toBe('window')
    service.dismissExternal({ ...state, requestId: request.id }, 12)
    expect(openExternal).not.toHaveBeenCalled()
    expect(contents.windowOpen!({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
    expect(service.getState('p1', 12).error).toContain('新窗口')
  })

  it('denies permissions and device grants, and asks where to save downloads', () => {
    const { service, session, views } = setup()
    const request = session.setPermissionRequestHandler.mock.calls[0]![0] as (...args: unknown[]) => void
    const callback = vi.fn()
    request(null, 'media', callback, {})
    expect(callback).toHaveBeenCalledWith(false)
    expect((session.setPermissionCheckHandler.mock.calls[0]![0] as () => boolean)()).toBe(false)
    expect((session.setDevicePermissionHandler.mock.calls[0]![0] as () => boolean)()).toBe(false)
    const download = new FakeDownload()
    const start = event('https://example.com/report.pdf')
    session.emit('will-download', start, download, views[0]!.webContents)
    expect(start.preventDefault).not.toHaveBeenCalled()
    expect(download.setSaveDialogOptions).toHaveBeenCalledWith({ title: '保存下载文件', defaultPath: '/Users/test/Downloads/report.pdf' })
    expect(service.getState('p1', 12).notice).toBe('正在下载：report.pdf')
    download.emit('done', {}, 'completed')
    expect(service.getState('p1', 12).notice).toBe('已下载：report.pdf')
    // A download from a page this service does not own is refused.
    const foreign = event('https://example.com/x')
    session.emit('will-download', foreign, new FakeDownload(), new FakeContents())
    expect(foreign.preventDefault).toHaveBeenCalled()
  })

  it('persists canonical addresses, reports load failure and retries crashed renderers', () => {
    const { service, state, views, addresses, events } = setup()
    const contents = views[0]!.webContents
    expect(service.navigate(state, 'localhost:3000/a', 12).status).toBe('loading')
    expect(addresses.get('p1')).toBe('http://localhost:3000/a')
    contents.emit('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', 'http://localhost:3000/a', true)
    expect(service.getState('p1', 12)).toMatchObject({ status: 'failed', error: expect.stringContaining('ERR_CONNECTION_REFUSED') })
    service.reload(state, 12)
    contents.emit('did-finish-load')
    expect(service.getState('p1', 12)).toMatchObject({ status: 'ready', title: 'Preview', error: null })
    contents.emit('render-process-gone', {}, { reason: 'crashed' })
    expect(service.getState('p1', 12).status).toBe('crashed')
    service.reload(state, 12)
    contents.emit('did-finish-load')
    expect(service.getState('p1', 12).status).toBe('ready')
    expect(service.navigate(state, 'example.com', 12).address).toBe('https://example.com/')
    expect(() => service.navigate(state, 'hello', 12)).toThrow('有效的网址')
    expect(events.every((event, index) => index === 0 || event.revision > events[index - 1]!.revision)).toBe(true)
  })

  it('does not let an old asynchronous load failure overwrite a newer address', async () => {
    const { service, state, views } = setup()
    let rejectOld!: (error: Error) => void
    views[0]!.webContents.loadURL.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectOld = reject }))
    service.navigate(state, 'http://localhost/old', 12)
    service.navigate(state, 'http://localhost/new', 12)
    rejectOld(new Error('old failure'))
    await Promise.resolve()
    views[0]!.webContents.emit('did-fail-load', {}, -102, 'old failure', 'http://localhost/old', true)
    expect(service.getState('p1', 12)).toMatchObject({ address: 'http://localhost/new', status: 'loading', error: null })
  })

  it('stops a load, keeping the committed page or returning to idle', () => {
    const { service, state, views } = setup()
    const contents = views[0]!.webContents
    service.navigate(state, 'https://example.com/slow', 12)
    service.stop(state, 12)
    expect(contents.stop).toHaveBeenCalledOnce()
    contents.url = ''
    contents.emit('did-stop-loading')
    expect(service.getState('p1', 12).status).toBe('idle')
    service.navigate(state, 'https://example.com/a', 12)
    contents.emit('did-finish-load')
    contents.emit('did-start-navigation', { url: 'https://example.com/b', isMainFrame: true, isSameDocument: false })
    expect(service.getState('p1', 12).status).toBe('loading')
    contents.emit('did-stop-loading')
    expect(service.getState('p1', 12)).toMatchObject({ status: 'ready', address: 'https://example.com/a' })
  })

  it('tracks history, DevTools and zoom, and goes back and forward through the native history', () => {
    const { service, state, views } = setup()
    const contents = views[0]!.webContents
    service.navigate(state, 'https://example.com/a', 12)
    contents.back = true
    contents.emit('did-navigate', {}, 'https://example.com/b')
    expect(service.getState('p1', 12)).toMatchObject({ canGoBack: true, canGoForward: false, address: 'https://example.com/b' })
    service.goBack(state, 12)
    expect(contents.navigationHistory.goBack).toHaveBeenCalledOnce()
    service.goForward(state, 12)
    expect(contents.navigationHistory.goForward).not.toHaveBeenCalled()
    expect(service.toggleDevTools(state, 12).devTools).toBe(true)
    expect(contents.openDevTools).toHaveBeenCalledWith({ mode: 'detach', activate: true })
    expect(service.toggleDevTools(state, 12).devTools).toBe(false)
    expect(service.zoom(state, 'in', 12).zoom).toBe(110)
    expect(service.zoom(state, 'in', 12).zoom).toBe(125)
    expect(service.zoom(state, 'out', 12).zoom).toBe(110)
    expect(service.zoom(state, 'reset', 12).zoom).toBe(100)
    expect(contents.setZoomFactor).toHaveBeenLastCalledWith(1)
  })

  it('handles browser shortcuts typed inside the page', () => {
    const { service, state, views, window, focusRequests } = setup()
    const contents = views[0]!.webContents
    service.navigate(state, 'https://example.com/', 12)
    const [focusEvent, focusInput] = key({ key: 'l' })
    contents.emit('before-input-event', focusEvent, focusInput)
    expect(focusEvent.preventDefault).toHaveBeenCalled()
    expect(window.webContents.focus).toHaveBeenCalled()
    expect(focusRequests).toEqual([{ projectId: 'p1', generation: state.generation }])
    contents.emit('before-input-event', ...key({ key: '=' }))
    expect(service.getState('p1', 12).zoom).toBe(110)
    const [reloadEvent, reloadInput] = key({ key: 'r' })
    contents.loadURL.mockClear()
    contents.emit('before-input-event', reloadEvent, reloadInput)
    expect(contents.loadURL).toHaveBeenCalledWith('https://example.com/', { extraHeaders: 'pragma: no-cache\n' })
    const [plainEvent, plainInput] = key({ key: 'a', meta: false })
    contents.emit('before-input-event', plainEvent, plainInput)
    expect(plainEvent.preventDefault).not.toHaveBeenCalled()
  })

  it('opens the current page in the system browser and clears the shared data on request only', async () => {
    const { service, state, session, openExternal } = setup()
    await expect(service.openInSystemBrowser(state, 12)).rejects.toThrow('没有打开的网页')
    service.navigate(state, 'example.com/x', 12)
    await service.openInSystemBrowser(state, 12)
    expect(openExternal).toHaveBeenCalledWith('https://example.com/x')
    service.getState('p2', 12)
    await service.close('p2')
    expect(session.clearStorageData).not.toHaveBeenCalled()
    const cleared = await service.clearData(state, 12)
    expect(session.clearStorageData).toHaveBeenCalledOnce()
    expect(session.clearCache).toHaveBeenCalledOnce()
    expect(cleared.notice).toContain('已清除')
    expect(service.dismissNotice(state, 12).notice).toBeNull()
  })

  it('blocks recreation and navigation during closing while permitting diagnostic reads and hides', async () => {
    const { service, state, closing, views, session } = setup()
    closing()
    expect(service.getState('p1', 12).generation).toBe(state.generation)
    expect(() => service.getState('p2', 12)).toThrow('正在关闭')
    expect(() => service.navigate(state, 'http://localhost/', 12)).toThrow('正在关闭')
    expect(() => service.reload(state, 12)).toThrow('正在关闭')
    expect(() => service.setVisible(state, false, 12)).not.toThrow()
    await service.close('p1')
    expect(views[0]!.webContents.close).toHaveBeenCalledWith({ waitForBeforeUnload: false })
    // The shared, persistent browsing data is not the Project's to delete.
    expect(session.clearStorageData).not.toHaveBeenCalled()
    expect(() => service.getState('p1', 12)).toThrow('正在关闭')
  })

  it('cleans only the exact Project view, preserves another Project and surfaces cleanup failure for retry', async () => {
    const { service, views } = setup()
    service.getState('p2', 12)
    views[0]!.webContents.close.mockImplementationOnce(() => { throw new Error('native failure') })
    await expect(service.close('p1')).rejects.toThrow('native failure')
    expect(service.getState('p1', 12)).toMatchObject({ status: 'failed', error: expect.stringContaining('native failure') })
    expect(views[1]!.webContents.close).not.toHaveBeenCalled()
    await service.close('p1')
    expect(views[1]!.webContents.close).not.toHaveBeenCalled()
    await service.dispose()
    expect(views[1]!.webContents.close).toHaveBeenCalledOnce()
  })

  it('keeps the service usable after a closeAll failure', async () => {
    const { service, views } = setup()
    views[0]!.webContents.close.mockImplementationOnce(() => { throw new Error('native failure') })
    await expect(service.closeAll()).rejects.toThrow('Browser cleanup failed')
    expect(service.getState('p1', 12).status).toBe('failed')
    expect(() => service.getState('p2', 12)).not.toThrow()
    await service.closeAll()
    expect(() => service.getState('p1', 12)).not.toThrow()
  })
})

describe('Browser tabs, history, favorites and site permissions (step 3)', () => {
  it('opens, switches and closes tabs; only the current tab is attached and closing the last leaves an empty one', () => {
    const { service, state, views, window, savedTabs } = setup()
    service.setBounds(state, { x: 0, y: 0, width: 400, height: 300 }, 12)
    service.setVisible(state, true, 12)
    service.navigate(state, 'localhost:3000', 12)
    const second = service.newTab('p1', 'example.com', 12)
    expect(second.tabs.map(tab => tab.address)).toEqual(['http://localhost:3000/', 'https://example.com/'])
    expect(window.contentView.removeChildView).toHaveBeenCalledWith(views[0])
    expect(window.contentView.addChildView).toHaveBeenLastCalledWith(views[1])
    expect(JSON.parse(savedTabs.get('p1')!)).toEqual({ urls: ['http://localhost:3000/', 'https://example.com/'], active: 1 })
    const back = service.selectTab(state, 12)
    expect(back.generation).toBe(state.generation)
    expect(window.contentView.addChildView).toHaveBeenLastCalledWith(views[0])
    const closed = service.closeTab(state, 12)
    expect(closed.generation).toBe(second.generation)
    expect(views[0]!.webContents.close).toHaveBeenCalledWith({ waitForBeforeUnload: false })
    expect(() => service.navigate(state, 'example.com', 12)).toThrow('失效')
    const last = service.closeTab(second, 12)
    expect(last.tabs).toHaveLength(1)
    expect(last).toMatchObject({ status: 'idle', address: '' })
  })

  it('restores the saved tabs, loading only the current one until another is shown', () => {
    const { service, views } = setup(undefined, JSON.stringify({ urls: ['https://a.example/', 'file:///etc/passwd', 'https://b.example/'], active: 2 }))
    const state = service.getState('p1', 12)
    expect(state.tabs.map(tab => tab.address)).toEqual(['https://a.example/', '', 'https://b.example/'])
    expect(views[2]!.webContents.loadURL).toHaveBeenCalledWith('https://b.example/')
    expect(views[0]!.webContents.loadURL).not.toHaveBeenCalled()
    service.selectTab({ projectId: 'p1', generation: state.tabs[0]!.generation }, 12)
    expect(views[0]!.webContents.loadURL).toHaveBeenCalledWith('https://a.example/')
    expect(views[1]!.webContents.loadURL).not.toHaveBeenCalled()
  })

  it('records visits, suggests favorites before history and clears history on request', () => {
    const { service, state, views } = setup()
    const contents = views[0]!.webContents
    service.navigate(state, 'https://docs.example/guide', 12)
    contents.emit('did-finish-load')
    service.navigate(state, 'https://example.com/', 12)
    contents.emit('did-finish-load')
    expect(service.toggleFavorite(state, 12).favorite).toBe(true)
    expect(service.suggest('example').map(item => [item.kind, item.url])).toEqual([['favorite', 'https://example.com/'], ['history', 'https://docs.example/guide']])
    expect(service.suggest('guide')).toHaveLength(1)
    service.clearHistory(state, 12)
    expect(service.suggest('').map(item => item.kind)).toEqual(['favorite'])
    expect(service.toggleFavorite(state, 12).favorite).toBe(false)
  })

  it('asks once per site for prompted permissions, remembers the answer and denies the rest', () => {
    const { service, state, session, views, meta } = setup()
    service.setBounds(state, { x: 0, y: 0, width: 400, height: 300 }, 12)
    service.setVisible(state, true, 12)
    const request = session.setPermissionRequestHandler.mock.calls[0]![0] as (...args: unknown[]) => void
    const check = session.setPermissionCheckHandler.mock.calls[0]![0] as (...args: unknown[]) => boolean
    const camera = vi.fn()
    request(views[0]!.webContents, 'media', camera, { requestingUrl: 'https://meet.example/room' })
    const prompt = service.getState('p1', 12)
    expect(prompt.permissionRequest).toMatchObject({ origin: 'https://meet.example', permission: 'media' })
    expect(prompt.visible).toBe(false)
    expect(camera).not.toHaveBeenCalled()
    service.answerPermission(state, prompt.permissionRequest!.id, true, 12)
    expect(camera).toHaveBeenCalledWith(true)
    expect(service.getState('p1', 12)).toMatchObject({ permissionRequest: null, visible: true })
    const again = vi.fn()
    request(views[0]!.webContents, 'media', again, { requestingUrl: 'https://meet.example/other' })
    expect(again).toHaveBeenCalledWith(true)
    expect(check(views[0]!.webContents, 'media', 'https://meet.example')).toBe(true)
    const unknown = vi.fn()
    request(views[0]!.webContents, 'openExternal', unknown, { requestingUrl: 'https://meet.example/' })
    expect(unknown).toHaveBeenCalledWith(false)
    const copy = vi.fn()
    request(views[0]!.webContents, 'clipboard-sanitized-write', copy, { requestingUrl: 'https://meet.example/' })
    expect(copy).toHaveBeenCalledWith(true)
    service.resetPermissions(state, 12)
    expect(JSON.parse(meta.get('browser.permissions')!)).toEqual({})
    // A pending prompt is denied when its tab closes.
    const pending = vi.fn()
    request(views[0]!.webContents, 'geolocation', pending, { requestingUrl: 'https://maps.example/' })
    service.closeTab(state, 12)
    expect(pending).toHaveBeenCalledWith(false)
  })
})
