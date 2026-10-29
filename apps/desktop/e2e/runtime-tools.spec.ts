import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { closeTestApp } from './quit'

// Real Shell/PTY + local HTTP fixtures; Session Providers are simulated. Only
// the native directory chooser is replaced. User actions go through the UI.
const appDir = join(__dirname, '..')
const evidence = process.env.STUDIO_E2E_EVIDENCE_DIR ?? join(appDir, '../../.runtime/desktop-e2e/screenshots/runtime-tools')
let dir: string, app: ElectronApplication, page: Page, server: Server, address: string
const workspace = () => page.locator('.project-workspace:not([hidden])')
async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow()
  await expect(page.getByTestId('topbar')).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]!; win.setContentSize(1280, 800); win.show(); win.focus() })
}
async function openProject(name: string) {
  const path = join(dir, name); mkdirSync(path)
  await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, path)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
  return await workspace().getAttribute('data-project-id') ?? ''
}
async function terminalCommand(text: string) {
  const input = workspace().locator('.xterm-helper-textarea')
  await expect(input).toHaveCount(1)
  await input.focus(); await page.keyboard.insertText(text); await page.keyboard.press('Enter')
}
async function terminalHas(text: string) { await expect(workspace().locator('.xterm-rows')).toContainText(text) }
/**
 * The login Shell loads the developer's own zsh setup: plugins such as bracket auto-pairing corrupt typed commands
 * and every command lands in ~/.zsh_history. Tests therefore switch to a plain zsh without history first. The
 * arithmetic result (42) cannot appear in the echoed command, so it proves the new Shell is reading input.
 */
async function plainShell() {
  await terminalCommand(" exec env PS1='%# ' HISTFILE=/dev/null zsh -f")
  await terminalCommand('echo PLAIN_$((20+22))')
  await expect(workspace().locator('.xterm-rows > div').filter({ hasText: /^PLAIN_42$/ })).toHaveCount(1)
}
async function terminalOutputRow(text: string) {
  // A substring can match the echoed command before it has actually executed.
  await expect(workspace().locator('.xterm-rows > div').filter({ hasText: new RegExp(`^${text}$`) })).toHaveCount(1)
}
/** Native menus are outside the DOM: the next popup immediately "clicks" the item with this label. */
async function chooseNativeMenu(label: string) {
  await app.evaluate(({ Menu }, wanted) => {
    const original = Menu.buildFromTemplate
    Menu.buildFromTemplate = (template) => {
      Menu.buildFromTemplate = original
      const menu = original(template)
      menu.popup = (options) => {
        const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => items.map(item => item.label === wanted ? item : item.submenu ? find(item.submenu.items) : undefined).find(Boolean)
        const item = find(menu.items)
        if (!item) throw new Error(`No native menu item ${wanted}`)
        item.click()
        options?.callback?.()
      }
      return menu
    }
  }, label)
}
async function capture(name: string) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, `W0-${name}.png`) }) }
async function browserInfo() {
  return app.evaluate(({ webContents }) => {
    const view = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('http://127.0.0.1:'))
    if (!view) return null
    return { id: view.id, url: view.getURL(), type: view.getType() }
  })
}
async function previewText(): Promise<string> {
  return app.evaluate(async ({ BrowserWindow }) => {
    const view = (BrowserWindow.getAllWindows()[0]!.contentView.children[0] as import('electron').WebContentsView | undefined)?.webContents
    return view ? await view.executeJavaScript('document.body.innerText') as string : ''
  })
}

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'studio runtime tools '))
  server = createServer((request, response) => {
    if (request.url === '/redirect') { response.writeHead(302, { Location: 'mailto:dev@example.com' }); response.end(); return }
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><title>Runtime fixture</title><h1>Local preview</h1><button onclick="document.cookie=\'test=alpha; max-age=86400\';location.reload()">Set cookie</button><p id="cookie"></p><a href="/next">Next local page</a><a href="/redirect">Redirect to mail</a><a href="mailto:dev@example.com">Mail link</a><script>document.getElementById("cookie").textContent=document.cookie;document.body.dataset.studio=typeof window.studio;document.body.dataset.node=typeof require;</script>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  address = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  await launch()
})
test.afterEach(async () => {
  if (app) await closeTestApp(app, page)
  await new Promise<void>(resolve => server.close(() => resolve()))
  rmSync(dir, { recursive: true, force: true })
})

test('FR-TOOL-004 / DEC-14: independent Shells, hidden ANSI output, Stop isolation, final empty state and Project confirmation', async () => {
  const projectId = await openProject('Terminal Project')
  // Record CSP violations from before the Terminal exists: xterm injects <style> at runtime (W5-F3).
  await page.evaluate(() => {
    const w = window as unknown as { __cspViolations: string[] }
    w.__cspViolations = []
    document.addEventListener('securitypolicyviolation', event => w.__cspViolations.push(event.effectiveDirective))
  })
  await workspace().getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(workspace().getByRole('tab', { name: 'Terminal 1', exact: true })).toBeVisible()
  await plainShell()
  await terminalCommand("printf '\\033[31mANSI_MARKER\\033[0m\\n'")
  await terminalHas('ANSI_MARKER')
  // The built app (production CSP) must actually apply xterm's runtime styles, not just contain the text.
  // Independent of row text (the real login Shell's prompt varies): inspect the injected <style> sheets and the ANSI red cells.
  const appliedStyle = () => page.evaluate(() => {
    const rows = document.querySelector('.project-workspace:not([hidden]) .xterm-rows')
    const red = rows?.querySelector('span.xterm-fg-1')
    return rows && red ? {
      color: getComputedStyle(red).color, rowColor: getComputedStyle(rows).color, font: getComputedStyle(rows).fontFamily,
      blockedStyles: [...document.querySelectorAll('style')].filter(item => !item.sheet).length
    } : null
  })
  await expect.poll(appliedStyle).not.toBeNull()
  const applied = (await appliedStyle())!
  expect(applied.blockedStyles).toBe(0)
  expect(applied.color).not.toBe(applied.rowColor)
  expect(applied.font).toContain('IBM Plex Mono')
  // 24-bit colours and minimumContrastRatio adjustments are written as style attributes (W5-F6, W5-F9).
  await terminalCommand("printf '\\033[48;2;0;128;0m\\033[38;2;255;255;255m TRUECOLOR_BG \\033[0m \\033[41mDEFAULT_ON_RED\\033[0m \\033[43;30mBLACK_ON_YELLOW\\033[0m\\n'")
  const colourProbe = () => page.evaluate(() => {
    const rows = document.querySelector('.project-workspace:not([hidden]) .xterm-rows')
    const channel = (value: number) => { const unit = value / 255; return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4 }
    const luminance = (css: string) => { const [r, g, b] = (css.match(/[\d.]+/g) ?? []).map(Number); return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!) }
    const ratio = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05) }
    const cell = (text: string) => {
      const span = [...rows?.querySelectorAll('span') ?? []].find(item => item.textContent?.trim() === text)
      if (!span) return null
      const own = getComputedStyle(span)
      return { color: own.color, background: own.backgroundColor, ratio: ratio(own.color, own.backgroundColor) }
    }
    return { truecolor: cell('TRUECOLOR_BG'), onRed: cell('DEFAULT_ON_RED'), onYellow: cell('BLACK_ON_YELLOW') }
  })
  await expect.poll(async () => { const probe = await colourProbe(); return probe.truecolor && probe.onRed && probe.onYellow ? 'ready' : 'waiting' }).toBe('ready')
  const probe = await colourProbe()
  expect(probe.truecolor!.background).toBe('rgb(0, 128, 0)')          // 48;2 is applied, not dropped
  for (const [name, cell] of Object.entries(probe)) expect(cell!.ratio, `${name} ${cell!.color} on ${cell!.background}`).toBeGreaterThanOrEqual(4.5)
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations.filter(name => name.startsWith('style-src')))).toEqual([])
  await terminalCommand("(sleep 1; printf '\\rHIDDEN_MARKER\\n') &")
  await workspace().getByRole('button', { name: 'Files', exact: true }).click()
  await page.waitForTimeout(1300) // fixture emits once after hidden; time defines the tested event.
  await workspace().getByRole('button', { name: 'Terminal', exact: true }).click()
  await terminalHas('ANSI_MARKER'); await terminalHas('HIDDEN_MARKER')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1024, 640))
  await terminalCommand("node -e 'process.stdout.write((\"load \".repeat(12)+\"\\n\").repeat(6000)+\"PRESSURE_DONE\\n\")'")
  await terminalOutputRow('PRESSURE_DONE')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900))
  await terminalCommand("printf 'INPUT_AFTER_PRESSURE\\n'")
  await terminalOutputRow('INPUT_AFTER_PRESSURE')
  await workspace().getByRole('button', { name: '新建终端', exact: true }).click()
  await expect(workspace().getByRole('tab', { name: 'Terminal 2', exact: true })).toBeVisible()
  await plainShell()
  await terminalCommand('pwd'); await terminalHas('Terminal Project')
  await capture('terminal-two-tabs')
  await workspace().getByRole('button', { name: 'New Chat', exact: true }).first().click()
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill('[e2e:slow] runtime stop isolation')
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  await workspace().getByRole('button', { name: 'Stop', exact: true }).click()
  expect(await page.evaluate(id => window.studio.terminal.list({ projectId: id }), projectId)).toHaveLength(2)
  await page.getByRole('button', { name: '关闭 Terminal Project', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('2 个终端尚未退出')
  await expect(page.getByRole('dialog')).toContainText('Terminal 1')
  await expect(page.getByRole('dialog')).toContainText('Terminal 2')
  await capture('project-terminal-confirmation')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '右侧边栏', exact: true }).click()
  await workspace().getByRole('button', { name: 'Terminal', exact: true }).click()
  await workspace().getByRole('button', { name: '关闭 Terminal 2', exact: true }).click()
  await workspace().getByRole('button', { name: '取消', exact: true }).click()
  await expect(workspace().getByRole('tab', { name: 'Terminal 2', exact: true })).toBeVisible()
  await workspace().getByRole('button', { name: '关闭 Terminal 2', exact: true }).click()
  await workspace().getByRole('button', { name: '结束并关闭', exact: true }).click()
  await expect(workspace().getByRole('tab', { name: 'Terminal 2', exact: true })).toHaveCount(0)
  await terminalHas('INPUT_AFTER_PRESSURE')
  await workspace().getByRole('button', { name: '关闭 Terminal 1', exact: true }).click()
  await workspace().getByRole('button', { name: '结束并关闭', exact: true }).click()
  await expect(workspace().getByRole('heading', { name: '没有打开的终端' })).toBeVisible()
  await workspace().getByRole('button', { name: 'Browser', exact: true }).click()
  await workspace().getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(workspace().getByRole('heading', { name: '没有打开的终端' })).toBeVisible()
  await page.getByRole('button', { name: '关闭 Terminal Project', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'AI Developer Studio' })).toBeVisible()
})

test('FR-TOOL-003 / DEC-25: isolated web preview, address completion, history, mailto choice, menu, shared persistent data', async () => {
  await openProject('Browser Project')
  await workspace().getByRole('button', { name: 'Browser', exact: true }).click()
  const addressBar = () => workspace().getByRole('combobox', { name: '网址', exact: true })
  // No scheme typed: a loopback address is completed with http:// (TOOLS-Q9).
  await addressBar().fill(address.replace('http://', ''))
  await workspace().getByRole('button', { name: '前往网址', exact: true }).click()
  await expect.poll(previewText).toContain('Local preview')
  await expect(addressBar()).toHaveValue(address)
  const info = await browserInfo()
  const isolation = await app.evaluate(async ({ webContents }, id) => webContents.fromId(id)!.executeJavaScript('({studio:typeof window.studio,node:typeof require})'), info!.id)
  expect(isolation).toEqual({ studio: 'undefined', node: 'undefined' })
  await capture('browser-local-preview')
  await page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible()
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.contentView.children.length)).toBe(0)
  await page.getByRole('button', { name: '关闭设置', exact: true }).click()
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.contentView.children.length)).toBe(1)
  const preview = app.context().pages().find(candidate => candidate.url() === address)
  expect(preview).toBeDefined()
  await preview!.getByRole('button', { name: 'Set cookie', exact: true }).click()
  await expect.poll(previewText).toContain('test=alpha')
  // History: back and forward use the page's own navigation history.
  await preview!.getByRole('link', { name: 'Next local page', exact: true }).click()
  await expect.poll(() => browserInfo().then(info => info?.url)).toBe(address + 'next')
  await workspace().getByRole('button', { name: '后退', exact: true }).click()
  await expect.poll(() => browserInfo().then(info => info?.url)).toBe(address)
  await workspace().getByRole('button', { name: '前进', exact: true }).click()
  await expect.poll(() => browserInfo().then(info => info?.url)).toBe(address + 'next')
  await expect(addressBar()).toHaveValue(address + 'next')
  // mailto: (link or redirect) asks before handing over to the system; cancel keeps the page.
  // Clicked from page script: Playwright would otherwise wait for a navigation that is (correctly) never committed.
  await preview!.evaluate(() => (document.querySelector('a[href^="mailto:"]') as HTMLAnchorElement).click())
  await expect(workspace().getByRole('alertdialog', { name: '用系统应用打开？' })).toBeVisible()
  await capture('browser-mailto-choice')
  await workspace().getByRole('button', { name: '取消', exact: true }).click()
  await expect.poll(() => browserInfo().then(info => info?.url)).toBe(address + 'next')
  await addressBar().fill('file:///etc/hosts')
  await workspace().getByRole('button', { name: '前往网址', exact: true }).click()
  await expect(workspace().locator('.runtime-tool__error')).toContainText('HTTP / HTTPS')
  await addressBar().fill(address)
  await workspace().getByRole('button', { name: '前往网址', exact: true }).click()
  await expect.poll(previewText).toContain('Local preview')
  // The More menu is native; the test picks its items by label.
  await chooseNativeMenu('放大')
  await workspace().getByRole('button', { name: '更多 Browser 操作', exact: true }).click()
  await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().find(wc => wc.getURL().startsWith('http://127.0.0.1:'))?.getZoomFactor())).toBeCloseTo(1.1)
  await chooseNativeMenu('实际大小（当前 110%）')
  await workspace().getByRole('button', { name: '更多 Browser 操作', exact: true }).click()
  await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().find(wc => wc.getURL().startsWith('http://127.0.0.1:'))?.getZoomFactor())).toBeCloseTo(1)
  // Browsing data is shared by every Project (TOOLS-Q10).
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  await openProject('Other Browser')
  await workspace().getByRole('button', { name: 'Browser', exact: true }).click()
  await addressBar().fill(address)
  await workspace().getByRole('button', { name: '前往网址', exact: true }).click()
  await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().filter(wc => wc.getURL().startsWith('http://127.0.0.1:')).length)).toBe(2)
  await expect.poll(previewText).toContain('test=alpha')
  await page.getByRole('tab', { name: 'Browser Project', exact: true }).click()
  // ... and persistent across a restart.
  await closeTestApp(app, page); await launch()
  await expect(addressBar()).toHaveValue(address)
  await expect.poll(previewText).toContain('test=alpha')
  await capture('browser-persistent-cookie')
  await chooseNativeMenu('清除浏览数据…')
  await workspace().getByRole('button', { name: '更多 Browser 操作', exact: true }).click()
  await workspace().getByRole('alertdialog', { name: '清除浏览数据？' }).getByRole('button', { name: '清除', exact: true }).click()
  await expect(workspace().locator('.browser-notice')).toContainText('已清除')
  await workspace().getByRole('button', { name: '刷新网页', exact: true }).click()
  await expect.poll(previewText).toContain('Local preview')
  expect(await previewText()).not.toContain('test=alpha')
  await new Promise<void>(resolve => server.close(() => resolve()))
  await workspace().getByRole('button', { name: '刷新网页', exact: true }).click()
  await expect(workspace().getByRole('heading', { name: '无法加载网页' })).toBeVisible()
  await page.getByRole('button', { name: '关闭 Browser Project', exact: true }).click()
  await page.getByRole('button', { name: '关闭 Other Browser', exact: true }).click()
  await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().filter(wc => wc.getURL().startsWith('http://127.0.0.1:')).length)).toBe(0)
})

test('FR-PROJ-002 / AC-07: Terminal server → Browser, exact Project cleanup and Terminal-only/mixed quit', async () => {
  await openProject('Server Project')
  await workspace().getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(workspace().getByRole('tab', { name: 'Terminal 1', exact: true })).toBeVisible()
  await plainShell()
  await terminalCommand('node -e \'const s=require("node:http").createServer((q,r)=>r.end("<h1>PTY Server Preview</h1>"));s.listen(0,"127.0.0.1",()=>console.log("CHAIN_URL:http://127.0.0.1:"+s.address().port+"/"))\'')
  const chainUrl = async () => (await workspace().locator('.xterm-rows').textContent())?.match(/CHAIN_URL:(http:\/\/127\.0\.0\.1:\d+\/)/)?.[1] ?? ''
  await expect.poll(chainUrl).not.toBe('')
  const url = await chainUrl()
  await workspace().getByRole('button', { name: 'Browser', exact: true }).click()
  await workspace().getByRole('combobox', { name: '网址', exact: true }).fill(url)
  await workspace().getByRole('button', { name: '前往网址', exact: true }).click()
  await expect.poll(previewText).toContain('PTY Server Preview')
  await capture('terminal-server-browser-chain')
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  const survivingId = await openProject('Surviving Project')
  await workspace().getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(workspace().getByRole('tab', { name: 'Terminal 1', exact: true })).toBeVisible()
  await plainShell()
  await page.getByRole('tab', { name: 'Server Project', exact: true }).click()
  await page.getByRole('button', { name: '关闭 Server Project', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('1 个终端尚未退出')
  await page.getByRole('button', { name: '关闭并停止', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Server Project', exact: true })).toHaveCount(0)
  await expect.poll(() => fetch(url).then(() => true, () => false)).toBe(false)
  await terminalCommand("printf 'OTHER_PROJECT_ALIVE\\n'")
  await terminalHas('OTHER_PROJECT_ALIVE')
  // Initiate the actual app quit flow; cancelling must not stop prompt-only PTYs.
  await app.evaluate(({ app: mainApp }) => { setImmediate(() => mainApp.quit()) })
  await expect(page.getByRole('dialog')).toContainText('1 个未退出终端')
  await expect(page.getByRole('dialog')).toContainText('Terminal 1')
  await capture('terminal-only-quit-confirmation')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(await page.evaluate(projectId => window.studio.terminal.list({ projectId }), survivingId)).toHaveLength(1)
  await workspace().getByRole('button', { name: 'New Chat', exact: true }).first().click()
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill('[e2e:slow] mixed quit')
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  await app.evaluate(({ app: mainApp }) => { setImmediate(() => mainApp.quit()) })
  await expect(page.getByRole('dialog')).toContainText('1 个活动对话及 1 个未退出终端')
  await capture('mixed-session-terminal-quit')
  const exited = app.waitForEvent('close')
  await page.getByRole('button', { name: '停止并退出', exact: true }).click()
  await exited
})
