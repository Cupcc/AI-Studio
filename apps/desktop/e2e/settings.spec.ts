import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { launchElectron } from './harness'

// T20261012-settings-theme: AC-08 (FR-SET-001, FR-SET-002; specs/settings/spec.md). Every settings action goes
// through the visible entry, the menu bar item or the dialog. Fixtures: an isolated user data directory, the
// directory picker stub, and the system state ("Reduce transparency", the OS colour scheme) simulated by overriding
// nativeTheme in the main process; the simulated OS scheme is light unless a test sets it dark.
const appDir = join(__dirname, '..')
const evidence = process.env.STUDIO_E2E_EVIDENCE_DIR ?? join(appDir, '../../.runtime/desktop-e2e/screenshots/settings')
let dir: string, app: ElectronApplication, page: Page

async function launch() {
  app = await launchElectron({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('topbar')).toBeVisible()
  await app.evaluate(({ app: mainApp, BrowserWindow, nativeTheme }) => {
    const win = BrowserWindow.getAllWindows()[0]!; win.setContentSize(1280, 800); win.show(); win.focus()
    // Observe calls while still setting the real native icon; do not replace the Dock behaviour.
    if (mainApp.dock) {
      const setIcon = mainApp.dock.setIcon.bind(mainApp.dock)
      mainApp.dock.setIcon = (image) => {
        (globalThis as { studioDockIcon?: string }).studioDockIcon = typeof image === 'string' ? image : undefined
        setIcon(image)
      }
    }
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
const modeRadio = (name: '跟随系统' | '浅色' | '深色') => dialog().getByRole('radiogroup', { name: '模式' }).getByRole('radio', { name, exact: true })
const colorRadio = (name: string) => dialog().getByRole('radiogroup', { name: '毛玻璃背景' }).getByRole('radio', { name, exact: true })
/** Native window background: getBackgroundColor() drops alpha, so the glass window's transparent colour reads #000000. */
const windowBackground = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor().toUpperCase())
const dockIconName = () => app.evaluate(() => (globalThis as { studioDockIcon?: string }).studioDockIcon?.split('/').at(-1))
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
  // Appearance offers the mode and the glass background only; there is no theme choice (2026-11-12).
  await expect(dialog().getByRole('radiogroup')).toHaveCount(2)
  await expect(dialog().getByRole('radiogroup', { name: '主题' })).toHaveCount(0)
  await expect(dialog().getByText('纯色')).toHaveCount(0)
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

test('FR-SET-002 · AC-08: the solid fallback applies at once and keeps the workspace as it was', async () => {
  await openProject('Theme Project')
  await page.getByRole('button', { name: '架构', exact: true }).click()
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('草稿保持不变')
  await setReducedTransparency(true)
  await expect(html()).toHaveAttribute('data-theme', 'solid')
  await expect.poll(windowBackground).toBe(SOLID_LIGHT)
  await expect(page.getByRole('button', { name: '架构', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('textbox', { name: '消息', exact: true })).toHaveText('草稿保持不变')
  expect(await page.evaluate(() => [getComputedStyle(document.querySelector('.topbar')!).backgroundColor, getComputedStyle(document.querySelector('.project-tab')!).borderRadius]))
    .toEqual(['rgb(239, 238, 235)', '8px 8px 0px 0px'])
  await snap('solid-architecture-1280')
  await setReducedTransparency(false)
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

test('FR-SET-002 · AC-08: glass colours apply at once, persist, keep text readable; "none" leaves the material', async () => {
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
  await expect(dialog().getByRole('status')).toHaveText('系统已开启“降低透明度”，当前显示为纯色外观。')
  // The glass colour stays selectable and is kept for when transparency returns.
  await colorRadio('薄荷').click()
  await expect(html()).toHaveAttribute('data-glass-color', 'mint')
  await expect(html()).toHaveAttribute('data-theme', 'solid')
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
  if (process.platform === 'darwin') await expect.poll(dockIconName).toBe('icon-dark.png')
  await snap('settings-dialog-glass-dark')
  await setSystemDark(false)
  await expect(html()).toHaveAttribute('data-scheme', 'light')
  if (process.platform === 'darwin') await expect.poll(dockIconName).toBe('icon.png')

  // Forced dark: native UI follows (themeSource), and the OS no longer matters.
  await modeRadio('深色').click()
  await expect(html()).toHaveAttribute('data-scheme', 'dark')
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
  await setSystemDark(false)
  await expect(html()).toHaveAttribute('data-scheme', 'dark')
  if (process.platform === 'darwin') await expect.poll(dockIconName).toBe('icon-dark.png')
  expect(await page.evaluate(() => getComputedStyle(document.body).color)).toBe('rgb(242, 242, 242)')
  const contrast: Record<string, number> = {}
  for (const name of ['极光', '无'] as const) {
    await colorRadio(name).click(); await page.keyboard.press('Escape')
    contrast[`glass-${name}`] = await mutedContrast()
    await snap(`glass-dark-${name === '无' ? 'none' : 'aurora'}-1280`)
    await page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true }).click()
  }
  await setReducedTransparency(true)
  await expect.poll(windowBackground).toBe(SOLID_DARK)
  await page.keyboard.press('Escape')
  contrast.solid = await mutedContrast()
  await snap('solid-dark-1280')
  for (const value of Object.values(contrast)) expect(value).toBeGreaterThanOrEqual(4.5)
  console.log('[settings] muted text contrast in dark', contrast)

  await relaunch()
  await setSystemDark(false)
  await expect(html()).toHaveAttribute('data-scheme', 'dark')
  await expect(html()).toHaveAttribute('data-theme', 'glass')
  await setReducedTransparency(true)
  await expect.poll(windowBackground).toBe(SOLID_DARK)
  await page.locator('.navigation__footer').getByRole('button', { name: '设置', exact: true }).click()
  await modeRadio('浅色').click()
  await expect(html()).toHaveAttribute('data-scheme', 'light')
  await expect.poll(windowBackground).toBe(SOLID_LIGHT)
  if (process.platform === 'darwin') await expect.poll(dockIconName).toBe('icon.png')
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')
})

// FR-SET-003: Settings › 关于 and updates. A loopback fixture stands in for GitHub's "latest release" API
// (STUDIO_UPDATE_FEED_URL, honoured only by development builds); nothing leaves the machine. A development build never
// installs, so the newer release is offered as a download link.
test('FR-SET-003: 关于 shows the version and build; 检查更新 reports a newer release with its notes', async () => {
  const version = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')).version as string
  let latest = version
  const feed = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({
      tag_name: `v${latest}`, name: `AI Developer Studio ${latest}`, body: `## ${latest}\n\n- 更快的启动`, draft: false, prerelease: false,
      html_url: `https://github.com/Tiancheng-ai/AI-Studio/releases/tag/v${latest}`,
      assets: [{ name: `AI-Developer-Studio-${latest}-mac-arm64.zip`, size: 1, digest: `sha256:${'a'.repeat(64)}`, browser_download_url: 'https://example.invalid/app.zip' }]
    }))
  })
  await new Promise<void>(resolve => feed.listen(0, '127.0.0.1', resolve))
  process.env.STUDIO_UPDATE_FEED_URL = `http://127.0.0.1:${(feed.address() as AddressInfo).port}/latest`
  try {
    await relaunch()
    await openProject('About Project')
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items[0]!.submenu!.items.find((item) => item.label === '检查更新…')!.click())
    await expect(dialog().getByRole('button', { name: '关于', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(dialog().getByTestId('app-version')).toContainText(`版本 ${version}`)
    await expect(dialog().getByText('已是最新版本')).toBeVisible()
    await expect(dialog().getByTestId('app-info')).toContainText('Electron')
    await expect(dialog().getByRole('link', { name: '本版本更新说明' })).toHaveAttribute('href', `https://github.com/Tiancheng-ai/AI-Studio/releases/tag/v${version}`)
    await snap('about-current-1280')

    const [major, minor] = version.split('.').map(Number)
    latest = `${major}.${minor! + 1}.0`
    await dialog().getByRole('button', { name: '检查更新', exact: true }).click()
    await expect(dialog().getByText(`发现新版本 ${latest}`)).toBeVisible()
    await expect(dialog().getByText(/开发版本不会自行安装更新/)).toBeVisible()
    await expect(dialog().getByRole('link', { name: '前往下载' })).toHaveAttribute('href', `https://github.com/Tiancheng-ai/AI-Studio/releases/tag/v${latest}`)
    await dialog().getByText(`更新说明 · AI Developer Studio ${latest}`).click()
    await expect(dialog().getByText('更快的启动')).toBeVisible()
    await snap('about-available-1280')

    // The choice persists; the navigation entry carries the badge and reopens 关于.
    await dialog().getByRole('checkbox', { name: /自动检查并下载更新/ }).uncheck()
    await page.keyboard.press('Escape')
    await page.locator('.navigation__footer').getByRole('button', { name: '设置（新版本）' }).click()
    await expect(dialog().getByRole('button', { name: '关于', exact: true })).toHaveAttribute('aria-current', 'page')
    await relaunch()
    await menuSettings()
    await dialog().getByRole('button', { name: '关于', exact: true }).click()
    await expect(dialog().getByRole('checkbox', { name: /自动检查并下载更新/ })).not.toBeChecked()
  } finally {
    delete process.env.STUDIO_UPDATE_FEED_URL
    feed.close()
  }
})
