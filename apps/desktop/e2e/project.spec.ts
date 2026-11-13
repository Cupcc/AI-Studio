import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { launchElectron, showTool } from './harness'
import { closeTestApp } from './quit'

const appDir = join(__dirname, '..')
const evidence = process.env.STUDIO_E2E_EVIDENCE_DIR ?? join(appDir, '../../.runtime/desktop-e2e/screenshots')
let dir: string, app: ElectronApplication, page: Page
async function launch() {
  app = await launchElectron({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('topbar')).toBeVisible()
  // Geometry below uses the default glass theme, independent of the host setting.
  await app.evaluate(({ nativeTheme }) => {
    Object.defineProperty(nativeTheme, 'prefersReducedTransparency', { configurable: true, get: () => false })
    nativeTheme.emit('updated')
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'glass')
}
async function pickDirectory(path: string, expectedError?: string) {
  // Replace only the native chooser; validation, identity, IPC and UI remain real.
  await app.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, path)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  // A click accepts the asynchronous open; wait for its visible result before
  // a following new-Tab action can reuse the originating launcher.
  if (expectedError) await expect(page.getByRole('alert')).toContainText(expectedError)
  else await expect(page.getByRole('tab', { name: basename(realpathSync(path)), exact: true })).toHaveAttribute('aria-selected', 'true')
}
const workspace = () => page.locator('.project-workspace:not([hidden])')
async function resize(width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(size.width, size.height), { width, height })
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width)
}
/** `nav`: whether the navigation shows; a workbench beside the tool sidebar collapses it below 1440 (DEC-33). */
async function capture(mode: string, width: number, height: number, nav = true) {
  await resize(width, height)
  await expect(workspace().locator('.navigation')).toHaveCount(nav ? 1 : 0)
  await expect.poll(() => workspace().locator('.canvas-header').first().evaluate((el) => el.getBoundingClientRect().height)).toBe(48)
  // Pane widths follow a ResizeObserver measurement of the workspace, so they settle a render after the window.
  await expect.poll(() => workspace().evaluate((el) => el.scrollWidth)).toBe(width)
  const dims = await workspace().evaluate((el) => {
    const width = (selector: string) => el.querySelector(selector)?.getBoundingClientRect().width ?? null
    return {
      conversation: width('.conversation-pane'), workbench: width('.workbench-pane'), right: width('.right-pane'),
      overlay: !!el.querySelector('.canvas-mode--overlay'), total: el.scrollWidth, window: innerWidth
    }
  })
  expect(dims.total).toBe(dims.window)
  expect(dims.conversation).toBeGreaterThanOrEqual(mode === 'view' ? 360 : 400)
  expect(dims.right).toBeGreaterThanOrEqual(320)
  if (mode === 'view') expect(dims.workbench).toBeGreaterThanOrEqual(400)
  await page.screenshot({ path: join(evidence, `project-${mode}-${width}.png`) })
  return dims
}
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'studio projects ')); mkdirSync(evidence, { recursive: true }); await launch()
})
test.afterEach(async () => { if (app) await closeTestApp(app, page); rmSync(dir, { recursive: true, force: true }) })

test('FR-PROJ-001/003, FR-NAV-001/002 · AC-01: three isolated Projects, tabs, tools, layouts and relaunch', async () => {
  const paths = ['Alpha', 'Beta', 'Gamma'].map((name) => { const p = join(dir, name); mkdirSync(p); return p })
  await expect(page.getByRole('tab', { name: '新标签页' })).toBeVisible()
  await expect(page.locator('.project-tab__close')).toBeDisabled()
  await expect(page.getByRole('button', { name: '右侧边栏' })).toBeDisabled()
  await pickDirectory(paths[0]!)
  await expect(page.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true')
  await workspace().getByRole('button', { name: '架构', exact: true }).click()
  await showTool(page, 'Terminal')
  // At the default 1280 the workbench and the tool sidebar do not fit beside the navigation, which collapses for them.
  await expect(page.getByRole('button', { name: '展开导航' })).toBeVisible()
  await expect(workspace().getByRole('region', { name: '工作台页面', exact: true })).toBeVisible()
  await workspace().getByRole('separator', { name: '调整对话列宽度' }).focus()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  await expect(page.getByRole('tab', { name: '新标签页' })).toHaveCount(1)
  await pickDirectory(paths[1]!)
  await workspace().getByRole('button', { name: '新对话', exact: true }).first().click()
  await page.getByRole('button', { name: '右侧边栏' }).click()
  await showTool(page, 'Diff')
  await workspace().getByRole('separator', { name: '调整右侧边栏宽度' }).focus()
  await page.keyboard.press('ArrowLeft')
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  await pickDirectory(paths[2]!)
  await workspace().getByRole('button', { name: '进度', exact: true }).click()
  await page.getByRole('tab', { name: 'Alpha' }).click()
  await expect(workspace().getByRole('tab', { name: 'Terminal 1', exact: true })).toBeVisible()
  await expect(workspace().getByRole('button', { name: 'Terminal', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // The default glass appearance leaves its 8px canvas gutter (Shell Spec v02 §12), on the left too once the navigation is hidden.
  const gutter = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--canvas-gutter')))
  expect(gutter).toBe(8)
  // 1024: 1008 wide without the navigation is less than 360 + 400 + 320, so the sidebar floats over the workbench.
  expect(await capture('view', 1024, 640, false)).toMatchObject({ overlay: true, conversation: 450, workbench: 1024 - 2 * gutter - 450, right: 400 })
  // 1280: the four columns fit once the navigation is collapsed; the workbench takes the rest.
  expect(await capture('view', 1280, 800, false)).toMatchObject({ overlay: false, conversation: 450, workbench: 1280 - 2 * gutter - 450 - 400, right: 400 })
  // 1440: all four fit; the workbench shrinks to its minimum first, then the sidebar gives way.
  expect(await capture('view', 1440, 900)).toMatchObject({ overlay: false, conversation: 450, workbench: 400, right: 1440 - 248 - gutter - 450 - 400 })
  await expect(workspace().getByRole('button', { name: '架构', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('tab', { name: 'Beta' }).click()
  await expect(workspace().getByRole('button', { name: 'Diff', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await capture('session', 1024, 640)).toMatchObject({ workbench: null, right: 1024 - 248 - gutter - 400 })
  expect(await capture('session', 1280, 800)).toMatchObject({ workbench: null, right: 410 })
  await capture('session', 1440, 900)
  const boot = await page.evaluate(() => window.studio.project.bootstrap())
  const alpha = boot.projects.find((p) => p.name === 'Alpha')!, beta = boot.projects.find((p) => p.name === 'Beta')!, gamma = boot.projects.find((p) => p.name === 'Gamma')!
  expect(boot.uiStates[alpha.id]).toMatchObject({ mainCanvas: { mode: 'view', viewId: 'architecture' }, workbenchOpen: true, sidebarOpen: true, lastTool: 'terminal', viewConversationWidth: 450 })
  expect(boot.uiStates[beta.id]).toMatchObject({ mainCanvas: { mode: 'draft' }, sidebarOpen: true, lastTool: 'diff', sidebarWidth: 410 })
  expect(boot.uiStates[gamma.id]).toMatchObject({ mainCanvas: { mode: 'view', viewId: 'progress' }, workbenchOpen: true, sidebarOpen: false })
  await page.getByRole('button', { name: '折叠导航' }).click()
  await expect(workspace().locator('.navigation')).toHaveCount(0)
  await closeTestApp(app, page); await launch(); await resize(1440, 900)
  await expect(page.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab')).toHaveCount(3)
  await expect(page.getByRole('button', { name: '展开导航' })).toBeVisible()
  await expect(workspace().getByRole('button', { name: 'Diff', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '展开导航' }).click()
  await page.getByRole('tab', { name: 'Alpha' }).click()
  await expect(workspace().getByRole('button', { name: '架构', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(workspace().getByRole('tab', { name: 'Terminal 1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭 Alpha', exact: true }).click()
  await page.getByRole('button', { name: '关闭并停止', exact: true }).click()
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Alpha/ })).toBeVisible()
  await page.getByRole('button', { name: /^Alpha/ }).click()
  await expect(workspace().getByRole('button', { name: '架构', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(workspace().getByRole('button', { name: 'Terminal', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(workspace().getByRole('tab', { name: 'Terminal 1', exact: true })).toBeVisible()
  for (const name of ['Alpha', 'Beta', 'Gamma']) {
    await page.getByRole('button', { name: `关闭 ${name}`, exact: true }).click()
    if (name === 'Alpha') await page.getByRole('button', { name: '关闭并停止', exact: true }).click()
  }
  await expect(page.getByRole('heading', { name: 'AI Developer Studio' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '新标签页' })).toHaveCount(1)
})

test('FR-PROJ-001: symlink/equivalent path identity, errors and recent removal', async () => {
  const path = join(dir, 'Canonical Project'); mkdirSync(path)
  await pickDirectory(path)
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  const alias = join(dir, 'alias'); symlinkSync(path, alias)
  await pickDirectory(alias)
  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(page.getByRole('tab', { name: 'Canonical Project' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  const file = join(dir, 'a-file'); writeFileSync(file, 'x')
  await pickDirectory(file, '所选路径不是目录')
  await pickDirectory(join(dir, 'missing'), '目录不存在')
  await expect(page.getByRole('tab')).toHaveCount(2)
  await page.getByRole('button', { name: '从列表移除 Canonical Project' }).click()
  await expect(page.getByRole('button', { name: /^Canonical Project/ })).toHaveCount(0)
  await pickDirectory(path + '/../Canonical Project/')
  await expect(page.getByRole('tab')).toHaveCount(1)
})

test('PROJ-Q7/Q17: native menu commands and macOS window close retain Workspace', async () => {
  const path = join(dir, 'Window Project'); mkdirSync(path); await pickDirectory(path)
  await workspace().getByRole('button', { name: '架构', exact: true }).click()
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find((item) => item.label === '文件')!.submenu!.items.find((item) => item.label === '新建标签页')!.click())
  await expect(page.getByRole('tab', { name: '新标签页' })).toHaveAttribute('aria-selected', 'true')
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find((item) => item.label === '文件')!.submenu!.items.find((item) => item.label === '关闭标签页')!.click())
  await expect(page.getByRole('tab', { name: 'Window Project' })).toHaveAttribute('aria-selected', 'true')
  if (process.platform === 'darwin') {
    const state = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!
      win.close(); return { count: BrowserWindow.getAllWindows().length, visible: win.isVisible(), destroyed: win.isDestroyed() }
    })
    expect(state).toEqual({ count: 1, visible: false, destroyed: false })
    await app.evaluate(({ app }) => app.emit('activate'))
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true)
    await expect(workspace().getByRole('button', { name: '架构', exact: true })).toHaveAttribute('aria-current', 'page')
  }
})
