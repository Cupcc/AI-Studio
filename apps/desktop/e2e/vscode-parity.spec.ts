import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { commitAll, initRepo, put } from './git-fixture'
import { closeTestApp } from './quit'

// DEC-25 / FR-TOOL-001～005 (2026-10-26): the tools' VS Code basics against the built app. Session Providers are
// simulated; Terminals run a history-free `zsh -f`; the system Trash is replaced by a move into the test directory.
// Native menus cannot be driven through the DOM: `chooseNativeMenu` makes the next popup pick an item by its label.
const appDir = join(__dirname, '..')
const evidence = process.env.STUDIO_E2E_EVIDENCE_DIR ?? join(appDir, '../../.runtime/desktop-e2e/screenshots/vscode-parity')
let dir: string, app: ElectronApplication, page: Page, server: Server | null = null
const workspace = () => page.locator('.project-workspace:not([hidden])')
const tree = () => workspace().getByRole('tree', { name: '项目文件' })
const viewer = () => workspace().getByRole('region', { name: '文件查看器' })
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (name: string) => tree().locator('.files-row').filter({ has: page.locator('.files-row__name', { hasText: new RegExp(`^${escape(name)}$`) }) })
const tool = (name: string) => workspace().getByRole('button', { name, exact: true })

async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow()
  await expect(page.getByTestId('topbar')).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]!; win.setContentSize(1440, 900); win.show(); win.focus() })
}
async function openProject(name: string, populate: (root: string) => void): Promise<string> {
  const root = join(dir, name); mkdirSync(root); populate(root)
  await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, root)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
  return root
}
async function capture(name: string) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, `W0-${name}.png`) }) }
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
/** Clicks an application-menu item (CDP key events do not reach native menu accelerators). */
async function appMenu(label: string) {
  await app.evaluate(({ Menu }, wanted) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => items.map(item => item.label === wanted ? item : item.submenu ? find(item.submenu.items) : undefined).find(Boolean)
    const item = find(Menu.getApplicationMenu()!.items)
    if (!item) throw new Error(`No application menu item ${wanted}`)
    item.click()
  }, label)
}
async function terminalCommand(text: string) {
  const input = workspace().locator('.xterm-helper-textarea')
  await expect(input).toHaveCount(1)
  await input.focus(); await page.keyboard.insertText(text); await page.keyboard.press('Enter')
}
async function plainShell() {
  await terminalCommand(" exec env PS1='%# ' HISTFILE=/dev/null zsh -f")
  await terminalCommand('echo PLAIN_$((20+22))')
  await expect(workspace().locator('.xterm-rows > div').filter({ hasText: /^PLAIN_42$/ })).toHaveCount(1)
}
/** ⌘+click inside xterm: its screen layer takes the pointer, so the click goes to the row's coordinates. */
async function metaClickRow(rowLocator: ReturnType<Page['locator']>, x: number) {
  const box = (await rowLocator.boundingBox())!
  await page.mouse.move(box.x + x, box.y + box.height / 2)
  await page.waitForTimeout(150)
  await page.keyboard.down('Meta')
  await page.mouse.down(); await page.mouse.up()
  await page.keyboard.up('Meta')
}
async function previewText(): Promise<string> {
  return app.evaluate(async ({ BrowserWindow }) => {
    const view = (BrowserWindow.getAllWindows()[0]!.contentView.children[0] as import('electron').WebContentsView | undefined)?.webContents
    return view ? await view.executeJavaScript('document.body.innerText') as string : ''
  })
}

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'studio vscode parity '))
  await launch()
  // The real Trash is not touched by tests.
  await app.evaluate(({ shell }, trash) => {
    const { mkdirSync: make, renameSync } = process.mainModule!.require('node:fs') as typeof import('node:fs')
    const { basename, join: joinPath } = process.mainModule!.require('node:path') as typeof import('node:path')
    shell.trashItem = async (path: string) => { make(trash, { recursive: true }); renameSync(path, joinPath(trash, `${Date.now()}-${basename(path)}`)) }
  }, join(dir, 'Trash'))
})
test.afterEach(async () => {
  if (app) await closeTestApp(app, page)
  if (server) { await new Promise<void>(resolve => server!.close(() => resolve())); server = null }
  rmSync(dir, { recursive: true, force: true })
})

test('FR-TOOL-001 / DEC-25: explorer context menu, inline new / rename, clipboard, drag, Trash, Git colours and multi-select', async () => {
  const root = await openProject('Explorer Project', project => {
    initRepo(project)
    put(project, '.gitignore', 'dist/\n')
    put(project, 'src/a.ts', 'export const a = 1\n')
    put(project, 'docs/guide.md', '# Guide\n')
    commitAll(project)
    put(project, 'src/a.ts', 'export const a = 2\n')
    put(project, 'src/new.ts', 'untracked\n')
    put(project, 'dist/out.js', 'built\n')
  })
  await tool('Files').click()
  await expect(row('src')).toHaveAttribute('data-git', 'modified')
  await expect(row('dist')).toHaveClass(/is-ignored/)
  await row('src').click()
  await expect(row('a.ts')).toHaveAttribute('data-git', 'modified')
  await expect(row('a.ts').locator('.files-row__git')).toHaveText('M')
  await expect(row('new.ts')).toHaveAttribute('data-git', 'added')
  await capture('explorer-git-colours')

  // Right-click a folder → 新建文件… → the inline name input → the file exists and opens.
  await chooseNativeMenu('新建文件…')
  await row('src').click({ button: 'right' })
  const name = tree().getByRole('textbox', { name: '新文件名' })
  await expect(name).toBeFocused()
  await name.fill('made.ts'); await name.press('Enter')
  await expect.poll(() => existsSync(join(root, 'src/made.ts'))).toBe(true)
  await expect(viewer().locator('.files-viewer__name')).toHaveText('made.ts')

  // F2 renames, selecting the stem like VS Code.
  await row('made.ts').focus(); await page.keyboard.press('F2')
  const rename = tree().getByRole('textbox', { name: '新名称' })
  await expect(rename).toBeFocused()
  await rename.fill('renamed.ts'); await rename.press('Enter')
  await expect.poll(() => existsSync(join(root, 'src/renamed.ts'))).toBe(true)
  await expect(viewer().locator('.files-viewer__name')).toHaveText('renamed.ts')

  // ⌘C / ⌘V next to the original gives the VS Code "copy" name; an existing name is never overwritten.
  await row('renamed.ts').focus(); await page.keyboard.press('Meta+c'); await page.keyboard.press('Meta+v')
  await expect.poll(() => existsSync(join(root, 'src/renamed copy.ts'))).toBe(true)

  // Drag a file onto a folder moves it.
  await row('renamed copy.ts').dragTo(row('docs'))
  await expect.poll(() => existsSync(join(root, 'docs/renamed copy.ts'))).toBe(true)
  expect(existsSync(join(root, 'src/renamed copy.ts'))).toBe(false)

  // Copy relative path from the context menu.
  await chooseNativeMenu('复制相对路径')
  await row('a.ts').click({ button: 'right' })
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('src/a.ts')

  // ⌘-click selects several rows; ⌘⌫ asks before moving them to the Trash.
  await row('renamed.ts').click()
  await row('new.ts').click({ modifiers: ['Meta'] })
  await expect(row('renamed.ts')).toHaveAttribute('aria-selected', 'true')
  await expect(row('new.ts')).toHaveAttribute('aria-selected', 'true')
  await row('new.ts').focus(); await page.keyboard.press('Meta+Backspace')
  const confirm = workspace().getByRole('alertdialog', { name: '将 2 项移到废纸篓？' })
  await expect(confirm).toBeVisible()
  await capture('explorer-delete-confirm')
  await confirm.getByRole('button', { name: '移到废纸篓', exact: true }).click()
  await expect.poll(() => existsSync(join(root, 'src/new.ts')) || existsSync(join(root, 'src/renamed.ts'))).toBe(false)
  await expect(row('new.ts')).toHaveCount(0)
  expect(existsSync(join(dir, 'Trash'))).toBe(true)

  // `.git` is never offered or touched; a new folder from the toolbar.
  await expect(row('.git')).toHaveCount(0)
  await workspace().getByRole('button', { name: '新建文件夹', exact: true }).click()
  const folder = tree().getByRole('textbox', { name: '新文件夹名' })
  await folder.fill('nested/deeper'); await folder.press('Enter')
  await expect.poll(() => existsSync(join(root, 'src/nested/deeper'))).toBe(true)
  await workspace().getByRole('button', { name: '全部折叠', exact: true }).click()
  await expect(row('a.ts')).toHaveCount(0)
})

test('FR-TOOL-001 / FR-TOOL-005: ⌘P Quick Open with :line, Search with options, results open in Files, find in folder', async () => {
  await openProject('Search Project', project => {
    put(project, '.gitignore', 'build/\n')
    put(project, 'src/server/routes.ts', 'const needle = 1\nexport function route() { return needle }\n')
    put(project, 'docs/guide.md', '# Guide\nNeedle in docs\n')
    put(project, 'build/out.js', 'needle in build output\n')
  })
  await appMenu('快速打开文件…')
  const picker = page.getByRole('dialog', { name: '快速打开文件' })
  await expect(picker).toBeVisible()
  await picker.getByRole('combobox').fill('rout:2')
  await expect(picker.getByRole('option').first()).toContainText('routes.ts')
  await capture('quick-open')
  await picker.getByRole('combobox').press('Enter')
  await expect(picker).toHaveCount(0)
  await expect(viewer().locator('.files-viewer__name')).toHaveText('routes.ts')
  await expect(row('server')).toHaveAttribute('aria-expanded', 'true')

  await appMenu('在文件中搜索')
  const search = workspace().getByRole('region', { name: 'Search' })
  const query = search.getByRole('textbox', { name: '搜索' })
  await expect(query).toBeFocused()
  await query.fill('needle')
  await expect(search.getByRole('status').first()).toHaveText('在 2 个文件中找到 3 个结果')
  await expect(search.getByText('out.js')).toHaveCount(0)
  await search.getByRole('button', { name: /区分大小写/ }).click()
  await expect(search.getByRole('status').first()).toHaveText('在 1 个文件中找到 2 个结果')
  await capture('search-results')
  await search.locator('.search-match').first().click()
  await expect(viewer().locator('.files-viewer__name')).toHaveText('routes.ts')

  // Files → 在文件夹中查找… puts the folder into "包含的文件".
  await chooseNativeMenu('在文件夹中查找…')
  await row('docs').click({ button: 'right' })
  await expect(search.getByRole('textbox', { name: '包含的文件' })).toHaveValue('docs')
  await search.getByRole('button', { name: /区分大小写/ }).click()
  await expect(search.getByRole('status').first()).toHaveText('在 1 个文件中找到 1 个结果')
  await query.fill('(unclosed')
  await search.getByRole('button', { name: /使用正则表达式/ }).click()
  await expect(search.getByRole('alert')).toContainText('搜索条件无效')
})

test('FR-TOOL-002 / DEC-25: Diff stays read-only with tree view, inline toggle, change navigation and open in Files', async () => {
  await openProject('Diff Project', project => {
    initRepo(project)
    put(project, 'src/a.ts', Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') + '\n')
    put(project, 'README.md', 'readme\n')
    commitAll(project)
    put(project, 'src/a.ts', Array.from({ length: 40 }, (_, i) => i === 3 || i === 30 ? `changed ${i}` : `line ${i}`).join('\n') + '\n')
  })
  await tool('Diff').click()
  await workspace().getByRole('button', { name: '以树形查看', exact: true }).click()
  await expect(workspace().locator('.diff-group__label')).toContainText('src')
  await workspace().getByRole('option', { name: /a\.ts/ }).click()
  const tools = workspace().getByRole('toolbar', { name: '对比视图' })
  await expect(tools).toBeVisible()
  await tools.getByRole('button', { name: '行内显示', exact: true }).click()
  await expect(tools.getByRole('button', { name: '行内显示', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await tools.getByRole('button', { name: '下一处变更', exact: true }).click()
  await capture('diff-inline-tree')
  for (const action of ['暂存', 'Stage', '提交', 'Commit', '放弃', 'Discard']) await expect(workspace().getByRole('button', { name: action, exact: true })).toHaveCount(0)
  await workspace().getByRole('button', { name: '在 Files 中打开', exact: true }).click()
  await expect(viewer().locator('.files-viewer__name')).toHaveText('a.ts')
})

test('FR-TOOL-004 / DEC-25: ⌘-click links to Browser and Files, find, ⌘K clear, rename and open a Terminal in a folder', async () => {
  server = createServer((_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<h1>Linked preview</h1>') })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  const root = await openProject('Terminal Project', project => { put(project, 'src/app.ts', 'one\ntwo\nthree\n') })
  await tool('Terminal').click()
  await expect(workspace().getByRole('tab', { name: 'Terminal 1', exact: true })).toBeVisible()
  await plainShell()
  await terminalCommand(`printf '%s\\n' 'src/app.ts:3' '${url}'`)
  const fileRow = workspace().locator('.xterm-rows > div').filter({ hasText: /^src\/app\.ts:3$/ })
  await expect(fileRow).toHaveCount(1)
  await metaClickRow(fileRow, 20)
  await expect(viewer().locator('.files-viewer__name')).toHaveText('app.ts')

  await tool('Terminal').click()
  const linkRow = workspace().locator('.xterm-rows > div').filter({ hasText: new RegExp(`^${escape(url)}$`) })
  await expect(linkRow).toHaveCount(1)
  await metaClickRow(linkRow, 30)
  await expect.poll(previewText).toContain('Linked preview')
  await expect(workspace().getByRole('combobox', { name: '网址', exact: true })).toHaveValue(url)

  await tool('Terminal').click()
  await workspace().locator('.xterm-helper-textarea').focus()
  await page.keyboard.press('Meta+f')
  const find = workspace().getByRole('search', { name: '在终端中查找' })
  await expect(find.getByRole('textbox', { name: '查找' })).toBeFocused()
  await find.getByRole('textbox', { name: '查找' }).fill('PLAIN')
  await expect(find.getByText('无结果')).toHaveCount(0)
  await capture('terminal-find')
  await find.getByRole('textbox', { name: '查找' }).press('Escape')
  await expect(find).toHaveCount(0)

  // ⌘K clears here and in the Project-held screen: hiding and showing the Terminal does not bring the text back.
  await workspace().locator('.xterm-helper-textarea').focus()
  await page.keyboard.press('Meta+k')
  await expect(workspace().locator('.xterm-rows')).not.toContainText('PLAIN_42')
  await tool('Files').click(); await tool('Terminal').click()
  await expect(workspace().locator('.xterm-rows')).not.toContainText('PLAIN_42')

  // Double-click renames the tab.
  await workspace().getByRole('tab', { name: 'Terminal 1', exact: true }).dblclick()
  const title = workspace().getByRole('textbox', { name: '终端名称' })
  await title.fill('dev server'); await title.press('Enter')
  await expect(workspace().getByRole('tab', { name: 'dev server', exact: true })).toBeVisible()

  // Files → 在集成终端中打开 starts a new Terminal in that folder.
  await tool('Files').click()
  await chooseNativeMenu('在集成终端中打开')
  await row('src').click({ button: 'right' })
  await expect(workspace().getByRole('tab', { name: 'Terminal 2', exact: true })).toHaveAttribute('aria-selected', 'true')
  await plainShell()
  await terminalCommand('pwd')
  await expect(workspace().locator('.xterm-rows')).toContainText(join(root, 'src'))
  expect(readFileSync(join(root, 'src/app.ts'), 'utf8')).toBe('one\ntwo\nthree\n')
})

test('FR-TOOL-003 step 3: popups open as tabs, tabs switch and close, favorites and history suggest, site permission prompt', async () => {
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html')
    if (request.url === '/second') { response.end('<title>Second page</title><h1>Second page</h1>'); return }
    if (request.url === '/notify') { response.end('<title>Notify</title><button onclick="Notification.requestPermission().then(r=>document.body.dataset.answer=r)">Ask</button>'); return }
    response.end('<title>First page</title><h1>First page</h1><a href="/second" target="_blank">Open second</a>')
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  await openProject('Tabs Project', () => {})
  await tool('Browser').click()
  const address = workspace().getByRole('combobox', { name: '网址', exact: true })
  await address.fill(base); await address.press('Enter')
  await expect.poll(previewText).toContain('First page')
  const preview = () => app.context().pages().find(candidate => candidate.url() === base)
  await preview()!.evaluate(() => (document.querySelector('a[target=_blank]') as HTMLAnchorElement).click())
  const tabs = workspace().getByRole('tablist', { name: 'Browser 标签页' })
  await expect(tabs.getByRole('tab')).toHaveCount(2)
  await expect.poll(previewText).toContain('Second page')
  await expect(tabs.getByRole('tab', { name: 'Second page' })).toHaveAttribute('aria-selected', 'true')
  await tabs.getByRole('tab', { name: 'First page' }).click()
  await expect.poll(previewText).toContain('First page')
  await workspace().getByRole('button', { name: '收藏此页', exact: true }).click()
  await expect(workspace().getByRole('button', { name: '取消收藏', exact: true })).toBeVisible()
  await capture('browser-tabs')
  await tabs.getByRole('button', { name: '关闭标签页 Second page' }).click()
  await expect(tabs).toHaveCount(0)

  // Typing suggests the favorite first, then history.
  await address.click(); await address.fill('127.0.0.1')
  const suggestions = workspace().getByRole('listbox', { name: '网址建议' })
  await expect(suggestions.getByRole('option').first()).toContainText('First page')
  await expect(suggestions.getByRole('option')).toHaveCount(2)
  await capture('browser-suggestions')
  await address.press('Escape')
  await expect(suggestions).toHaveCount(0)

  // A permission request is asked once per site and remembered.
  await address.fill(`${base}notify`); await address.press('Enter')
  await expect.poll(previewText).toContain('Ask')
  const notify = app.context().pages().find(candidate => candidate.url() === `${base}notify`)!
  await notify.evaluate(() => (document.querySelector('button') as HTMLButtonElement).click())
  const prompt = workspace().getByRole('alertdialog', { name: '网站请求权限' })
  await expect(prompt).toContainText('显示通知')
  await capture('browser-permission')
  await prompt.getByRole('button', { name: '拒绝', exact: true }).click()
  await expect(prompt).toHaveCount(0)
  await expect.poll(() => notify.evaluate(() => document.body.dataset.answer)).toBe('denied')
  await notify.evaluate(() => { delete document.body.dataset.answer; (document.querySelector('button') as HTMLButtonElement).click() })
  await expect.poll(() => notify.evaluate(() => document.body.dataset.answer)).toBe('denied')
  await expect(prompt).toHaveCount(0)
})

test('FR-TOOL-004 step 3: ⌘\\ splits the Terminal side by side, panes keep their own shells and output', async () => {
  await openProject('Split Project', () => {})
  await tool('Terminal').click()
  await expect(workspace().getByRole('tab', { name: 'Terminal 1', exact: true })).toBeVisible()
  await plainShell()
  await terminalCommand('echo LEFT_$((1+1))')
  await workspace().getByRole('button', { name: '拆分终端', exact: true }).click()
  const panes = workspace().locator('.terminal-group.is-split > .terminal-panel')
  await expect(panes).toHaveCount(2)
  await expect(workspace().getByRole('tab', { name: 'Terminal 2', exact: true })).toHaveAttribute('aria-selected', 'true')
  const second = panes.nth(1).locator('.xterm-helper-textarea')
  await second.focus(); await page.keyboard.insertText(" exec env PS1='%# ' HISTFILE=/dev/null zsh -f"); await page.keyboard.press('Enter')
  await page.keyboard.insertText('echo RIGHT_$((2+2))'); await page.keyboard.press('Enter')
  await expect(panes.nth(1).locator('.xterm-rows')).toContainText('RIGHT_4')
  await expect(panes.nth(0).locator('.xterm-rows')).toContainText('LEFT_2')
  await expect(panes.nth(0).locator('.xterm-rows')).not.toContainText('RIGHT_4')
  await capture('terminal-split')
  // Hidden and shown again, both panes keep their output; closing one leaves its neighbour focused.
  await tool('Files').click(); await tool('Terminal').click()
  await expect(panes.nth(0).locator('.xterm-rows')).toContainText('LEFT_2')
  await workspace().getByRole('button', { name: '关闭 Terminal 2', exact: true }).click()
  await workspace().getByRole('button', { name: '结束并关闭', exact: true }).click()
  await expect(workspace().getByRole('tab', { name: 'Terminal 1', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(workspace().locator('.terminal-group.is-split')).toHaveCount(0)
})
