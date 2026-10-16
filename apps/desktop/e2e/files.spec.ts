import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

// FR-TOOL-001 / FR-INPUT-001 against the built app. Session Providers are simulated (STUDIO_E2E_PROVIDERS=1) and
// no CLI or model runs; fixture Projects live under os.tmpdir(). Only the native directory chooser is replaced:
// every user action goes through the UI.
const appDir = join(__dirname, '..')
const evidence = process.env.STUDIO_E2E_EVIDENCE_DIR ?? join(appDir, '../../.runtime/desktop-e2e/screenshots/files')
let dir: string, app: ElectronApplication, page: Page
const workspace = () => page.locator('.project-workspace:not([hidden])')
const tree = () => workspace().getByRole('tree', { name: '项目文件' })
const viewer = () => workspace().getByRole('region', { name: '文件查看器' })
// Only file tags carry their path as title; the View tag is not one.
const fileTags = () => workspace().locator('.composer__tag[title]')
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (name: string) => tree().locator('.files-row').filter({ has: page.locator('.files-row__name', { hasText: new RegExp(`^${escape(name)}$`) }) })

async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow()
  await expect(page.getByTestId('topbar')).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]!; win.setContentSize(1280, 800); win.show(); win.focus() })
}

async function openProject(name: string, populate: (root: string) => void): Promise<string> {
  const root = join(dir, name); mkdirSync(root); populate(root)
  await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, root)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
  return root
}
async function capture(name: string) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, `W0-${name}.png`) }) }
const put = (root: string, path: string, content: string | Buffer = path) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content) }

test.beforeEach(async () => { dir = mkdtempSync(join(tmpdir(), 'studio files ')); await launch() })
test.afterEach(async () => {
  try { await app.close() } catch { /* already closed */ }
  // Restore permissions so the temporary tree can be removed.
  try { chmodSync(join(dir, 'Files Project', 'secret.txt'), 0o600) } catch { /* not created */ }
  rmSync(dir, { recursive: true, force: true })
})

test('FR-TOOL-001: lazy tree, viewing without tags, live refresh, kept state, special names and failure states', async () => {
  const outside = join(dir, 'outside.txt'); writeFileSync(outside, 'outside the Project')
  const root = await openProject('Files Project', project => {
    put(project, 'src/a.ts', 'export const A = 1\n')
    put(project, 'src/lib/b.ts', 'export const B = 2\n')
    put(project, 'docs/my file.md', '# spaced name\n')
    put(project, '-dash.txt', 'leading dash\n')
    put(project, 'bracket[1]*.txt', 'glob characters\n')
    put(project, '日本語.md', '日本語の内容\n')
    put(project, 'emoji-😀.txt', 'emoji name\n')
    put(project, 'bad\nname.txt', 'a newline in the name\n')
    put(project, 'bin.dat', Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02]))
    put(project, 'latin1.txt', Buffer.from([0x63, 0x61, 0x66, 0xe9, 0xc3, 0x28]))
    put(project, 'big.txt', Buffer.alloc(1_300_000, 0x61))
    put(project, 'secret.txt', 'unreadable\n'); chmodSync(join(project, 'secret.txt'), 0)
    mkdirSync(join(project, 'empty'))
    symlinkSync(outside, join(project, 'link-out'))
  })
  await page.evaluate(() => {
    const w = window as unknown as { __csp: string[] }; w.__csp = []
    document.addEventListener('securitypolicyviolation', event => w.__csp.push(`${event.effectiveDirective} ${event.blockedURI}`))
  })

  await workspace().getByRole('button', { name: 'Files', exact: true }).click()
  // Only the root is read when the panel opens; nested entries appear when a directory is expanded.
  await expect(row('src')).toBeVisible()
  await expect(row('a.ts')).toHaveCount(0)
  await row('src').click()
  await expect(row('a.ts')).toBeVisible()
  await expect(row('lib')).toBeVisible()
  await expect(row('b.ts')).toHaveCount(0)
  await row('empty').click()
  await expect(tree()).toContainText('空目录')

  // Viewing never adds a conversation tag.
  await row('a.ts').click()
  await expect(viewer()).toContainText('export const A = 1')
  await expect(fileTags()).toHaveCount(0)
  await capture('files-viewer')

  // Special names are listed and readable.
  for (const [name, text] of [['-dash.txt', 'leading dash'], ['bracket[1]*.txt', 'glob characters'], ['日本語.md', '日本語の内容'], ['emoji-😀.txt', 'emoji name'], ['bad␊name.txt', 'a newline in the name']] as const) {
    await row(name).click()
    await expect(viewer()).toContainText(text)
  }
  await row('docs').click()
  await row('my file.md').click()
  await expect(viewer()).toContainText('spaced name')

  // Failure states come from reason codes, not from raw errors.
  await row('bin.dat').click()
  await expect(viewer()).toContainText('二进制文件')
  await row('latin1.txt').click()
  await expect(viewer()).toContainText('非 UTF-8 编码')
  await row('big.txt').click()
  await expect(viewer()).toContainText('文件过大')
  await row('secret.txt').click()
  await expect(viewer()).toContainText('无权限')
  await expect(row('link-out').locator('.files-row__badge')).toHaveText('链接')
  await row('link-out').click()
  await expect(viewer()).not.toContainText('outside the Project')
  await expect(tree()).not.toContainText('.git')
  await capture('files-failure-states')

  // The watcher refreshes the tree and a deleted file is reported, never shown as stale content.
  put(root, 'src/created-live.ts', 'created while open\n')
  await expect(row('created-live.ts')).toBeVisible({ timeout: 15_000 })
  await row('a.ts').click()
  await expect(viewer()).toContainText('export const A = 1')
  rmSync(join(root, 'src', 'a.ts'))
  await expect(row('a.ts')).toHaveCount(0, { timeout: 15_000 })
  await expect(viewer()).toContainText('文件已不存在')
  await expect(viewer()).not.toContainText('export const A = 1')

  // Switching tools and back keeps expansion and the open file.
  await row('created-live.ts').click()
  await expect(viewer()).toContainText('created while open')
  await workspace().getByRole('button', { name: 'Browser', exact: true }).click()
  await workspace().getByRole('button', { name: 'Files', exact: true }).click()
  await expect(row('created-live.ts')).toBeVisible()
  await expect(viewer()).toContainText('created while open')

  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([])
})

test('FR-TOOL-001 item 4 / FR-INPUT-001: add to the conversation, send through the simulated Provider, keep input on failure', async () => {
  const root = await openProject('Files Project', project => {
    put(project, 'src/a.ts', 'export const A = 1\n')
    put(project, 'src/lib/b.ts', 'export const B = 2\n')
    put(project, '-dash.txt', 'leading dash\n')
    put(project, 'bad\nname.txt', 'a newline in the name\n')
  })
  // A new conversation starts with the right sidebar collapsed; the user opens it from the top bar.
  await workspace().getByRole('button', { name: 'New Chat', exact: true }).first().click()
  await page.getByRole('button', { name: '右侧边栏', exact: true }).click()
  await workspace().getByRole('button', { name: 'Files', exact: true }).click()
  await expect(row('src')).toBeVisible()
  await row('src').click()
  await row('a.ts').click()
  await expect(fileTags()).toHaveCount(0)

  const add = workspace().getByRole('button', { name: '添加到对话', exact: true })
  await add.click()
  await expect(fileTags()).toHaveCount(1)
  await expect(viewer()).toContainText('已添加到对话')
  await add.click()
  await expect(viewer()).toContainText('已在对话中')
  await expect(fileTags()).toHaveCount(1)
  // A tag can be removed and added again; removing it does not touch the file.
  await workspace().getByRole('button', { name: '移除上下文 src/a.ts', exact: true }).click()
  await expect(fileTags()).toHaveCount(0)
  await add.click()
  await expect(fileTags()).toHaveCount(1)
  await capture('files-add-to-conversation')

  // A name with a control character can be viewed but not referenced.
  await row('bad␊name.txt').click()
  await expect(viewer()).toContainText('a newline in the name')
  await add.click()
  await expect(fileTags()).toHaveCount(1)

  // A special name goes through as well; delivery is proven by the simulated reply.
  await row('-dash.txt').click()
  await add.click()
  await expect(fileTags()).toHaveCount(2)
  const message = workspace().getByRole('textbox', { name: '消息', exact: true })
  await message.fill('please review the files')
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().getByText('已收到文件引用：src/a.ts, -dash.txt')).toBeVisible({ timeout: 20_000 })
  await capture('files-reference-delivered')

  // A file that disappears before sending blocks the send and keeps the text and the tags.
  await workspace().getByRole('button', { name: 'Files', exact: true }).click()
  await row('lib').click()
  await row('b.ts').click()
  await add.click()
  await expect(fileTags()).toHaveCount(1)
  rmSync(join(root, 'src', 'lib', 'b.ts'))
  await message.fill('second message')
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().getByText('文件引用失败')).toBeVisible()
  await expect(message).toHaveValue('second message')
  await expect(fileTags()).toHaveCount(1)
  await capture('files-reference-failed-kept')
})
