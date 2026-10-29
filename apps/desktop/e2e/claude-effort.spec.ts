import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

// T20261026-claude-adapt: Claude reports its own effort levels (no `ultra`); the menu must follow that catalog.
const appDir = join(__dirname, '..')
let app: ElectronApplication, page: Page, dir: string
const workspace = () => page.locator('.project-workspace:not([hidden])')
const effort = () => workspace().getByRole('button', { name: 'Reasoning Effort', exact: true })
const panel = () => workspace().locator('.composer__effort-control .composer__control-panel')

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'studio-claude-effort-'))
  const project = join(dir, 'Project'); mkdirSync(project)
  // Exercise the opt-in collision guard: E2E providers must win over the real
  // Claude development provider when both environment switches are present.
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user-data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1', STUDIO_ENABLE_CLAUDE_CODE: '1' } })
  page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('topbar')).toBeVisible()
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, project)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await workspace().getByRole('button', { name: '选择 CLI', exact: true }).click()
  await workspace().locator('.session-cli-menu').getByRole('button', { name: 'Claude Code', exact: false }).first().click()
})
test.afterEach(async () => { await app?.close(); rmSync(dir, { recursive: true, force: true }) })

test('FR-INPUT-001: a default Claude draft offers exactly the levels its catalog reports, and the choice follows the Session', async () => {
  await expect(effort()).toBeEnabled()
  await effort().click()
  await expect(panel().locator('.composer__effort-option')).toHaveText(['low', 'medium', 'high', 'xhigh', 'max'])
  await panel().getByRole('button', { name: 'low', exact: true }).click()
  await expect(effort()).toHaveAttribute('aria-description', '思考强度 · low')
  await workspace().getByLabel('消息', { exact: true }).fill('Claude effort follows the Session')
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
  await expect(effort()).toHaveAttribute('aria-description', '思考强度 · low')
  await effort().click(); await panel().getByRole('button', { name: 'max', exact: true }).click()
  await expect(effort()).toHaveAttribute('aria-description', '思考强度 · max')
})
