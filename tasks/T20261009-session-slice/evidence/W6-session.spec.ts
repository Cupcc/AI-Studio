import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '../../../apps/desktop/node_modules/@playwright/test'
const appDir = join(__dirname, '../../../apps/desktop'), evidence = __dirname
let dir: string, app: ElectronApplication, page: Page
const workspace = () => page.locator('.project-workspace:not([hidden])')
async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded'); await expect(page.getByTestId('topbar')).toBeVisible()
}
async function pickProject() {
  const path = join(dir, 'W6 Project'); mkdirSync(path)
  await app.evaluate(({ dialog }, selectedPath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] }) }, path)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  return (await page.evaluate(() => window.studio.project.bootstrap())).projects[0]!.id
}
async function send(text: string) {
  await workspace().getByRole('button', { name: 'New Chat', exact: true }).first().click()
  await workspace().getByRole('textbox', { name: '消息' }).fill(text)
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
}
test.beforeEach(async () => { dir = mkdtempSync(join(tmpdir(), 'studio-w6-e2e-')); await launch() })
test.afterEach(async () => { await app?.close(); rmSync(dir, { recursive: true, force: true }) })

test('S-Q1 / FR-STATE-005: real minimized and hidden windows preserve unread until explicit reopening', async () => {
  const projectId = await pickProject()
  for (const mode of ['minimize', 'hide'] as const) {
    const text = `W6 foreground ${mode} [e2e:delay]`
    await send(text)
    const sessionId = (await page.evaluate(id => window.studio.session.list({ projectId: id }), projectId))[0]!.id
    await app.evaluate(({ BrowserWindow }, action) => { const win = BrowserWindow.getAllWindows()[0]!; action === 'minimize' ? win.minimize() : win.hide() }, mode)
    await expect.poll(() => app.evaluate(({ BrowserWindow }, action) => { const win = BrowserWindow.getAllWindows()[0]!; return action === 'minimize' ? win.isMinimized() : !win.isVisible() }, mode)).toBe(true)
    await expect.poll(() => page.evaluate(id => window.studio.session.getConversation({ sessionId: id }).then(page => page.session.completionUnread), sessionId)).toBe(true)
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]!; win.restore(); win.show(); win.focus() })
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocused())).toBe(true)
    await expect(workspace().getByRole('button', { name: text, exact: true })).toBeVisible()
    expect((await page.evaluate(id => window.studio.session.getConversation({ sessionId: id }), sessionId)).session.completionUnread).toBe(true)
    await page.screenshot({ path: join(evidence, `W6-unread-${mode}.png`) })
    await workspace().getByRole('button', { name: text, exact: true }).click()
    await expect.poll(() => page.evaluate(id => window.studio.session.getConversation({ sessionId: id }).then(page => page.session.status), sessionId)).toBe(null)
    console.info(`W6 ${mode}: terminal unread=true; foreground return retained; explicit reopen cleared`)
  }
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
