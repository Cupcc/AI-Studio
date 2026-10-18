import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '../../../../apps/desktop/node_modules/@playwright/test'
const appDir = join(__dirname, '../../../../apps/desktop'), evidence = __dirname
let dir: string, app: ElectronApplication, page: Page
const workspace = () => page.locator('.project-workspace:not([hidden])')
async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded'); await expect(page.getByTestId('topbar')).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]!; win.show(); win.focus() })
}
async function pickProject(name = 'W6 Project') {
  const path = join(dir, name); mkdirSync(path)
  await app.evaluate(({ dialog }, selectedPath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] }) }, path)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toBeVisible()
  return (await page.evaluate(() => window.studio.project.bootstrap())).projects.find(project => project.name === name)!.id
}
async function send(text: string) {
  await workspace().getByRole('button', { name: 'New Chat', exact: true }).first().click()
  await workspace().getByRole('textbox', { name: '消息' }).fill(text)
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
}
test.beforeEach(async () => { dir = mkdtempSync(join(tmpdir(), 'studio-w6-e2e-')); await launch() })
test.afterEach(async () => {
  if (page && !page.isClosed()) await page.evaluate(async () => {
    const { projects } = await window.studio.project.bootstrap()
    for (const project of projects) await window.studio.session.stopProject({ projectId: project.id })
  })
  await app?.close(); rmSync(dir, { recursive: true, force: true })
})

test('S-Q1 / FR-STATE-005: real minimized and hidden windows preserve unread until explicit reopening', async () => {
  const projectId = await pickProject()
  await page.evaluate(() => { const w = window as unknown as { w6FocusEvents: { focused: boolean }[] }; w.w6FocusEvents = []; window.studio.app.onWindowFocusChanged(event => w.w6FocusEvents.push(event)) })
  for (const mode of ['minimize', 'hide'] as const) {
    const text = `W6 foreground ${mode} [e2e:delay]`
    await send(text)
    const sessionId = (await page.evaluate(id => window.studio.session.list({ projectId: id }), projectId))[0]!.id
    await app.evaluate(({ BrowserWindow }, action) => { const win = BrowserWindow.getAllWindows()[0]!; action === 'minimize' ? win.minimize() : win.hide() }, mode)
    await expect.poll(() => app.evaluate(({ BrowserWindow }, action) => { const win = BrowserWindow.getAllWindows()[0]!; return action === 'minimize' ? win.isMinimized() : !win.isVisible() }, mode)).toBe(true)
    await expect.poll(() => page.evaluate(id => window.studio.session.getConversation({ sessionId: id }).then(page => page.session.completionUnread), sessionId)).toBe(true)
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]!; win.restore(); win.show(); win.focus() })
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocused())).toBe(true)
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized())).toBe(false)
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true)
    console.info('W6 foreground diagnostic', mode, JSON.stringify(await page.evaluate(() => ({ documentFocus: document.hasFocus(), focusEvents: (window as unknown as { w6FocusEvents: { focused: boolean }[] }).w6FocusEvents }))), JSON.stringify(await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]!; return { focused: w.isFocused(), visible: w.isVisible(), minimized: w.isMinimized() } })))
    await expect(workspace().getByRole('button', { name: text, exact: true })).toBeVisible()
    expect((await page.evaluate(id => window.studio.session.getConversation({ sessionId: id }), sessionId)).session.completionUnread).toBe(true)
    await page.screenshot({ path: join(evidence, `W6-unread-${mode}.png`) })
    await workspace().getByRole('button', { name: text, exact: true }).click()
    await expect.poll(() => page.evaluate(id => window.studio.session.getConversation({ sessionId: id }).then(page => page.session.status), sessionId)).toBe(null)
    console.info(`W6 ${mode}: terminal unread=true; foreground return retained; explicit reopen cleared`)
  }
})

test('FR-STATE-006 / D-07/10/14: real Session attention drives Tab/fold dots and closes only the two target turns', async () => {
  const firstProject = await pickProject()
  await page.evaluate(async projectId => {
    await window.studio.session.create({ projectId, cli: 'codex', text: '[e2e:approval] W6 waiting target' })
    await window.studio.session.create({ projectId, cli: 'claude-code', text: '[e2e:slow] W6 running target' })
  }, firstProject)
  await expect.poll(() => page.evaluate(projectId => window.studio.session.getProjectState({ projectId }).then(state => state.counts), firstProject)).toEqual({ running: 1, needsInput: 1 })
  await page.getByRole('button', { name: '折叠导航', exact: true }).click()
  await expect(page.getByRole('button', { name: '展开导航', exact: true }).locator('[data-attention="needs_input"]')).toHaveCount(1)
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  const otherProject = await pickProject('W6 Other')
  const other = await page.evaluate(projectId => window.studio.session.create({ projectId, cli: 'codex', text: '[e2e:slow] W6 independent other' }), otherProject)
  await expect.poll(() => page.evaluate(projectId => window.studio.session.getProjectState({ projectId }).then(state => state.counts.running), otherProject)).toBe(1)
  await expect.poll(() => page.evaluate(sessionId => window.studio.session.getConversation({ sessionId }).then(result => result.session.nativeSessionId), other.id)).not.toBeNull()
  const otherNativeId = (await page.evaluate(sessionId => window.studio.session.getConversation({ sessionId }), other.id)).session.nativeSessionId
  const firstTab = page.getByRole('tab', { name: /^W6 Project/ })
  await expect(firstTab.locator('[data-attention="needs_input"]')).toHaveCount(1)
  await expect(page.getByRole('tab', { name: 'W6 Other', exact: true }).locator('[data-attention]')).toHaveCount(0)
  await firstTab.click()
  await expect(firstTab.locator('[data-attention]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '展开导航', exact: true }).locator('[data-attention="needs_input"]')).toHaveCount(1)
  await page.screenshot({ path: join(evidence, 'W6-attention-tab-fold.png') })
  await page.getByRole('button', { name: '关闭 W6 Project', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('2 个对话仍在运行或等待你的输入')
  await page.screenshot({ path: join(evidence, 'W6-close-counts-two.png') })
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  expect((await page.evaluate(projectId => window.studio.session.getProjectState({ projectId }), firstProject)).counts).toEqual({ running: 1, needsInput: 1 })
  await page.getByRole('button', { name: '关闭 W6 Project', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '关闭并停止', exact: true }).click()
  await expect(page.getByRole('tab', { name: /^W6 Project/ })).toHaveCount(0)
  expect((await page.evaluate(projectId => window.studio.session.getProjectState({ projectId }), firstProject)).counts).toEqual({ running: 0, needsInput: 0 })
  expect((await page.evaluate(sessionId => window.studio.session.getConversation({ sessionId }), other.id)).session).toMatchObject({ activity: 'running', nativeSessionId: otherNativeId })
  await page.getByRole('button', { name: '展开导航', exact: true }).click()
  await workspace().getByRole('button', { name: '[e2e:slow] W6 independent other', exact: true }).click()
  await workspace().getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(workspace().getByText(/Worked for .*已停止/)).toBeVisible()
  console.info('W6 actual Needs Input attention → noncurrent Tab and fold dot; close count=2; cancel retained; target stopped; other Project remained Running')
})

test('FR-NAV-003 / NAV-Q12: real renderer handles 2,000 histories with bounded DOM and stable scroll after rename', async () => {
  const projectId = await pickProject()
  await send('W6 history seed')
  await expect(workspace().getByText(/Worked for .*Done/)).toBeVisible()
  const summaries = await page.evaluate(id => window.studio.session.list({ projectId: id }), projectId), baseline = summaries[0]!
  await app.close()
  const db = new DatabaseSync(join(dir, 'data', 'studio.sqlite3'))
  try {
    const insert = db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)')
    db.exec('BEGIN')
    for (let n = 1; n < 2000; n++) {
      const session = { ...baseline, id: `w6-history-${n}`, nativeSessionId: null, title: `W6 old history ${n}`, activity: 'none', status: null, errorUnseen: false, completionUnread: false, lastUserMessageAt: baseline.lastUserMessageAt - n * 60_000 }
      insert.run(session.id, projectId, session.cli, null, session.lastUserMessageAt, session.createdAt, JSON.stringify(session))
    }
    db.exec('COMMIT')
  } finally { db.close() }
  await launch()
  await expect(workspace().getByRole('button', { name: 'W6 history seed', exact: true })).toBeVisible()
  const history = workspace().getByLabel('Session History', { exact: true })
  await expect.poll(() => history.locator('[data-session-row]').count()).toBeLessThan(40)
  const measurements = await history.evaluate(async node => {
    const timings: number[] = []
    for (let n = 1; n <= 10; n++) { const at = performance.now(); node.scrollTop = n * 5000; await new Promise(requestAnimationFrame); timings.push(performance.now() - at) }
    return { timings, scrollTop: node.scrollTop, rows: node.querySelectorAll('[data-session-row]').length, totalHeight: node.scrollHeight }
  })
  await expect.poll(() => history.locator('[data-session-row]').count()).toBeLessThan(40)
  const anchor = await history.evaluate(node => ({ top: node.scrollTop, ids: [...node.querySelectorAll('[data-session-row]')].map(row => row.getAttribute('data-session-row')) }))
  await page.evaluate(({ sessionId }) => window.studio.session.rename({ sessionId, title: 'W6 renamed older history' }), { sessionId: 'w6-history-100' })
  await expect.poll(() => history.evaluate(node => node.scrollTop)).toBe(anchor.top)
  expect(await history.evaluate(node => [...node.querySelectorAll('[data-session-row]')].map(row => row.getAttribute('data-session-row')))).toEqual(anchor.ids)
  await page.screenshot({ path: join(evidence, 'W6-history-2000.png') })
  console.info('W6 2000-history renderer', JSON.stringify(measurements), 'anchor retained after offscreen rename')
})
