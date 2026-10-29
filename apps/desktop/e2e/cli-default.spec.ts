import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const appDir = join(__dirname, '..')
let app: ElectronApplication, page: Page, dir: string
const workspace = () => page.locator('.project-workspace:not([hidden])')
async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow()
  await expect(page.getByTestId('topbar')).toBeVisible()
}
async function openProject(name: string) {
  const path = join(dir, name); mkdirSync(path)
  await app.evaluate(({ dialog }, selectedPath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] }) }, path)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
}
test.beforeEach(async () => { dir = mkdtempSync(join(tmpdir(), 'studio-cli-default-')); await launch() })
test.afterEach(async () => { await app?.close(); rmSync(dir, { recursive: true, force: true }) })

test('available CLI works in a second Project without selection; global preference survives restart', async () => {
  await openProject('First')
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill('first draft')
  await expect(workspace().getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
  await workspace().getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: 'CLI', exact: true }).click()
  await page.getByRole('radio', { name: 'Claude Code', exact: true }).click()
  await expect(page.getByText('已应用到所有 Project。')).toBeVisible()
  await page.getByRole('button', { name: '关闭设置' }).click()
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  await openProject('Second')
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill('second draft')
  await expect(workspace().getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
  await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toHaveAttribute('placeholder', '向 Claude Code 发送消息…')
  await app.close(); await launch()
  await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toHaveValue('second draft')
  await expect(workspace().getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
})

test('unavailable CLI links directly to settings; recheck restores sending without clearing draft', async () => {
  // Only availability is simulated as logged out until the user forces a recheck.
  // Project loading, drafts, settings, and all user actions remain real.
  const providers = await page.evaluate(() => window.studio.session.getProviders())
  await app.evaluate(({ ipcMain }, providers) => {
    ipcMain.removeHandler('session:get-providers')
    ipcMain.handle('session:get-providers', (_event, request) => request?.force ? providers : providers.map(p => ({ ...p, status: 'not_logged_in', reason: '请先登录 CLI，然后重新检测' })))
  }, providers)
  await openProject('Recovery')
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill('retain me')
  await expect(workspace().getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '折叠导航' }).click()
  await workspace().getByRole('button', { name: 'CLI 设置' }).click()
  await expect(page.getByRole('button', { name: 'CLI', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '重新检测' }).click()
  await expect(page.getByRole('radio', { name: 'Codex', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '关闭设置' }).click()
  await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toHaveValue('retain me')
  await expect(workspace().getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
})

test('enabled CLI are shared across Projects and restart; disabled entries disappear only from new-chat selectors', async () => {
  await openProject('Enabled')
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill('keep draft')
  await workspace().getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: 'CLI', exact: true }).click()
  await page.getByRole('button', { name: '移除 Codex', exact: true }).click()
  await expect(page.getByRole('button', { name: '添加 Codex', exact: true })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Codex', exact: true })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Claude Code', exact: true })).toBeChecked()
  await page.getByRole('button', { name: '关闭设置' }).click()
  await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toHaveValue('keep draft')
  await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toHaveAttribute('placeholder', '向 Claude Code 发送消息…')
  await workspace().getByRole('button', { name: '选择 CLI' }).click()
  await expect(page.locator('.session-cli-menu').getByRole('button', { name: 'Codex', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await app.close(); await launch()
  await workspace().getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: 'CLI', exact: true }).click()
  await expect(page.getByRole('button', { name: '添加 Codex', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '移除 Claude Code', exact: true }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: '重新检测', exact: true })).toBeDisabled()
  await expect(page.getByRole('radio')).toHaveCount(0)
  await page.getByRole('button', { name: '添加 Codex', exact: true }).click()
  await expect(page.getByRole('button', { name: '重新检测', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '重新检测', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Codex', exact: true })).toBeChecked()
  await page.getByRole('button', { name: '关闭设置' }).click()
  await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toHaveValue('keep draft')
  await expect(workspace().getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
})

test('CLI header action stays fixed with a long list in both themes and colour modes', async () => {
  // Layout-only fixture: additional disabled future providers, never selected or executed.
  const providers = await page.evaluate(() => window.studio.session.getProviders())
  await app.evaluate(({ ipcMain }, providers) => {
    ipcMain.removeHandler('session:get-providers')
    ipcMain.handle('session:get-providers', () => [...providers, ...Array.from({ length: 16 }, (_, i) => ({ ...providers[0], cli: `fixture-${i}`, displayName: `Future CLI ${i + 1}`, status: 'disabled' }))])
  }, providers)
  await openProject('Layout')
  await workspace().getByRole('button', { name: '设置', exact: true }).click()
  for (const theme of ['毛玻璃', '纯色']) for (const mode of ['浅色', '深色']) {
    await page.getByRole('button', { name: '外观', exact: true }).click()
    await page.getByRole('radio', { name: new RegExp(`^${theme}`) }).click()
    await page.getByRole('radio', { name: mode, exact: true }).click()
    await page.getByRole('button', { name: 'CLI', exact: true }).click()
    const refresh = page.getByRole('button', { name: '重新检测', exact: true })
    await expect(refresh).toBeEnabled()
    const before = await refresh.boundingBox()
    const scroller = page.locator('.cli-settings__scroll')
    await scroller.hover(); await page.mouse.wheel(0, 2000)
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    const after = await refresh.boundingBox()
    expect(after!.y).toBe(before!.y); expect(after!.x).toBe(before!.x)
    expect(after!.x).toBeGreaterThan((await page.locator('.cli-settings__header h3').boundingBox())!.x)
    await page.keyboard.press('Tab')
    expect(await page.locator('.settings-dialog').evaluate(element => element.contains(document.activeElement))).toBe(true)
  }
})
