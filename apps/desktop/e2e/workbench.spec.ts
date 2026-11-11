import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { closeTestApp } from './quit'

const appDir = join(__dirname, '..')
let dir: string, projectPath: string, app: ElectronApplication, page: Page
const workspace = () => page.locator('.project-workspace:not([hidden])')
const plugin = () => page.frameLocator('iframe[title="工作台页面"]')
async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user-data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
}
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'studio-workbench-')); projectPath = join(dir, 'Workbench Project'); mkdirSync(projectPath)
  await launch()
  await app.evaluate(({ dialog, app, BrowserWindow }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    app.focus({ steal: true }); BrowserWindow.getAllWindows()[0]!.focus()
  }, projectPath)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
})
test.afterEach(async () => { await closeTestApp(app, page); rmSync(dir, { recursive: true, force: true }) })
async function template() {
  await workspace().getByRole('button', { name: '添加工作台', exact: true }).click()
  await workspace().getByRole('button', { name: /从简单模板开始/ }).click()
  await expect(plugin().getByRole('heading', { name: '随手记', exact: true })).toBeVisible()
  await expect(workspace().getByRole('button', { name: '添加至当前项目', exact: true })).toBeEnabled()
}

test('AC-WB mechanism: template, state, navigation, disable/reopen and restart', async () => {
  const navigation = workspace().getByRole('region', { name: '工作台', exact: true })
  await expect(navigation).toHaveCount(1)
  for (const title of ['Overview', 'Progress', 'Architecture', 'Agent Team', 'Business Flow']) {
    await expect(navigation.getByRole('button', { name: title, exact: true })).toBeVisible()
  }
  await expect(workspace().getByRole('heading', { name: 'PROJECT VIEWS', exact: true })).toHaveCount(0)
  expect(existsSync(join(projectPath, '.ai-studio'))).toBe(false)
  await navigation.getByRole('button', { name: 'Business Flow', exact: true }).click()
  await expect(plugin().getByRole('button', { name: '生成 Business Flow', exact: true })).toBeVisible()
  await expect(workspace().getByRole('region', { name: '工作台对话', exact: true })).toBeVisible()
  expect(existsSync(join(projectPath, '.ai-studio'))).toBe(false)
  await template()
  await expect(workspace().locator('[data-session-row]')).toHaveCount(0)
  await workspace().getByRole('button', { name: '添加至当前项目', exact: true }).click()
  await expect(workspace().getByRole('region', { name: '工作台实例', exact: true })).toBeVisible()
  await expect(navigation.getByRole('button', { name: '随手记', exact: true })).toBeVisible()
  await plugin().getByRole('button', { name: '增加一次', exact: true }).click()
  await expect(plugin().getByLabel('计数', { exact: true })).toHaveText('1')
  await plugin().getByRole('textbox', { name: '笔记', exact: true }).fill('已保存的项目笔记')
  await plugin().getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect(workspace().locator('.workbench-status__saved')).toHaveText('已保存')
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill('已有草稿')
  await plugin().getByRole('button', { name: '填入对话', exact: true }).click()
  await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toContainText('已有草稿')
  await expect(workspace().locator('[data-session-row]')).toHaveCount(0)
  await workspace().getByRole('button', { name: 'Overview', exact: true }).click()
  await expect(plugin().getByRole('button', { name: '生成 Overview', exact: true })).toBeVisible()
  await workspace().getByRole('button', { name: '随手记', exact: true }).click()
  await expect(plugin().getByRole('textbox', { name: '笔记', exact: true })).toHaveValue('已保存的项目笔记')
  await workspace().getByRole('button', { name: '停用工作台', exact: true }).click()
  await expect(page.locator('iframe[title="工作台页面"]')).toHaveCount(0)
  await expect(workspace().getByRole('heading', { name: '此工作台已停用' })).toBeVisible()
  await workspace().getByRole('button', { name: '启用工作台', exact: true }).click()
  await expect(plugin().getByLabel('计数', { exact: true })).toHaveText('1')
  await page.screenshot({ path: test.info().outputPath('workbench-ready.png') })
  await closeTestApp(app, page); await launch()
  await expect(plugin().getByRole('textbox', { name: '笔记', exact: true })).toHaveValue('已保存的项目笔记')
  await expect(plugin().getByLabel('计数', { exact: true })).toHaveText('1')
  await expect(workspace().locator('[data-session-row]')).toHaveCount(0)
})

test('AC-WB mechanism: isolated edit preview, actionable errors and applying one instance', async () => {
  await template()
  await workspace().getByRole('button', { name: '添加至当前项目', exact: true }).click()
  await plugin().getByRole('button', { name: '增加一次', exact: true }).click()
  await expect(plugin().getByLabel('计数', { exact: true })).toHaveText('1')
  const draftsDir = join(projectPath, '.ai-studio/workbench/drafts')
  const beforeEditing = new Set(readdirSync(draftsDir))
  await workspace().getByRole('button', { name: '编辑工作台', exact: true }).click()
  await expect(workspace().getByRole('button', { name: '应用更改', exact: true })).toBeEnabled()
  const editId = readdirSync(draftsDir).find(id => !beforeEditing.has(id))!
  const draftPath = join(draftsDir, editId)
  // Local-file fixture models CLI file edits; real CLI creation is checked separately.
  const manifestPath = join(draftPath, 'manifest.json'), original = readFileSync(manifestPath, 'utf8')
  writeFileSync(manifestPath, '{ invalid')
  await workspace().getByRole('button', { name: '刷新工作台预览', exact: true }).click()
  await expect(workspace().getByRole('alert')).toContainText('无法预览工作台')
  await workspace().getByRole('button', { name: '将错误填入对话', exact: true }).click()
  await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toContainText('工作台预览失败')
  writeFileSync(manifestPath, original)
  const htmlPath = join(draftPath, 'index.html'), originalHtml = readFileSync(htmlPath, 'utf8')
  expect(originalHtml).toContain('<h1>随手记</h1>')
  writeFileSync(htmlPath, originalHtml.replace('<h1>随手记</h1>', '<h1>我的项目笔记</h1>'))
  await workspace().getByRole('button', { name: '重试预览', exact: true }).click()
  await expect(workspace().getByRole('button', { name: '应用更改', exact: true })).toBeEnabled()
  await expect(plugin().getByRole('heading', { name: '我的项目笔记', exact: true })).toBeVisible()
  await plugin().getByRole('button', { name: '增加一次', exact: true }).click()
  await workspace().getByRole('button', { name: '随手记', exact: true }).click()
  await expect(plugin().getByRole('heading', { name: '随手记', exact: true })).toBeVisible()
  await expect(plugin().getByRole('heading', { name: '我的项目笔记', exact: true })).toHaveCount(0)
  await expect(plugin().getByLabel('计数', { exact: true })).toHaveText('1')
  await workspace().getByRole('region', { name: '工作台', exact: true }).getByRole('button', { name: '草稿：随手记', exact: true }).last().click()
  await workspace().getByRole('button', { name: '应用更改', exact: true }).click()
  await expect(plugin().getByRole('heading', { name: '我的项目笔记', exact: true })).toBeVisible()
  await expect(plugin().getByLabel('计数', { exact: true })).toHaveText('1')
})

test('AC-WB mechanism: refuses to apply files changed after the displayed preview', async () => {
  await template()
  const draftsDir = join(projectPath, '.ai-studio/workbench/drafts')
  const draftId = readdirSync(draftsDir)[0]!
  const htmlPath = join(draftsDir, draftId, 'index.html')
  writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace('<h1>随手记</h1>', '<h1>未预览的修改</h1>'))
  await workspace().getByRole('button', { name: '添加至当前项目', exact: true }).click()
  await expect(workspace().getByRole('alert')).toContainText('刷新')
  await expect(workspace().getByRole('region', { name: '工作台实例', exact: true })).toHaveCount(0)
  await workspace().getByRole('button', { name: '重试预览', exact: true }).click()
  await expect(plugin().getByRole('heading', { name: '未预览的修改', exact: true })).toBeVisible()
  await workspace().getByRole('button', { name: '添加至当前项目', exact: true }).click()
  await expect(workspace().getByRole('region', { name: '工作台实例', exact: true })).toBeVisible()
  await expect(plugin().getByRole('heading', { name: '未预览的修改', exact: true })).toBeVisible()
})
