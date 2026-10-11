import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

// Playwright loads specs as CommonJS (the package is not type: module).
const appDir = join(__dirname, '..')
// Launch the app directory (not out/main/index.js) so Electron reads package.json
// for the app name and version, as in dev mode and the packaged app.
const appEntry = appDir

let userData: string
let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'studio e2e '))
  app = await electron.launch({
    args: [appEntry, `--studio-user-data-dir=${userData}`],
    env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' },
    cwd: appDir
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

test('opens one window with the shell spec sizes', async () => {
  // The window is shown on ready-to-show, slightly after the first load.
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false))
    .toBe(true)
  const state = await app.evaluate(({ BrowserWindow }) => {
    const [win] = BrowserWindow.getAllWindows()
    if (!win) throw new Error('no window')
    const before = win.getSize()
    win.setSize(800, 500)
    const shrunk = win.getSize()
    win.setSize(before[0]!, before[1]!)
    return {
      count: BrowserWindow.getAllWindows().length,
      visible: win.isVisible(),
      size: before,
      minimum: win.getMinimumSize(),
      shrunk,
      buttons: process.platform === 'darwin' ? win.getWindowButtonPosition() : null
    }
  })
  expect(state.count).toBe(1)
  expect(state.visible).toBe(true)
  expect(state.size).toEqual([1280, 800])
  expect(state.minimum).toEqual([1024, 640])
  expect(state.shrunk).toEqual([1024, 640])
  if (process.platform === 'darwin') expect(state.buttons).toEqual({ x: 14, y: 14 })
})

test('renders from app://studio with a draggable 40px top bar', async () => {
  expect(page.url()).toBe('app://studio/index.html')
  const topbar = page.getByTestId('topbar')
  await expect(topbar).toBeVisible()
  const style = await topbar.evaluate((el) => {
    const cs = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    return { region: cs.getPropertyValue('-webkit-app-region'), height: rect.height, top: rect.top, left: rect.left }
  })
  expect(style).toEqual({ region: 'drag', height: 40, top: 0, left: 0 })
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toContain("script-src 'self'")
  expect(csp).not.toContain('unsafe-inline')
})

test('renderer has no Node.js, require or raw ipcRenderer', async () => {
  const probe = await page.evaluate(async () => {
    const w = window as unknown as Record<string, unknown>
    // CSP must block injected inline scripts (page.evaluate itself bypasses CSP).
    const violation = new Promise<string>((resolve) => {
      document.addEventListener('securitypolicyviolation', (e) => resolve(e.effectiveDirective), { once: true })
      setTimeout(() => resolve('none'), 1000)
    })
    const script = document.createElement('script')
    script.textContent = 'window.__inlineScriptRan = true'
    document.head.appendChild(script)
    const blockedDirective = await violation
    return {
      inlineScriptRan: w.__inlineScriptRan === true,
      blockedDirective,
      require: typeof w.require,
      process: typeof w.process,
      module: typeof w.module,
      Buffer: typeof w.Buffer,
      global: typeof w.global,
      ipcRenderer: typeof w.ipcRenderer,
      electron: typeof w.electron,
      studioKeys: Object.keys(window.studio),
      appKeys: Object.keys(window.studio.app).sort()
    }
  })
  expect(probe).toEqual({
    inlineScriptRan: false,
    blockedDirective: 'script-src-elem',
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    Buffer: 'undefined',
    global: 'undefined',
    ipcRenderer: 'undefined',
    electron: 'undefined',
    studioKeys: ['app', 'project', 'session', 'projectView'],
    appKeys: ['getInfo', 'onWindowFocusChanged', 'ping']
  })
})

test('typed preload API works and main validates input', async () => {
  const result = await page.evaluate(async () => {
    const info = await window.studio.app.getInfo()
    const pong = await window.studio.app.ping({ message: 'hello' })
    let invalid = ''
    try {
      await window.studio.app.ping({ message: 42 } as never)
    } catch (error) {
      invalid = String(error)
    }
    return { name: info.name, version: info.version, electron: info.versions.electron, isPackaged: info.isPackaged, pong: pong.message, invalid }
  })
  expect(result.electron).toMatch(/^\d+\.\d+\.\d+$/)
  expect(result.isPackaged).toBe(false)
  expect(result.name).toBe('AI Developer Studio')
  expect(result.version).toBe('0.0.0')
  expect(result.pong).toBe('hello')
  expect(result.invalid).toMatch(/message must be a string/)
  await expect(page.getByRole('heading', { name: 'AI Developer Studio' })).toBeVisible()
})

test('new windows and foreign navigation are denied', async () => {
  const opened = await page.evaluate(() => window.open('https://example.com') === null)
  expect(opened).toBe(true)
  await page.evaluate(() => {
    window.location.href = 'https://example.com/'
  })
  await page.waitForTimeout(500)
  expect(page.url()).toBe('app://studio/index.html')
  const count = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  expect(count).toBe(1)
})

test('smoke mode: SQLite, node-pty and login env work in the Electron main process', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio smoke '))
  const output = join(dir, 'smoke result.json')
  const electronPath = (await import('electron')).default as unknown as string
  try {
    await promisify(execFile)(electronPath, [appEntry, `--studio-smoke-output=${output}`, `--studio-user-data-dir=${join(dir, 'user data')}`], {
      cwd: appDir,
      env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' },
      timeout: 45_000
    }).catch((error: unknown) => {
      // Non-zero exit still writes the report; assertions below explain the failure.
      return error
    })
    const report = JSON.parse(readFileSync(output, 'utf8'))
    expect(report.sqlite).toMatchObject({ ok: true, driver: 'node:sqlite', dbInsideUserData: true, secondRunApplied: 0, readBack: true })
    expect(report.pty).toMatchObject({ ok: true, receivedMarker: true, exitCode: 0 })
    expect(report.shellEnv).toMatchObject({ ok: true, source: 'login-shell' })
    expect(report.renderer).toMatchObject({ ok: true, origin: 'app://studio', topBarRendered: true, nodeGlobalsAbsent: true, preloadApiWorks: true })
    // Report must stay sanitized: no environment dump.
    expect(JSON.stringify(report)).not.toMatch(/"PATH"|HOME=|"env"/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
