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
  // CI may enable Reduce transparency. Appearance tests set the system input explicitly.
  await app.evaluate(({ nativeTheme }) => {
    Object.defineProperty(nativeTheme, 'prefersReducedTransparency', { configurable: true, get: () => false })
    nativeTheme.emit('updated')
  })
}
async function selectEffort(value: string) { await effort().click(); await panel().getByRole('button', { name: value, exact: true }).click() }
async function observeEffortSwitches() {
  await page.evaluate(() => {
    const switches: { tier: string; iterations: string; pointerEvents: string }[] = []
    ;(window as unknown as { effortSwitches: typeof switches }).effortSwitches = switches
    document.addEventListener('animationstart', event => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.dataset.effortTransition) return
      const style = getComputedStyle(target)
      switches.push({ tier: target.dataset.effortTransition, iterations: style.animationIterationCount, pointerEvents: style.pointerEvents })
    })
  })
}
const switches = () => page.evaluate(() => (window as unknown as { effortSwitches: { tier: string; iterations: string; pointerEvents: string }[] }).effortSwitches)
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

test('five static effort bars; max / ultra ignite only on selection, across four appearances and reduced motion', async () => {
  await observeEffortSwitches()
  await effort().focus(); await effort().press('ArrowDown'); await page.keyboard.press('End')
  await expect(panel().getByRole('button', { name: 'ultra', exact: true })).toBeFocused()
  await expect(panel().getByRole('button', { name: 'minimal', exact: true })).toHaveCount(0)
  for (const [value, filled] of [['low', 1], ['medium', 2], ['high', 3], ['xhigh', 4], ['max', 5], ['ultra', 5]] as const) {
    const signal = panel().getByRole('button', { name: value, exact: true }).locator('.effort-signal')
    await expect(signal.locator('i')).toHaveCount(5)
    await expect(signal.locator('i.is-on')).toHaveCount(filled)
  }
  expect(await panel().locator('.effort-signal').evaluateAll(nodes => nodes.every(node => node.getAnimations({ subtree: true }).length === 0))).toBe(true)
  await page.keyboard.press('Escape'); await expect(effort()).toBeFocused(); await expect(panel()).toHaveCount(0)
  await input().fill('Keep this draft while switching effort')
  let selections = 0
  for (const theme of ['glass', 'solid'] as const) for (const mode of ['light', 'dark'] as const) {
    // Appearance setup only; effort selection is always through the UI.
    await page.evaluate(async ({ theme, mode }) => { const api = window.studio as StudioApi; await api.settings.setTheme({ theme }); await api.settings.setMode({ mode }) }, { theme, mode })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.locator('html')).toHaveAttribute('data-scheme', mode)
    for (const value of ['max', 'ultra']) {
      await selectEffort(value)
      await expect(effort()).toHaveAttribute('aria-description', `思考强度 · ${value}`)
      await expect.poll(async () => (await switches()).length).toBe(++selections)
      expect((await switches()).at(-1)).toEqual({ tier: value, iterations: '1', pointerEvents: 'none' })
      await expect(effort().locator('.effort-signal i')).toHaveCount(5)
      expect(await effort().locator('.effort-signal').evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0)
      await expect(workspace().locator('[data-effort-transition]')).toHaveCount(0)
      await expect(input()).toHaveValue('Keep this draft while switching effort')
    }
  }
  await selectEffort('ultra')
  expect((await switches()).length).toBe(selections)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await selectEffort('max')
  await expect(effort()).toHaveAttribute('aria-description', '思考强度 · max')
  await expect(workspace().locator('[data-effort-transition]')).toHaveCount(0)
  expect((await switches()).length).toBe(selections)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(workspace().locator('[data-effort-transition]')).toHaveCount(0)
  // Keyboard activation gets the same one-shot feedback after the popover closes.
  await effort().press('ArrowDown'); await page.keyboard.press('End'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter')
  await expect.poll(async () => (await switches()).length).toBe(++selections)
  await expect(workspace().locator('[data-effort-transition]')).toHaveCount(0)
  await input().fill('Persist ultra'); await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
  await expect(effort()).toHaveAttribute('aria-description', '思考强度 · ultra')
  await app.close(); await launch()
  await observeEffortSwitches()
  await expect(effort()).toHaveAttribute('aria-description', '思考强度 · ultra')
  await expect(workspace().locator('[data-effort-transition]')).toHaveCount(0)
  expect(await switches()).toHaveLength(0)
  await workspace().getByRole('button', { name: 'Model Selector', exact: true }).click()
  await workspace().getByRole('button', { name: 'E2E Alternate', exact: true }).click()
  await expect(workspace().getByText('“ultra”不在当前模型目录中。')).toBeVisible()
  await workspace().getByRole('button', { name: '使用默认', exact: true }).click()
  await expect(effort()).toHaveCount(0)
})

test('effort precedes model, keeps menu columns aligned, and uses a quiet Max palette', async () => {
  const model = workspace().getByRole('button', { name: 'Model Selector', exact: true })
  const effortBox = (await effort().boundingBox())!, modelBox = (await model.boundingBox())!
  expect(effortBox.x + effortBox.width).toBeLessThanOrEqual(modelBox.x)
  for (const theme of ['glass', 'solid'] as const) for (const mode of ['light', 'dark'] as const) {
    await page.evaluate(async ({ theme, mode }) => {
      await (window.studio as StudioApi).settings.setTheme({ theme })
      await (window.studio as StudioApi).settings.setMode({ mode })
    }, { theme, mode })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.locator('html')).toHaveAttribute('data-scheme', mode)
    await selectEffort('max')
    await effort().click()
    await expect(panel().getByRole('button', { name: '默认', exact: true })).toHaveCount(0)
    await expect(panel().locator('.composer__effort-option').first()).toHaveText('low')
    await page.mouse.move(0, 0)
    const measure = () => panel().locator('.composer__effort-option').evaluateAll(nodes => nodes.map(node => ({
      columns: [...node.children].map(child => {
        const rect = child.getBoundingClientRect()
        return [rect.x, rect.width]
      }),
      background: getComputedStyle(node).backgroundColor,
      weight: getComputedStyle(node).fontWeight,
      transform: getComputedStyle(node).transform
    })))
    const before = await measure()
    for (const row of before) expect(row).toEqual(before[0])
    await expect(panel().locator('.composer__effort-check svg')).toHaveCount(1)
    expect(await effort().locator('.effort-signal').evaluate(node => getComputedStyle(node).color)).toBe(mode === 'light' ? 'rgb(86, 103, 161)' : 'rgb(170, 183, 234)')
    await panel().getByRole('button', { name: 'high', exact: true }).click()
    await effort().click(); await page.mouse.move(0, 0)
    expect(await measure()).toEqual(before)
    await panel().getByRole('button', { name: '恢复 CLI 默认', exact: true }).click()
    await expect(effort()).toHaveAttribute('aria-description', '思考强度 · 默认')
  }
})

test('Ultra uses a static gradient that follows the theme palette without replaying selection feedback', async () => {
  await observeEffortSwitches()
  await page.evaluate(async () => {
    const api = window.studio as StudioApi
    await api.settings.setTheme({ theme: 'glass' }); await api.settings.setMode({ mode: 'light' })
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'glass')
  await selectEffort('ultra')
  await expect.poll(async () => (await switches()).length).toBe(1)
  await expect(workspace().locator('[data-effort-transition]')).toHaveCount(0)
  const gradient = () => effort().locator('.effort-signal i').first().evaluate(node => getComputedStyle(node).backgroundImage)
  const palettes = new Set<string>()
  for (const mode of ['light', 'dark'] as const) {
    await page.evaluate(async mode => { await (window.studio as StudioApi).settings.setMode({ mode }) }, mode)
    await expect(page.locator('html')).toHaveAttribute('data-scheme', mode)
    for (const color of ['aurora', 'mint', 'sunset', 'haze', 'none'] as const) {
      await page.evaluate(async color => { await (window.studio as StudioApi).settings.setGlassColor({ color }) }, color)
      await expect(page.locator('html')).toHaveAttribute('data-glass-color', color)
      const image = await gradient()
      expect(image).toContain('linear-gradient('); palettes.add(image)
      await expect(effort().locator('.effort-signal i')).toHaveCount(5)
      expect(await effort().locator('.effort-signal').evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0)
    }
  }
  expect(palettes.size).toBe(10)
  await page.evaluate(async () => { await (window.studio as StudioApi).settings.setTheme({ theme: 'solid' }) })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'solid')
  const neutral = await gradient()
  await page.evaluate(async () => { await (window.studio as StudioApi).settings.setGlassColor({ color: 'sunset' }) })
  expect(await gradient()).toBe(neutral)
  // Respect the OS fallback even when the saved preference is glass.
  await app.evaluate(({ nativeTheme }) => {
    Object.defineProperty(nativeTheme, 'prefersReducedTransparency', { configurable: true, get: () => true })
    nativeTheme.emit('updated')
  })
  await page.evaluate(async () => { await (window.studio as StudioApi).settings.setTheme({ theme: 'glass' }) })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'solid')
  expect(await gradient()).toBe(neutral)
  await app.evaluate(({ nativeTheme }) => {
    Object.defineProperty(nativeTheme, 'prefersReducedTransparency', { configurable: true, get: () => false })
    nativeTheme.emit('updated')
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'glass')
  expect(await gradient()).not.toBe(neutral)
  expect(await switches()).toHaveLength(1)
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
