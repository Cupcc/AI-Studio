import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

// Simulated native records. Real native coverage is verified separately against a versioned CLI.
const appDir = join(__dirname, '..')
let dir: string, app: ElectronApplication, page: Page
const workspace = () => page.locator('.project-workspace:not([hidden])')
const panel = () => workspace().getByRole('region', { name: '本轮变更', exact: true })
async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow()
  await expect(page.getByTestId('topbar')).toBeVisible()
  await app.evaluate(({ app, BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]!; win.setContentSize(1280, 800); app.focus({ steal: true }); win.show(); win.focus() })
}
async function openProject(root: string) {
  await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, root)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
}
async function newChat() {
  await workspace().getByRole('button', { name: '选择 CLI', exact: true }).click()
  await workspace().locator('.session-cli-menu').getByRole('button', { name: 'Codex CLI', exact: false }).first().click()
}
async function send(text: string) {
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill(text)
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
}

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'studio turn diff '))
  const root = join(dir, 'Native Diff Project'); mkdirSync(root); writeFileSync(join(root, 'native.txt'), 'before\n')
  await launch(); await openProject(root); await newChat()
})
test.afterEach(async () => { await app?.close().catch(() => {}); rmSync(dir, { recursive: true, force: true }) })

test('saved native patch survives working-tree edits and restart; toolbar explicitly returns to project scope', async () => {
  await send('[e2e:diff] Keep this native history')
  await expect(workspace().getByText('模拟原生补丁已保存。', { exact: true })).toBeVisible()
  await expect(panel()).toHaveCount(0) // Native events cannot open a tool.
  await workspace().getByRole('button', { name: '查看本轮变更', exact: true }).click()
  await expect(panel()).toContainText('+saved-version')
  await expect(panel()).not.toContainText('+obsolete snapshot')
  await expect(panel()).toContainText('Shell')
  writeFileSync(join(dir, 'Native Diff Project', 'native.txt'), 'changed-afterwards\n')
  await panel().getByRole('combobox', { name: '原生补丁范围' }).selectOption('0')
  await expect(panel()).toContainText('补丁记录不代表写入成功')
  await expect(panel()).toContainText('+saved-version')
  await workspace().getByRole('button', { name: 'Diff', exact: true }).click()
  await expect(workspace().getByRole('region', { name: '项目变更', exact: true })).toContainText('此目录不是 Git 仓库')
  await workspace().getByRole('button', { name: '查看本轮变更', exact: true }).click()
  await expect(panel()).toContainText('+saved-version')
  await app.close(); await launch()
  await workspace().getByRole('button', { name: '查看本轮变更', exact: true }).click()
  await expect(panel()).toContainText('+saved-version')
  await expect(panel()).not.toContainText('changed-afterwards')
})

test('unknown and explicit empty records remain distinct and do not replace a selected older turn', async () => {
  await send('[e2e:diff] First native turn')
  await workspace().getByRole('button', { name: '查看本轮变更', exact: true }).click()
  await expect(panel()).toContainText('+saved-version')
  await send('A later turn with no native record')
  await expect(workspace().getByRole('button', { name: '查看本轮变更', exact: true })).toHaveCount(2)
  await expect(panel()).toContainText('+saved-version')
  await workspace().getByRole('button', { name: '查看本轮变更', exact: true }).nth(1).click()
  await expect(panel()).toContainText('没有取得原生聚合补丁')
  await expect(panel()).not.toContainText('0 个文件')
  await send('[e2e:diff-empty] Explicitly empty native record')
  await expect(workspace().getByRole('button', { name: '查看本轮变更', exact: true })).toHaveCount(3)
  await workspace().getByRole('button', { name: '查看本轮变更', exact: true }).nth(2).click()
  await expect(panel()).toContainText('CLI 原生记录为空')
  await expect(panel()).toContainText('不代表共享工作区没有变更')
})

test('failed and interrupted turns keep their saved native records and actual outcomes', async () => {
  await send('[e2e:diff-failed] Failed after a native patch')
  await expect(workspace().getByRole('region', { name: '执行错误', exact: true })).toBeVisible()
  await workspace().getByRole('button', { name: '查看本轮变更', exact: true }).click()
  await expect(panel()).toContainText('+saved-version')
  await expect(panel()).toContainText('执行失败')
  await newChat(); await send('[e2e:diff-interrupted] Interrupted after a native patch')
  await workspace().getByRole('button', { name: '查看本轮变更', exact: true }).click()
  await expect(panel()).toContainText('+saved-version')
  await expect(panel()).toContainText('已停止')
})
