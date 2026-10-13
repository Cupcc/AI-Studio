import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

// T20261012-settings-theme: AC-08 (FR-SET-001, FR-SET-002; specs/settings/spec.md). Every settings action goes
// through the visible entry, the menu bar item or the dialog. Fixtures: an isolated user data directory, the
// directory picker stub, and the system state ("Reduce transparency", the OS colour scheme) simulated by overriding
// nativeTheme in the main process; the simulated OS scheme is light unless a test sets it dark.
const appDir = join(__dirname, '..')
const evidence = process.env.STUDIO_E2E_EVIDENCE_DIR ?? join(appDir, '../../.runtime/desktop-e2e/screenshots/settings')
let dir: string, app: ElectronApplication, page: Page

async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('topbar')).toBeVisible()
  await app.evaluate(({ BrowserWindow, nativeTheme }) => {
    const win = BrowserWindow.getAllWindows()[0]!; win.setContentSize(1280, 800); win.show(); win.focus()
    // CI runners may enable Reduce transparency; each test starts with it off.
    Object.defineProperty(nativeTheme, 'prefersReducedTransparency', { configurable: true, get: () => false })
    const state = globalThis as { studioSystemDark?: boolean }
    Object.defineProperty(nativeTheme, 'shouldUseDarkColors', { configurable: true, get: () => nativeTheme.themeSource === 'dark' || (nativeTheme.themeSource === 'system' && state.studioSystemDark === true) })
    nativeTheme.emit('updated')
  })
}
async function relaunch() { await app.close(); await launch() }
async function openProject(name: string) {
  const path = join(dir, name); mkdirSync(path)
  await app.evaluate(({ dialog }, selectedPath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] }) }, path)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
}
const html = () => page.locator('html')
const dialog = () => page.getByRole('dialog', { name: '设置' })
const themeRadio = (name: '毛玻璃' | '纯色') => dialog().getByRole('radio', { name: new RegExp(`^${name}`) })
const modeRadio = (name: '跟随系统' | '浅色' | '深色') => dialog().getByRole('radiogroup', { name: '模式' }).getByRole('radio', { name, exact: true })
const colorRadio = (name: string) => dialog().getByRole('radiogroup', { name: '毛玻璃背景' }).getByRole('radio', { name, exact: true })
/** Native window background: getBackgroundColor() drops alpha, so the glass window's transparent colour reads #000000. */
const windowBackground = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor().toUpperCase())
const TRANSPARENT = '#000000', SOLID_LIGHT = '#FFFFFF', SOLID_DARK = '#212121'
async function menuSettings() {
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items[0]!.submenu!.items.find((item) => item.label === '设置…')!.click())
}
async function snap(name: string) {
  await page.mouse.move(2, 400)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  mkdirSync(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, `W1-${name}.png`) })
}
async function setSystemDark(on: boolean) {
  await app.evaluate(({ nativeTheme }, value) => { (globalThis as { studioSystemDark?: boolean }).studioSystemDark = value; nativeTheme.emit('updated') }, on)
}
async function setReducedTransparency(on: boolean) {
  await app.evaluate(({ nativeTheme }, value) => {
    Object.defineProperty(nativeTheme, 'prefersReducedTransparency', { configurable: true, get: () => value })
    nativeTheme.emit('updated')
  }, on)
}

test.beforeEach(async () => { dir = mkdtempSync(join(tmpdir(), 'studio settings ')); await launch() })
test.afterEach(async () => { await app?.close(); rmSync(dir, { recursive: true, force: true }) })

test('FR-SET-002 · AC-08: the first launch is glass on the native material with the aurora colour, following the system mode', async () => {
  await expect(html()).toHaveAttribute('data-theme', 'glass')
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system')
  await expect(html()).toHaveAttribute('data-scheme', 'light')
  await expect(html()).toHaveAttribute('data-glass-color', 'aurora')
  expect(await windowBackground()).toBe(TRANSPARENT)
  const look = await page.evaluate(() => ({
    topbar: getComputedStyle(document.querySelector('.topbar')!).backgroundColor,
    launcher: getComputedStyle(document.querySelector('.launcher')!).backgroundColor,
    wall: getComputedStyle(document.body, '::before').backgroundImage,
    tab: getComputedStyle(document.querySelector('.project-tab')!).borderRadius
  }))
  expect(look).toMatchObject({ topbar: 'rgba(0, 0, 0, 0)', launcher: 'rgba(255, 255, 255, 0.26)', tab: '9px' })
  expect(look.wall).toContain('rgb(169, 193, 242)')
  await openProject('Glass Project')
  await snap('glass-default-1280')
})

test('FR-SET-001 · AC-08: the navigation entry, the menu bar and ⌘, open one dialog; ×, Esc and outside close it', async () => {
  // Launcher: no navigation, so the menu bar item (⌘,) is the way in.
  await menuSettings(); await expect(dialog()).toBeVisible()
  await menuSettings(); await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(dialog().getByRole('button', { name: '外观', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(themeRadio('毛玻璃')).toHaveAttribute('aria-checked', 'true')
  await expect(modeRadio('跟随系统')).toBeFocused()
  await page.keyboard.press('Escape'); await expect(dialog()).toHaveCount(0)

  await openProject('Entry Project')
  const entry = page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true })
  const [entryBox, navBox] = await Promise.all([entry.boundingBox(), page.locator('.navigation').boundingBox()])
  expect(entryBox!.x - navBox!.x).toBeLessThan(16)
  expect(navBox!.y + navBox!.height - (entryBox!.y + entryBox!.height)).toBeLessThan(16)
  await entry.click(); await expect(dialog()).toBeVisible()
  await expect(page.locator('.shell')).toHaveAttribute('inert', '')
  await snap('settings-dialog-glass')
  await dialog().getByRole('button', { name: '关闭设置', exact: true }).click()
  await expect(dialog()).toHaveCount(0); await expect(entry).toBeFocused()

  // Collapsed navigation: the entry is hidden and the menu bar still works; a click outside closes.
  await page.getByRole('button', { name: '折叠导航', exact: true }).click()
  await expect(entry).toHaveCount(0)
  await menuSettings(); await expect(dialog()).toBeVisible()
  await page.mouse.click(30, 780); await expect(dialog()).toHaveCount(0)
})

test('FR-SET-002 · AC-08: solid applies at once, keeps the workspace as it was, and survives a restart', async () => {
  await openProject('Theme Project')
  await page.getByRole('button', { name: 'Architecture', exact: true }).click()
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('草稿保持不变')
  await page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true }).click()
  await themeRadio('纯色').click()
  await expect(html()).toHaveAttribute('data-theme', 'solid')
  await expect.poll(windowBackground).toBe(SOLID_LIGHT)
  await expect(themeRadio('纯色')).toHaveAttribute('aria-checked', 'true')
  await expect(dialog()).toBeVisible()
  await expect(dialog().getByRole('radiogroup', { name: '毛玻璃背景' })).toHaveCount(0)
  await snap('settings-dialog-solid')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Architecture', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('textbox', { name: '消息', exact: true })).toHaveValue('草稿保持不变')
  expect(await page.evaluate(() => [getComputedStyle(document.querySelector('.topbar')!).backgroundColor, getComputedStyle(document.querySelector('.project-tab')!).borderRadius]))
    .toEqual(['rgb(239, 238, 235)', '8px 8px 0px 0px'])
  await snap('solid-architecture-1280')

  await relaunch()
  // The first render waits for the saved appearance, so the shell never appears in the other theme.
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('solid')
  expect(await windowBackground()).toBe(SOLID_LIGHT)
  await page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true }).click()
  await themeRadio('毛玻璃').click()
  await expect(html()).toHaveAttribute('data-theme', 'glass')
  await expect.poll(windowBackground).toBe(TRANSPARENT)
})

/** Lowest contrast of muted text against sampled backgrounds (empty frame and canvas points), compositing the
 *  page's transparent pixels over a conservative grey stand-in for the native material: darker than the light
 *  material, lighter than the dark one. */
async function mutedContrast(): Promise<number> {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const dark = document.documentElement.dataset.scheme === 'dark'
    // Measured material: light about #e1e1e1, dark about #2c2b29 (2026-10-12); the stand-ins are deliberately worse.
    const scale = bitmap.width / innerWidth, material = dark ? 64 : 176
    const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    const lum = ([r, g, b]: number[]) => 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
    const text = lum(getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim().match(/\w\w/g)!.map((h) => parseInt(h, 16)))
    let lowest = Infinity
    // Empty frame (navigation below the list, top bar) and canvas points, away from text
    for (const [x, y] of [[20, 560], [120, 640], [230, 700], [700, 20], [1000, 20], [700, 300], [1100, 500]]) {
      const [r, g, b, a] = ctx.getImageData(Math.round(x! * scale), Math.round(y! * scale), 1, 1).data
      const over = (c: number) => (c * a! + material * (255 - a!)) / 255
      const bg = lum([over(r!), over(g!), over(b!)])
      lowest = Math.min(lowest, (Math.max(bg, text) + 0.05) / (Math.min(bg, text) + 0.05))
    }
    return lowest
  }, png)
}

test('FR-SET-002 · AC-08: glass colours apply at once, hide for solid, persist, keep text readable; "none" leaves the material', async () => {
  await openProject('Colour Project')
  await page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true }).click()
  await expect(colorRadio('极光')).toHaveAttribute('aria-checked', 'true')
  const contrast: Record<string, number> = {}
  for (const [name, color, rgb] of [['极光', 'aurora', '169, 193, 242'], ['薄荷', 'mint', '191, 227, 205'], ['晚霞', 'sunset', '246, 201, 180'], ['海雾', 'haze', '201, 211, 223']] as const) {
    await colorRadio(name).click()
    await expect(html()).toHaveAttribute('data-glass-color', color)
    expect(await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage)).toContain(`rgb(${rgb})`)
    await page.keyboard.press('Escape')
    contrast[color] = await mutedContrast()
    await snap(`glass-${color}-1280`)
    await page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true }).click()
  }
  for (const value of Object.values(contrast)) expect(value).toBeGreaterThanOrEqual(4.5)
  console.log('[settings] muted text contrast on light glass', contrast)

  await colorRadio('无').click()
  await expect(html()).toHaveAttribute('data-glass-color', 'none')
  expect(await page.evaluate(() => getComputedStyle(document.body, '::before').content)).toBe('none')
  await themeRadio('纯色').click()
  await expect(dialog().getByRole('radiogroup', { name: '毛玻璃背景' })).toHaveCount(0)
  await themeRadio('毛玻璃').click()
  await expect(colorRadio('无')).toHaveAttribute('aria-checked', 'true')
  await colorRadio('晚霞').click()
  await relaunch()
  await expect(html()).toHaveAttribute('data-glass-color', 'sunset')
})

test('FR-SET-002 · AC-08: "Reduce transparency" shows solid with a note, and glass returns when it is off', async () => {
  await openProject('Accessibility Project')
  await setReducedTransparency(true)
  await expect(html()).toHaveAttribute('data-theme', 'solid')
  await expect.poll(windowBackground).toBe(SOLID_LIGHT)
  await page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true }).click()
  await expect(themeRadio('毛玻璃')).toHaveAttribute('aria-checked', 'true')
  await expect(dialog().getByRole('status')).toHaveText('系统已开启“降低透明度”，当前显示为纯色外观。')
  await snap('reduced-transparency')
  await setReducedTransparency(false)
  await expect(html()).toHaveAttribute('data-theme', 'glass')
  await expect.poll(windowBackground).toBe(TRANSPARENT)
  await expect(dialog().getByRole('status')).toHaveCount(0)
})

test('FR-SET-002 · AC-08: the colour mode follows the system by default; light and dark are forced, apply at once and persist', async () => {
  await openProject('Mode Project')
  await page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true }).click()
  await expect(modeRadio('跟随系统')).toHaveAttribute('aria-checked', 'true')
  await expect(modeRadio('跟随系统')).toBeFocused()

  // Following the system: the OS switching to dark switches the window, without a restart.
  await setSystemDark(true)
  await expect(html()).toHaveAttribute('data-scheme', 'dark')
  await snap('settings-dialog-glass-dark')
  await setSystemDark(false)
  await expect(html()).toHaveAttribute('data-scheme', 'light')

  // Forced dark: native UI follows (themeSource), and the OS no longer matters.
  await modeRadio('深色').click()
  await expect(html()).toHaveAttribute('data-scheme', 'dark')
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
  await setSystemDark(false)
  await expect(html()).toHaveAttribute('data-scheme', 'dark')
  expect(await page.evaluate(() => getComputedStyle(document.body).color)).toBe('rgb(242, 242, 242)')
  const contrast: Record<string, number> = {}
  for (const name of ['极光', '无'] as const) {
    await colorRadio(name).click(); await page.keyboard.press('Escape')
    contrast[`glass-${name}`] = await mutedContrast()
    await snap(`glass-dark-${name === '无' ? 'none' : 'aurora'}-1280`)
    await page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true }).click()
  }
  await themeRadio('纯色').click()
  await expect.poll(windowBackground).toBe(SOLID_DARK)
  await page.keyboard.press('Escape')
  contrast.solid = await mutedContrast()
  await snap('solid-dark-1280')
  for (const value of Object.values(contrast)) expect(value).toBeGreaterThanOrEqual(4.5)
  console.log('[settings] muted text contrast in dark', contrast)

  await relaunch()
  await setSystemDark(false)
  await expect(html()).toHaveAttribute('data-scheme', 'dark')
  expect(await windowBackground()).toBe(SOLID_DARK)
  await page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true }).click()
  await modeRadio('浅色').click()
  await expect(html()).toHaveAttribute('data-scheme', 'light')
  await expect.poll(windowBackground).toBe(SOLID_LIGHT)
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')
})
