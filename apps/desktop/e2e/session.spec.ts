import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { FeatureBridge } from '../src/shared/ipc/contract'
import type { sessionContract } from '../src/shared/ipc/session'
import type { SessionSummary } from '../src/shared/session/types'

type SessionApi = FeatureBridge<typeof sessionContract>
const appDir = join(__dirname, '..')
const evidence = process.env.STUDIO_E2E_EVIDENCE_DIR
let dir: string, app: ElectronApplication, page: Page, projectId: string
const workspace = () => page.locator('.project-workspace:not([hidden])')
const row = (id: string) => workspace().locator(`[data-session-row="${id}"]`)
async function sessions(): Promise<SessionSummary[]> {
  return page.evaluate((id) => (window.studio as unknown as { session: SessionApi }).session.list({ projectId: id }), projectId)
}
async function focusWindow() {
  // macOS can leave the application inactive even after BrowserWindow.focus().
  await app.evaluate(({ app, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!
    win.show()
    app.focus({ steal: true })
    win.focus()
  })
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocused())).toBe(true)
}
async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('topbar')).toBeVisible()
  await focusWindow()
}
async function newChat(cli: 'codex' | 'claude-code' = 'codex') {
  await workspace().getByRole('button', { name: '选择 CLI', exact: true }).click()
  await workspace().locator('.session-cli-menu').getByRole('button', { name: cli === 'codex' ? 'Codex CLI' : 'Claude Code', exact: false }).first().click()
  await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toBeEnabled()
}
async function send(text: string): Promise<SessionSummary> {
  const previous = new Set((await sessions()).map((session) => session.id))
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill(text)
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(async () => (await sessions()).some((session) => !previous.has(session.id))).toBe(true)
  return (await sessions()).find((session) => !previous.has(session.id))!
}
async function screenshot(name: string) {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800))
  const path = evidence ? join(evidence, `W5-${name}.png`) : test.info().outputPath(`W5-${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path })
}
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'studio sessions ')); await launch()
  const path = join(dir, 'Session Project'); mkdirSync(path)
  await app.evaluate(({ dialog }, selectedPath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] }) }, path)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Session Project' })).toBeVisible()
  projectId = await workspace().getAttribute('data-project-id') ?? ''
})
test.afterEach(async () => { await app?.close(); rmSync(dir, { recursive: true, force: true }) })

test('AC-02 / FR-CHAT-001 / FR-SESSION-001: draft first, then streamed Session from the top, native tool row and completion', async () => {
  await newChat()
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill('Unsent draft')
  expect(await sessions()).toHaveLength(0)
  await workspace().getByRole('button', { name: 'Architecture', exact: true }).click()
  await workspace().getByRole('button', { name: 'New Chat', exact: true }).first().click()
  await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toHaveValue('Unsent draft')
  const session = await send('[e2e:delay] Build streamed feature')
  await expect(row(session.id).getByRole('img', { name: 'Running', exact: true })).toBeVisible()
  await expect(workspace().locator('.transcript-agent')).not.toHaveCount(0)
  await expect(workspace().locator('.transcript-tool')).not.toHaveCount(0)
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
  // Shell Spec section 5: a transcript shorter than the viewport starts at the top, not above the composer
  const offset = await workspace().locator('.session-conversation__scroll').evaluate((node) => node.querySelector('.transcript-user')!.getBoundingClientRect().top - node.getBoundingClientRect().top)
  expect(offset).toBeLessThanOrEqual(32)
  await expect(row(session.id).getByRole('img', { name: 'Completed Unread' })).toHaveCount(0)
  await screenshot('conversation-stream-completed')
})

test('AC-03 / FR-SESSION-003 / FR-INPUT-001: Codex and Claude run independently; Stop affects only the displayed Session', async () => {
  await newChat('codex'); const a = await send('[e2e:slow] Codex parallel')
  await newChat('claude-code'); const b = await send('[e2e:slow] Claude parallel')
  await expect(row(a.id).getByRole('img', { name: 'Running' })).toBeVisible()
  await expect(row(b.id).getByRole('img', { name: 'Running' })).toBeVisible()
  await row(a.id).locator('.session-row__open').click()
  await workspace().getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(workspace().locator('.transcript-turn-end')).toContainText('已停止')
  await expect(row(a.id).getByRole('img', { name: 'Running' })).toHaveCount(0)
  await expect(row(b.id).getByRole('img', { name: 'Running' })).toBeVisible()
  await screenshot('parallel-session-stop')
  await row(b.id).locator('.session-row__open').click(); await workspace().getByRole('button', { name: 'Stop', exact: true }).click()
})

test('AC-04 / FR-STATE-004/005: background completion shows a green dot; opening clears it and reveals the latest', async () => {
  await newChat(); const a = await send('[e2e:delay] Background completion')
  await newChat('claude-code'); const b = await send('[e2e:slow] Current conversation')
  await expect(row(a.id).getByRole('img', { name: 'Completed Unread' })).toBeVisible()
  await focusWindow()
  await row(a.id).locator('.session-row__open').click()
  await expect(row(a.id).getByRole('img', { name: 'Completed Unread' })).toHaveCount(0)
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
  const position = await workspace().locator('.session-conversation__scroll').evaluate((node) => ({ gap: node.scrollHeight - node.scrollTop - node.clientHeight }))
  expect(position.gap).toBeLessThanOrEqual(1)
  await screenshot('background-completion-opened')
  await row(b.id).locator('.session-row__open').click(); await workspace().getByRole('button', { name: 'Stop', exact: true }).click()
})

test('AC-05 / FR-STATE-002 / I-Q2: Needs Input survives viewing and resolves through native approval or composer text', async () => {
  await newChat(); const approval = await send('[e2e:approval] Approval request')
  await expect(workspace().getByRole('region', { name: '等待你的确认' })).toBeVisible()
  await newChat('claude-code'); const background = await send('[e2e:slow] Other work')
  await expect(row(approval.id).getByRole('img', { name: 'Needs Input' })).toBeVisible()
  await row(approval.id).locator('.session-row__open').click()
  await expect(row(approval.id).getByRole('img', { name: 'Needs Input' })).toBeVisible()
  await screenshot('needs-input-approval')
  await workspace().locator('.request-card__actions button').first().click()
  await expect(row(approval.id).getByRole('img', { name: 'Needs Input' })).toHaveCount(0)
  await expect(workspace().locator('.request-card__resolution')).toContainText('已选择')
  await newChat(); const question = await send('[e2e:question] Question request')
  await expect(workspace().getByRole('region', { name: '等待你的回答' })).toBeVisible()
  await workspace().getByRole('textbox', { name: '回复 Agent', exact: true }).fill('Use the smaller scope')
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(row(question.id).getByRole('img', { name: 'Needs Input' })).toHaveCount(0)
  await expect(workspace().locator('.request-card__resolution')).toContainText('已在输入框回复')
  await expect(workspace().locator('.transcript-user').last()).toContainText('Use the smaller scope')
  await screenshot('needs-input-text-reply')
  await row(background.id).locator('.session-row__open').click(); await workspace().getByRole('button', { name: 'Stop', exact: true }).click()
})

test('FR-SESSION-002 / FR-INPUT-002 / FR-NAV-003: Rename, next-turn model and unsent input survive relaunch', async () => {
  await newChat(); const session = await send('Persistent conversation')
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
  await row(session.id).getByRole('button', { name: /更多操作/ }).click()
  await workspace().getByRole('menuitem', { name: 'Rename' }).click()
  await workspace().getByRole('textbox', { name: 'Session 标题' }).fill('Renamed conversation')
  await workspace().getByRole('textbox', { name: 'Session 标题' }).press('Enter')
  await expect(workspace().locator('.session-header__title')).toHaveText('Renamed conversation')
  const picker = workspace().getByRole('combobox', { name: 'Model Selector' })
  await expect(picker).toBeEnabled()
  const model = await picker.locator('option').last().getAttribute('value') ?? ''
  await picker.selectOption(model)
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill('Unsent follow-up')
  const nativeId = (await sessions()).find((s) => s.id === session.id)!.nativeSessionId
  await expect.poll(async () => page.evaluate(async (id) => (window.studio as unknown as { session: SessionApi }).session.getDraft({ projectId: id.projectId, kind: 'session', sessionId: id.sessionId }), { projectId, sessionId: session.id }).then((draft) => draft.text)).toBe('Unsent follow-up')
  await app.close(); await launch()
  await expect(workspace().locator('.session-header__title')).toHaveText('Renamed conversation')
  await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toHaveValue('Unsent follow-up')
  await expect(workspace().getByRole('combobox', { name: 'Model Selector' })).toHaveValue(model)
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().locator('.transcript-turn-end')).toHaveCount(2)
  expect((await sessions()).find((s) => s.id === session.id)!.nativeSessionId).toBe(nativeId)
  await screenshot('session-resume-draft-model')
})

test('FR-STATE-003/005 / S-Q1/S-Q2: completion during blur stays unread on focus; opening clears it and retry resumes the same native ID', async () => {
  await newChat(); const session = await send('[e2e:error] Retry failure')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.blur())
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocused())).toBe(false)
  await expect(row(session.id).getByRole('img', { name: 'Error', exact: true })).toBeVisible()
  await focusWindow()
  await expect(row(session.id).getByRole('img', { name: 'Error', exact: true })).toBeVisible()
  await row(session.id).locator('.session-row__open').click()
  await expect(row(session.id).getByRole('img', { name: 'Error', exact: true })).toHaveCount(0)
  await workspace().getByText('查看详情', { exact: true }).click()
  await expect(workspace().locator('.transcript-error pre')).toContainText('这是一条模拟错误详情')
  const nativeId = (await sessions()).find((s) => s.id === session.id)!.nativeSessionId
  await screenshot('error-details-retry')
  await workspace().getByRole('button', { name: '重试', exact: true }).click()
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
  expect((await sessions()).find((s) => s.id === session.id)!.nativeSessionId).toBe(nativeId)
})

test('FR-STATE-002 / I-Q2: composer text declines every outstanding approval and remains a user message', async () => {
  await newChat(); const session = await send('[e2e:multi] Two approvals')
  await expect(workspace().locator('.request-card')).toHaveCount(2)
  await workspace().getByRole('textbox', { name: '回复 Agent', exact: true }).fill('Do not execute either command')
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(row(session.id).getByRole('img', { name: 'Needs Input' })).toHaveCount(0)
  await expect(workspace().getByText('已在输入框回复', { exact: true })).toHaveCount(2)
  await expect(workspace().locator('.transcript-user').last()).toContainText('Do not execute either command')
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
})

for (const running of [false, true]) {
  test(`FR-PROJ-002 / FR-SESSION-002: closing ${running ? 'a Running' : 'an idle'} Project preserves the native conversation on reopen`, async () => {
    await newChat()
    const session = await send(running ? '[e2e:slow] Close running conversation' : 'Close idle conversation')
    if (running) await expect(workspace().locator('.transcript-agent')).toContainText('正在处理模拟请求')
    else await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
    const nativeId = (await sessions()).find((s) => s.id === session.id)!.nativeSessionId
    expect(nativeId).toBeTruthy()
    await workspace().getByRole('textbox', { name: '消息', exact: true }).fill('Continue after reopening')
    await page.getByRole('button', { name: '关闭 Session Project', exact: true }).click()
    if (running) {
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('1')
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await expect(row(session.id).getByRole('img', { name: 'Running' })).toBeVisible()
      await page.getByRole('button', { name: '关闭 Session Project', exact: true }).click()
      await dialog.getByRole('button', { name: '关闭并停止', exact: true }).click()
    }
    await expect(page.getByRole('tab', { name: 'Session Project', exact: true })).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: /^Session Project/ }).click()
    await expect(workspace().locator('.transcript-turn-end')).toHaveCount(1)
    await expect(workspace().locator('.transcript-turn-end')).toContainText(running ? '已停止' : 'Done')
    await expect(workspace().getByRole('textbox', { name: '消息', exact: true })).toHaveValue('Continue after reopening')
    expect((await sessions()).find((s) => s.id === session.id)).toMatchObject({ nativeSessionId: nativeId, activity: 'none' })
    await workspace().getByRole('button', { name: 'Send', exact: true }).click()
    await expect(workspace().locator('.transcript-turn-end')).toHaveCount(2)
    await expect(workspace().locator('.transcript-turn-end').last()).toContainText('Done')
    await expect(workspace().locator('.transcript-user').last()).toContainText('Continue after reopening')
    expect((await sessions()).find((s) => s.id === session.id)!.nativeSessionId).toBe(nativeId)
    expect(await sessions()).toHaveLength(1)
    await screenshot(`project-reopen-${running ? 'running' : 'idle'}`)
  })
}

test('FR-SESSION-001: opening starts at the bottom; scrolling up pauses following until returning to latest', async () => {
  await newChat()
  const session = await send('[e2e:delay]\n' + Array.from({ length: 50 }, (_, index) => `Long conversation line ${index + 1}`).join('\n'))
  const scroll = workspace().locator('.session-conversation__scroll')
  const gap = () => scroll.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)
  await expect.poll(gap).toBeLessThanOrEqual(1)
  await scroll.hover()
  await page.mouse.wheel(0, -420)
  await expect(workspace().getByRole('button', { name: '回到最新 ↓' })).toBeVisible()
  const before = await scroll.evaluate((node) => node.scrollTop)
  await expect(workspace().locator('.transcript-turn-end')).toContainText('Done')
  expect(Math.abs(await scroll.evaluate((node) => node.scrollTop) - before)).toBeLessThanOrEqual(1)
  expect(await gap()).toBeGreaterThan(100)
  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  await page.getByRole('tab', { name: /^Session Project(?:，.*)?$/ }).click()
  await expect(workspace().getByRole('button', { name: '回到最新 ↓' })).toBeVisible()
  expect(Math.abs(await scroll.evaluate((node) => node.scrollTop) - before)).toBeLessThanOrEqual(1)
  await screenshot('conversation-scroll-paused')
  await workspace().getByRole('button', { name: '回到最新 ↓' }).click()
  await expect.poll(gap).toBeLessThanOrEqual(1)
  await workspace().getByRole('textbox', { name: '消息', exact: true }).fill('Follow this second turn\n' + 'More visible conversation content\n'.repeat(12))
  await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace().locator('.transcript-turn-end')).toHaveCount(2)
  await expect.poll(gap).toBeLessThanOrEqual(1)
  await scroll.hover(); await page.mouse.wheel(0, -420)
  await expect(workspace().getByRole('button', { name: '回到最新 ↓' })).toBeVisible()
  await row(session.id).locator('.session-row__open').click()
  await expect.poll(gap).toBeLessThanOrEqual(1)
  await expect(workspace().getByRole('button', { name: '回到最新 ↓' })).toHaveCount(0)
})
