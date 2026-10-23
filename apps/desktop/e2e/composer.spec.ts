import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { StudioApi } from '../src/shared/ipc/contracts'

const appDir = join(__dirname, '..')
let app: ElectronApplication, page: Page, dir: string
const workspace = () => page.locator('.project-workspace:not([hidden])')
const input = () => workspace().getByLabel('消息', { exact: true })
const effort = () => workspace().getByRole('button', { name: 'Reasoning Effort', exact: true })
const panel = () => workspace().locator('.composer__effort-control .composer__control-panel')
async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user-data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('topbar')).toBeVisible()
}
async function selectEffort(value: string) { await effort().click(); await panel().getByRole('button', { name: value, exact: true }).click() }
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'studio-composer-'))
  const project = join(dir, 'Project'); mkdirSync(join(project, 'src'), { recursive: true })
  mkdirSync(join(project, 'source files'))
  writeFileSync(join(project, 'source files', 'entry.ts'), 'export const spaced = true\n')
  writeFileSync(join(project, 'README.md'), '# Fixture\n'); writeFileSync(join(project, 'src', 'app.ts'), 'export const ready = true\n')
  await launch()
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, project)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await workspace().getByRole('button', { name: '选择 CLI', exact: true }).click()
  await workspace().locator('.session-cli-menu').getByRole('button', { name: 'Codex CLI', exact: false }).first().click()
  await expect(effort()).toBeEnabled()
})
test.afterEach(async () => { await app?.close(); rmSync(dir, { recursive: true, force: true }) })

test('v06 effort keyboard, max / ultra motion, four appearances and reduced motion', async () => {
  await effort().focus(); await effort().press('ArrowDown'); await page.keyboard.press('End')
  await expect(panel().getByRole('button', { name: 'ultra', exact: true })).toBeFocused()
  await page.keyboard.press('Escape'); await expect(effort()).toBeFocused(); await expect(panel()).toHaveCount(0)
  for (const theme of ['glass', 'solid'] as const) for (const mode of ['light', 'dark'] as const) {
    // Appearance setup only; effort selection is always through the UI.
    await page.evaluate(async ({ theme, mode }) => { const api = window.studio as StudioApi; await api.settings.setTheme({ theme }); await api.settings.setMode({ mode }) }, { theme, mode })
    for (const value of ['max', 'ultra']) {
      await selectEffort(value)
      await expect(effort()).toHaveAttribute('aria-description', `思考强度 · ${value}`)
      const bar = effort().locator('.effort-signal i').first()
      await expect.poll(() => bar.evaluate(node => getComputedStyle(node).animationName)).toBe(`effort-${value}-wave`)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect.poll(() => bar.evaluate(node => getComputedStyle(node).animationName)).toBe('none')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }
  }
  await input().fill('Persist ultra'); await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
  await expect(effort()).toHaveAttribute('aria-description', '思考强度 · ultra')
  await app.close(); await launch()
  await expect(effort()).toHaveAttribute('aria-description', '思考强度 · ultra')
  await workspace().getByRole('button', { name: 'Model Selector', exact: true }).click()
  await workspace().getByRole('button', { name: 'E2E Alternate', exact: true }).click()
  await expect(workspace().getByText('“ultra”不在当前模型目录中。')).toBeVisible()
  await workspace().getByRole('button', { name: '使用默认', exact: true }).click()
  await expect(effort()).toHaveCount(0)
})

test('v06 real file candidates, deleted-file recovery, slash boundary and Add grouping', async () => {
  await input().fill('@READ')
  const readme = workspace().getByRole('option', { name: /README.md/ })
  await expect(readme).toBeVisible()
  rmSync(join(dir, 'Project', 'README.md'))
  await readme.click()
  await expect(workspace().getByText('文件已不可用，请从 Files 重新选择。')).toBeVisible()
  await expect(input()).toHaveValue('@READ')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1024, 640))
  await input().fill('line\n'.repeat(7) + '@src/')
  await expect(workspace().getByRole('option', { name: /app.ts/ })).toBeVisible()
  const suggestionTop = await workspace().locator('.composer__suggestions').evaluate(node => node.getBoundingClientRect().top)
  expect(suggestionTop).toBeGreaterThanOrEqual(88)
  await input().fill('@src/')
  await workspace().getByRole('option', { name: /app.ts/ }).click()
  await expect(input()).toHaveValue('')
  await expect(workspace().locator('.composer__tag')).toContainText('app.ts')
  await input().fill('@source')
  await workspace().getByRole('option', { name: /source files/ }).click()
  await expect(input()).toHaveValue('@source files/')
  await workspace().getByRole('option', { name: /entry.ts/ }).click()
  await expect(workspace().locator('.composer__tag')).toHaveCount(2)
  await input().fill('/review')
  await expect(workspace().getByText('当前 CLI 未提供命令目录，Esc 后可继续输入。')).toBeVisible()
  await input().press('Enter'); await expect(workspace().locator('.transcript-user')).toHaveCount(0)
  await input().press('Escape'); await input().fill('Check referenced file')
  await workspace().getByRole('button', { name: 'Context / Attachment', exact: true }).click()
  const add = workspace().locator('.composer__add-control .composer__control-panel')
  await expect(add.getByText('文件', { exact: true })).toBeVisible()
  await expect(add.getByText('Skills', { exact: true })).toBeVisible()
  await expect(add.getByText('Plugins', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().locator('.markdown')).toContainText('已收到文件引用：src/app.ts, source files/entry.ts')
})
