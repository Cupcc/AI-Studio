import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { FeatureBridge } from '../src/shared/ipc/contract'
import type { sessionContract } from '../src/shared/ipc/session'
import type { SessionSummary } from '../src/shared/session/types'

// T20261009-prototype-alignment (W3): captures the aligned shell at the three review widths
// of Shell Spec v01 section 11 and asserts the section 1 layout invariants. Behaviour is
// covered by the other specs; this file only drives the UI into each visual state.
// T20261010-prototype-v02-alignment adds the prototype v02 states: Markdown reply, centred
// new chat draft, and message column edges equal to the composer edges (Shell Spec v02 §2.2).
type SessionApi = FeatureBridge<typeof sessionContract>
const appDir = join(__dirname, '..')
const evidence = process.env.STUDIO_E2E_EVIDENCE_DIR ?? join(appDir, '../../.runtime/desktop-e2e/screenshots/alignment')
const SIZES = [{ width: 1024, height: 640 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }] as const
const BASE = { width: 1280, height: 800 }
type Layout = { state: string; width: number; height: number; [metric: string]: number | string | number[] | null }
const metrics: Layout[] = []
let dir: string, app: ElectronApplication, page: Page, projectId: string

const workspace = () => page.locator('.project-workspace:not([hidden])')
const row = (id: string) => workspace().locator(`[data-session-row="${id}"]`)
const composer = () => workspace().getByRole('textbox', { name: '消息', exact: true })
async function sessions(): Promise<SessionSummary[]> {
  return page.evaluate((id) => (window.studio as unknown as { session: SessionApi }).session.list({ projectId: id }), projectId)
}
async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('topbar')).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]!; win.show(); win.focus() })
}
async function openProject(name: string) {
  const path = join(dir, name); mkdirSync(path)
  await app.evaluate(({ dialog }, selectedPath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] }) }, path)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
}
async function newChat(cli: 'codex' | 'claude-code' = 'codex') {
  await workspace().getByRole('button', { name: '选择 CLI', exact: true }).click()
  await workspace().locator('.session-cli-menu').getByRole('button', { name: cli === 'codex' ? 'Codex CLI' : 'Claude Code', exact: false }).first().click()
  await expect(composer()).toBeEnabled()
}
async function send(text: string): Promise<SessionSummary> {
  const previous = new Set((await sessions()).map((session) => session.id))
  await composer().fill(text)
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(async () => (await sessions()).some((session) => !previous.has(session.id))).toBe(true)
  return (await sessions()).find((session) => !previous.has(session.id))!
}
/** Resizes the content area and waits until the renderer reports the new size and has laid out. */
async function fit(size: { width: number; height: number }) {
  await app.evaluate(({ BrowserWindow }, next) => BrowserWindow.getAllWindows()[0]!.setContentSize(next.width, next.height), size)
  await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([size.width, size.height])
  await page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))) })
}
async function snap(state: string, width: number) {
  await page.mouse.move(2, 2)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  mkdirSync(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, `W3-${state}-${width}.png`) })
}
/** Shell Spec v01 section 1 invariants for the visible Project workspace. */
async function assertLayout(state: string, kind: 'session' | 'session-sidebar' | 'view', size: { width: number; height: number }) {
  const m = await page.evaluate(() => {
    const ws = document.querySelector('.project-workspace:not([hidden])')!
    const width = (selector: string) => ws.querySelector(selector)?.getBoundingClientRect().width ?? null
    return {
      innerWidth, document: document.documentElement.scrollWidth, workspace: ws.scrollWidth,
      topbar: document.querySelector('[data-testid="topbar"]')!.getBoundingClientRect().height,
      nav: width('.navigation'), headers: [...ws.querySelectorAll('.canvas-header')].map((header) => header.getBoundingClientRect().height),
      conversation: width('.conversation-pane'), right: width('.right-pane'),
      column: width('.session-conversation__transcript'), composer: width('.composer__box'),
      edges: (() => {
        const column = ws.querySelector('.session-conversation__transcript'), box = ws.querySelector('.session-conversation:not(.session-conversation--draft) .composer__box')
        if (!column || !box) return null
        const style = getComputedStyle(column), rect = column.getBoundingClientRect(), composer = box.getBoundingClientRect()
        return [rect.left + parseFloat(style.paddingLeft), rect.right - parseFloat(style.paddingRight), composer.left, composer.right]
      })()
    }
  })
  metrics.push({ state, ...size, ...m })
  expect(m.document).toBeLessThanOrEqual(m.innerWidth)
  expect(m.workspace).toBe(m.innerWidth)
  expect(m.topbar).toBe(40)
  expect(m.nav).toBe(248)
  expect(m.headers.length).toBeGreaterThan(0)
  for (const height of m.headers) expect(height).toBe(48)
  expect(m.conversation).toBeGreaterThanOrEqual(kind === 'view' ? 360 : 400)
  if (kind === 'session') expect(m.right).toBeNull()
  else expect(m.right).toBeGreaterThanOrEqual(kind === 'view' ? 400 : 320)
  if (m.column !== null) expect(m.column).toBeLessThanOrEqual(720 + 2 * 24)
  if (m.composer !== null) expect(m.composer).toBeLessThanOrEqual(720)
  // Shell Spec v02 §2.2: message column content and composer share left and right edges
  if (m.edges) {
    const [left, right, composerLeft, composerRight] = m.edges
    expect(Math.abs(left! - composerLeft!), `${state} ${size.width}: ${m.edges.join(' / ')}`).toBeLessThanOrEqual(0.5)
    expect(Math.abs(right! - composerRight!), `${state} ${size.width}: ${m.edges.join(' / ')}`).toBeLessThanOrEqual(0.5)
  }
}
async function atEachWidth(state: string, kind: 'session' | 'session-sidebar' | 'view') {
  for (const size of SIZES) { await fit(size); await assertLayout(state, kind, size); await snap(state, size.width) }
}

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'studio alignment ')); await launch()
  await openProject('Session Project')
  projectId = await workspace().getAttribute('data-project-id') ?? ''
})
test.afterEach(async () => { await app?.close(); rmSync(dir, { recursive: true, force: true }) })
test.afterAll(() => {
  if (!metrics.length) return
  mkdirSync(evidence, { recursive: true })
  writeFileSync(join(evidence, 'W3-layout-metrics.json'), JSON.stringify(metrics, null, 2) + '\n')
})

test('FR-SESSION-001 / FR-TOOL-001 · AC-07: completed conversation with a right-sidebar tool at 1024 / 1280 / 1440', async () => {
  await newChat()
  await send('实现支付模块的订阅续费与取消。[e2e:delay]')
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
  await expect(workspace().locator('.transcript-tool')).not.toHaveCount(0)
  await page.getByRole('button', { name: '右侧边栏', exact: true }).click()
  await workspace().getByRole('button', { name: 'Files', exact: true }).click()
  await expect(workspace().getByRole('button', { name: 'Files', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await atEachWidth('session-sidebar', 'session-sidebar')
  // DEC-02 / task criterion 4: IBM Plex is bundled and actually loaded from app://studio.
  const loaded = await page.evaluate(() => [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family.replace(/"/g, '')))
  expect(loaded).toEqual(expect.arrayContaining(['IBM Plex Sans', 'IBM Plex Mono']))
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('IBM Plex Sans')
})

test('FR-SESSION-001 · Shell Spec v02 §2.2 / §6: Markdown reply with edges aligned to the composer at 1024 / 1280 / 1440', async () => {
  await newChat(); await send('[e2e:markdown] 运行测试并修复失败用例')
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
  await expect(workspace().locator('.code-block')).toHaveCount(2)
  await atEachWidth('markdown', 'session')
  const edges = metrics.filter((m) => m.state === 'markdown').map((m) => m.edges)
  expect(edges.every(Boolean)).toBe(true)
  // 1440 wide, navigation 248: the 720 column is centred in the canvas at 484 / 1204, like prototype v02
  expect((edges.at(-1) as number[]).slice(0, 2)).toEqual([484, 1204])
})

test('FR-PROJ-002 / FR-NAV-002 · AC-01: Project View Mode Overview and a selected tool at 1024 / 1280 / 1440', async () => {
  await workspace().getByRole('button', { name: 'Overview', exact: true }).click()
  await expect(workspace().getByRole('button', { name: 'Overview', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(workspace().getByRole('button', { name: 'Preview', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await atEachWidth('view-overview', 'view')
  await workspace().getByRole('button', { name: 'Files', exact: true }).click()
  await expect(workspace().getByRole('button', { name: 'Files', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await atEachWidth('view-tool', 'view')
})

test('FR-STATE-002 / FR-INPUT-001 · AC-05: Needs Input approval at three widths and a question card at 1280', async () => {
  await newChat(); const approval = await send('检查回调为什么跳回登录页。[e2e:approval]')
  await expect(workspace().getByRole('region', { name: '等待你的确认' })).toBeVisible()
  await expect(row(approval.id).getByRole('img', { name: 'Needs Input', exact: true })).toBeVisible()
  await atEachWidth('needs-input', 'session')
  await fit(BASE)
  await workspace().locator('.request-card__actions button').first().click()
  await expect(workspace().locator('.request-card__resolution')).toContainText('已选择')
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
  await newChat('claude-code'); const question = await send('需要确认下一步范围。[e2e:question]')
  await expect(workspace().getByRole('region', { name: '等待你的回答' })).toBeVisible()
  await assertLayout('needs-input-question', 'session', BASE); await snap('needs-input-question', BASE.width)
  await workspace().getByRole('textbox', { name: '回复 Agent', exact: true }).fill('使用较小的范围')
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(row(question.id).getByRole('img', { name: 'Needs Input', exact: true })).toHaveCount(0)
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
})

test('FR-STATE-003 · AC-05: Error card with details expanded at 1024 / 1280 / 1440', async () => {
  await newChat(); await send('检查 deploy.sh 为什么在 CI 中失败。[e2e:error]')
  await expect(workspace().getByRole('region', { name: '执行错误' })).toBeVisible()
  await workspace().getByText('查看详情', { exact: true }).click()
  await expect(workspace().locator('.transcript-error pre')).toContainText('这是一条模拟错误详情')
  await atEachWidth('error', 'session')
  await fit(BASE)
  await workspace().getByRole('button', { name: '重试', exact: true }).click()
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
})

test('FR-PROJ-001/002 / FR-CHAT-001/002: draft, CLI menu, tooltip, close confirmation and launcher at 1280', async () => {
  test.setTimeout(90_000)
  await fit(BASE)
  await workspace().getByRole('button', { name: 'New Chat', exact: true }).first().click()
  await expect(composer()).toBeVisible()
  await assertLayout('draft', 'session', BASE); await snap('draft', BASE.width)
  // Shell Spec v02 §6: greeting and composer are one group centred slightly above the middle; the header has no CLI name
  const draft = await workspace().locator('.session-draft').evaluate((node) => {
    const area = node.getBoundingClientRect(), greeting = node.querySelector('.session-draft__greeting')!.getBoundingClientRect(), box = node.querySelector('.composer__box')!.getBoundingClientRect()
    return { above: (greeting.top - area.top) - (area.bottom - box.bottom), order: greeting.bottom <= box.top }
  })
  expect(draft.order).toBe(true)
  expect(draft.above).toBeLessThan(0)
  await expect(workspace().locator('.canvas-header .session-header__cli')).toHaveCount(0)

  await workspace().getByRole('button', { name: '选择 CLI', exact: true }).click()
  const menu = workspace().locator('.session-cli-menu')
  await expect(menu.locator('.session-cli-menu__select').first()).toBeEnabled()
  await snap('cli-menu', BASE.width)
  await workspace().getByRole('button', { name: '选择 CLI', exact: true }).click()
  await expect(menu).toHaveCount(0)

  await newChat(); await send('长时间运行的模拟对话。[e2e:slow]')
  await expect(workspace().locator('.transcript-agent')).toContainText('正在处理模拟请求')
  // After the first send the composer is back at the bottom of the conversation
  const bottomGap = await workspace().locator('.session-conversation').evaluate((node) => node.getBoundingClientRect().bottom - node.querySelector('.composer')!.getBoundingClientRect().bottom)
  expect(Math.abs(bottomGap)).toBeLessThanOrEqual(0.5)
  await page.getByRole('button', { name: '右侧边栏', exact: true }).click()
  const diff = workspace().getByRole('button', { name: 'Diff', exact: true })
  await diff.click(); await diff.hover(); await page.waitForTimeout(800)
  const tip = await diff.evaluate((el) => { const cs = getComputedStyle(el, '::after'); return { content: cs.content, opacity: cs.opacity } })
  expect(tip).toEqual({ content: '"Diff"', opacity: '1' })
  mkdirSync(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, `W3-tooltip-${BASE.width}.png`) })

  await page.getByRole('button', { name: '关闭 Session Project', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('关闭 Session Project？')
  await expect(dialog.getByRole('button', { name: '关闭并停止', exact: true })).toBeVisible()
  await snap('close-dialog', BASE.width)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await workspace().getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(workspace().locator('.transcript-turn-end')).toContainText('已停止')

  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  await openProject('Second Project')
  await page.getByRole('button', { name: '关闭 Second Project', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Second Project', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Second Project/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Session Project/ })).toBeVisible()
  await snap('launcher', BASE.width)
})
