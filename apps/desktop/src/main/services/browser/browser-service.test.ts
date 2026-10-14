import { EventEmitter } from 'node:events'
import type { BrowserWindow, WebContentsView } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { BrowserState } from '@shared/tools/browser'
import { BrowserService } from './browser-service'
import { browserDestination, clampBrowserBounds } from './policy'

class FakeSession extends EventEmitter {
  setPermissionRequestHandler = vi.fn()
  setPermissionCheckHandler = vi.fn()
  setDevicePermissionHandler = vi.fn()
  clearStorageData = vi.fn(async () => {})
}
class FakeContents extends EventEmitter {
  id = 12
  session = new FakeSession()
  destroyed = false
  url = ''
  isDestroyed = () => this.destroyed
  getURL = () => this.url
  getTitle = () => 'Local preview'
  focus = vi.fn()
  loadURL = vi.fn(async (url: string, _options?: unknown) => { this.url = url })
  windowOpen?: (input: { url: string }) => { action: string }
  setWindowOpenHandler = (handler: typeof this.windowOpen) => { this.windowOpen = handler }
  close = vi.fn((_options: unknown) => { this.destroyed = true; this.emit('destroyed') })
}
class FakeView {
  webContents = new FakeContents()
  setVisible = vi.fn()
  setBounds = vi.fn()
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
function setup(address?: string) {
  const window = new FakeWindow()
  const views: FakeView[] = []
  const partitions: string[] = []
  const events: BrowserState[] = []
  const addresses = new Map<string, string>(address ? [['p1', address]] : [])
  const openExternal = vi.fn(async (_url: string) => {})
  let activeProject = 'p1'
  let canOperate = true
  let sequence = 0
  const service = new BrowserService({
    requireProject: id => { if (!['p1', 'p2'].includes(id)) throw new Error('Unknown Project') },
    canOperate: () => canOperate,
    isProjectVisible: id => id === activeProject,
    findWindow: sender => sender === window.webContents.id ? window as unknown as BrowserWindow : null,
    createView: partition => { const view = new FakeView(); views.push(view); partitions.push(partition); return view as unknown as WebContentsView },
    readAddress: id => addresses.get(id),
    saveAddress: (id, value) => { addresses.set(id, value) },
    changed: state => { events.push(state) },
    openExternal,
    newId: () => `generation-${++sequence}`
  })
  const state = service.getState('p1', 12)
  return { service, state, window, views, partitions, events, addresses, openExternal,
    activate: (id: string) => { activeProject = id; service.syncVisibility() },
    closing: () => { canOperate = false; service.syncVisibility() }
  }
}
function event(url: string, isMainFrame = true) { return { url, isMainFrame, preventDefault: vi.fn() } }

describe('Browser URL and bounds policy', () => {
  it.each(['http://localhost:3000/', 'https://LOCALHOST:443/', 'http://localhost./', 'http://127.90.20.1:4000/', 'http://[0:0:0:0:0:0:0:1]/', 'http://2130706433/', 'http://0x7f000001/'])('accepts canonical loopback URL %s', url => {
    expect(browserDestination(url).kind).toBe('local')
  })
  it.each(['https://localhost.example/', 'http://127.0.0.1.example/', 'http://[::ffff:127.0.0.1]/', 'https://example.com/', 'http://192.168.1.1/'])('classifies nonloopback URL %s as external', url => {
    expect(browserDestination(url).kind).toBe('external')
  })
  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hello', 'app://studio/', 'http://user:secret@localhost/', 'http://local\nhost/', 'http://localhost:99999/', ''])('rejects unsafe or invalid URL %s', url => {
    expect(() => browserDestination(url)).toThrow()
  })
  it('supports a typed localhost address and clips bounds to the native content', () => {
    expect(browserDestination('localhost:3000/a', true)).toEqual({ kind: 'local', url: 'http://localhost:3000/a' })
    expect(clampBrowserBounds({ x: -10.5, y: 680, width: 200, height: 300 }, [1000, 700])).toEqual({ x: 0, y: 680, width: 189, height: 20 })
    expect(() => clampBrowserBounds({ x: NaN, y: 0, width: 10, height: 10 }, [1000, 700])).toThrow()
  })
})

describe('Project Browser service', () => {
  it('keeps a unique in-memory partition and instance per Project, restores only local addresses', () => {
    const fixture = setup('http://localhost:3000/restored')
    const second = fixture.service.getState('p2', 12)
    expect(fixture.service.getState('p1', 12).generation).toBe(fixture.state.generation)
    expect(second.generation).not.toBe(fixture.state.generation)
    expect(new Set(fixture.partitions).size).toBe(2)
    expect(fixture.partitions.every(partition => !partition.startsWith('persist:'))).toBe(true)
    expect(fixture.views[0]!.webContents.loadURL).toHaveBeenCalledWith('http://localhost:3000/restored')
    const invalid = setup('https://example.com/')
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

  it.each(['will-navigate', 'will-frame-navigate', 'will-redirect'])('uses the same top-level external confirmation policy for %s', async type => {
    const { service, state, views, openExternal } = setup()
    const contents = views[0]!.webContents
    const local = event('http://127.0.0.1:3000/')
    contents.emit(type, local)
    expect(local.preventDefault).not.toHaveBeenCalled()
    const external = event('https://example.com/path')
    contents.emit(type, external)
    expect(external.preventDefault).toHaveBeenCalledOnce()
    expect(openExternal).not.toHaveBeenCalled()
    const request = service.getState('p1', 12).externalRequest!
    await service.openExternal({ ...state, requestId: request.id }, 12)
    expect(openExternal).toHaveBeenCalledWith('https://example.com/path')
    await expect(service.openExternal({ ...state, requestId: request.id }, 12)).rejects.toThrow('失效')
  })

  it('allows subframe navigation while denying unsafe main-frame URLs and all new windows', () => {
    const { service, state, views, openExternal } = setup()
    const contents = views[0]!.webContents
    const resource = event('https://example.com/widget', false)
    contents.emit('will-frame-navigate', resource)
    expect(resource.preventDefault).not.toHaveBeenCalled()
    const unsafe = event('file:///etc/passwd')
    contents.emit('will-navigate', unsafe)
    expect(unsafe.preventDefault).toHaveBeenCalled()
    expect(service.getState('p1', 12).externalRequest).toBeNull()
    expect(contents.windowOpen!({ url: 'https://example.com/' })).toEqual({ action: 'deny' })
    const request = service.getState('p1', 12).externalRequest!
    expect(request.source).toBe('window')
    service.dismissExternal({ ...state, requestId: request.id }, 12)
    expect(openExternal).not.toHaveBeenCalled()
    expect(contents.windowOpen!({ url: 'http://localhost:3000/new' })).toEqual({ action: 'deny' })
    expect(contents.loadURL).toHaveBeenCalledWith('http://localhost:3000/new')
    expect(contents.windowOpen!({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
  })

  it('denies permissions, device grants and downloads without a system dialog', () => {
    const { views } = setup()
    const session = views[0]!.webContents.session
    const request = session.setPermissionRequestHandler.mock.calls[0]![0] as (...args: unknown[]) => void
    const callback = vi.fn()
    request(null, 'media', callback, {})
    expect(callback).toHaveBeenCalledWith(false)
    expect((session.setPermissionCheckHandler.mock.calls[0]![0] as () => boolean)()).toBe(false)
    expect((session.setDevicePermissionHandler.mock.calls[0]![0] as () => boolean)()).toBe(false)
    const download = event('http://localhost/file')
    session.emit('will-download', download)
    expect(download.preventDefault).toHaveBeenCalled()
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
    expect(service.getState('p1', 12)).toMatchObject({ status: 'ready', title: 'Local preview', error: null })
    contents.emit('render-process-gone', {}, { reason: 'crashed' })
    expect(service.getState('p1', 12).status).toBe('crashed')
    service.reload(state, 12)
    contents.emit('did-finish-load')
    expect(service.getState('p1', 12).status).toBe('ready')
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

  it('restores the committed page after cancelling an external redirect and ignores late rejected-load events', async () => {
    const { service, state, views, addresses } = setup()
    const contents = views[0]!.webContents
    service.navigate(state, 'http://localhost/original', 12)
    contents.emit('did-finish-load')
    service.setBounds(state, { x: 0, y: 0, width: 300, height: 300 }, 12)
    service.setVisible(state, true, 12)
    let rejectRedirect!: (error: Error) => void
    contents.loadURL.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectRedirect = reject }))
    service.navigate(state, 'http://localhost/redirect', 12)
    const redirect = event('https://example.com/')
    contents.emit('will-redirect', redirect)
    expect(redirect.preventDefault).toHaveBeenCalledOnce()
    const pending = service.getState('p1', 12)
    expect(pending).toMatchObject({ address: 'http://localhost/original', title: 'Local preview', status: 'ready', error: null, visible: false })
    const restored = service.dismissExternal({ ...state, requestId: pending.externalRequest!.id }, 12)
    expect(restored).toMatchObject({ address: 'http://localhost/original', status: 'ready', error: null, visible: true, externalRequest: null })
    rejectRedirect(Object.assign(new Error('ERR_FAILED'), { code: 'ERR_FAILED' }))
    await Promise.resolve()
    contents.emit('did-fail-load', {}, -2, 'ERR_FAILED', 'http://localhost/redirect', true)
    // A reload of the same URL can redirect too; no active load means even a
    // failure carrying the restored address must not invalidate the old page.
    contents.emit('did-fail-load', {}, -2, 'ERR_FAILED', 'http://localhost/original', true)
    expect(service.getState('p1', 12)).toMatchObject({ address: 'http://localhost/original', status: 'ready', error: null, visible: true })
    expect(addresses.get('p1')).toBe('http://localhost/original')
    expect(contents.getURL()).toBe('http://localhost/original')
    expect(() => service.navigate(state, 'file:///etc/passwd', 12)).toThrow('HTTP / HTTPS')
    expect(service.getState('p1', 12)).toMatchObject({ status: 'ready', error: null })
  })

  it('preserves idle after cancelling a first-page external redirect with no committed local page', async () => {
    const { service, state, views } = setup()
    const contents = views[0]!.webContents
    let rejectRedirect!: (error: Error) => void
    contents.loadURL.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectRedirect = reject }))
    service.navigate(state, 'http://localhost/redirect', 12)
    contents.emit('will-redirect', event('https://example.com/'))
    const pending = service.getState('p1', 12)
    expect(pending.status).toBe('idle')
    service.dismissExternal({ ...state, requestId: pending.externalRequest!.id }, 12)
    rejectRedirect(new Error('ERR_FAILED'))
    await Promise.resolve()
    contents.emit('did-fail-load', {}, -2, 'ERR_FAILED', 'http://localhost/redirect', true)
    expect(service.getState('p1', 12)).toMatchObject({ status: 'idle', title: '', error: null, externalRequest: null })
  })

  it('blocks recreation and navigation during closing while permitting diagnostic reads and hides', async () => {
    const { service, state, closing, views } = setup()
    closing()
    expect(service.getState('p1', 12).generation).toBe(state.generation)
    expect(() => service.getState('p2', 12)).toThrow('正在关闭')
    expect(() => service.navigate(state, 'http://localhost/', 12)).toThrow('正在关闭')
    expect(() => service.reload(state, 12)).toThrow('正在关闭')
    expect(() => service.setVisible(state, false, 12)).not.toThrow()
    await service.close('p1')
    expect(views[0]!.webContents.close).toHaveBeenCalledWith({ waitForBeforeUnload: false })
    expect(views[0]!.webContents.session.clearStorageData).toHaveBeenCalledOnce()
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

  it('keeps the service usable after closeAll failure and retries storage cleanup using the retained session', async () => {
    const { service, views } = setup()
    const session = views[0]!.webContents.session
    session.clearStorageData.mockRejectedValueOnce(new Error('storage cleanup failure'))
    await expect(service.closeAll()).rejects.toThrow('Browser cleanup failed')
    expect(service.getState('p1', 12).status).toBe('failed')
    expect(views[0]!.webContents.isDestroyed()).toBe(true)
    // A real Electron webContents.session getter throws after native destruction.
    Object.defineProperty(views[0]!.webContents, 'session', { get: () => { throw new Error('Object has been destroyed') } })
    expect(() => service.getState('p2', 12)).not.toThrow()
    await service.closeAll()
    expect(session.clearStorageData).toHaveBeenCalledTimes(2)
    expect(() => service.getState('p1', 12)).not.toThrow()
  })
})
