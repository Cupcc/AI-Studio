// 真实应用 + 真实 Claude CLI 的界面验收脚本（不启用模拟 Provider）。
// 用法：先 `pnpm --filter @ai-studio/desktop exec electron-vite build`，再 `node W3-app-real-claude.mjs [输出目录]`。
// 隔离 userData 与临时项目都在系统临时目录；只通过用户可见入口操作，截图用 page.screenshot（仅渲染进程内容）。
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = join(here, '../../../../apps/desktop')
const { _electron: electron } = createRequire(join(appDir, 'package.json'))('@playwright/test')
const out = process.argv[2] ?? join(here, 'W3-screens')
mkdirSync(out, { recursive: true })
const dir = mkdtempSync(join(tmpdir(), 'studio real claude '))
const project = join(dir, 'Real Claude Project'); mkdirSync(project)
const result = { steps: [] }
const log = (step, data = {}) => { result.steps.push({ step, ...data }); console.log(JSON.stringify({ step, ...data })) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user data')}`], cwd: appDir, env: { ...process.env } })
const page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
const workspace = () => page.locator('.project-workspace:not([hidden])')
const input = () => workspace().getByRole('textbox', { name: '消息', exact: true })
const row = (id) => workspace().locator(`[data-session-row="${id}"]`)
const shot = async (name) => { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800)); await page.screenshot({ path: join(out, `W3-${name}.png`) }) }
const sessions = () => page.evaluate((id) => window.studio.session.list({ projectId: id }), projectId)
let projectId = ''
async function newChat() {
  await workspace().getByRole('button', { name: '选择 CLI', exact: true }).click()
  await workspace().locator('.session-cli-menu').getByRole('button', { name: 'Claude Code', exact: false }).first().click()
  await input().waitFor({ state: 'visible' })
}
async function pickModel(label) {
  await workspace().getByRole('button', { name: 'Model Selector', exact: true }).click()
  const labels = await workspace().locator('.composer__model-control .composer__control-panel .menu-item').allTextContents()
  await workspace().locator('.composer__model-control .composer__control-panel').getByRole('button', { name: label, exact: true }).click()
  return labels.map((text) => text.trim())
}
async function send(text) {
  const before = new Set((await sessions()).map((session) => session.id))
  await input().fill(text); await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  for (let i = 0; i < 100 && !(await sessions()).some((session) => !before.has(session.id)); i++) await sleep(100)
  return (await sessions()).find((session) => !before.has(session.id))
}
const waitFor = async (check, timeoutMs, label) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) { if (await check()) return true; await sleep(250) }
  log('timeout', { label }); return false
}

try {
  await page.getByTestId('topbar').waitFor()
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, project)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await page.getByRole('tab', { name: 'Real Claude Project' }).waitFor()
  projectId = await workspace().getAttribute('data-project-id')

  // 1. CLI 入口：真实可用性检测（等待检测完成，记录各 Provider 的状态枚举与原因）
  const providerStates = () => page.evaluate(() => window.studio.session.getProviders().then((items) => items.map((item) => ({ cli: item.cli, status: item.status, reason: item.reason ?? null }))))
  await waitFor(async () => (await providerStates()).every((item) => item.status !== 'checking'), 40000, 'provider-detection')
  log('providers', { items: await providerStates() })
  await workspace().getByRole('button', { name: '选择 CLI', exact: true }).click()
  await shot('cli-menu')
  const cliMenu = (await workspace().locator('.session-cli-menu').innerText()).replace(/\s+/g, ' ').slice(0, 300)
  log('cli-menu', { text: cliMenu })
  await workspace().locator('.session-cli-menu').getByRole('button', { name: 'Claude Code', exact: false }).first().click()
  await input().waitFor({ state: 'visible' })

  // 2. 模型目录与 effort 目录（默认模型，未手动选模型）
  await sleep(1500)
  const effortButton = workspace().getByRole('button', { name: 'Reasoning Effort', exact: true })
  const effortVisibleOnDefault = await effortButton.isVisible().catch(() => false)
  await effortButton.click()
  const panel = workspace().locator('.composer__effort-control .composer__control-panel')
  const efforts = (await panel.locator('.composer__effort-option').allTextContents()).map((text) => text.trim())
  await shot('effort-menu-default-model')
  log('effort-on-default-model', { visible: effortVisibleOnDefault, options: efforts })
  await page.keyboard.press('Escape')
  const models = await pickModel('Haiku 5.5')
  log('model-catalog', { items: models })
  await effortButton.click(); await panel.getByRole('button', { name: 'low', exact: true }).click()
  log('effort-selected', { description: await effortButton.getAttribute('aria-description') })

  // 3. Session A：effort 选择在应用内真正影响回合（Bash 内的 CLAUDE_EFFORT）。本机用户级设置为 bypassPermissions，命令不弹授权。
  const conversation = () => workspace().locator('.transcript, [aria-label="Conversation"], main').first()
  const bodyText = async () => (await workspace().innerText().catch(() => ''))
  const sessionA = await send('Run exactly this Bash command once, wait for completion, then reply with only DONE_A: printenv CLAUDE_EFFORT > effort-seen.txt')
  const aDone = await waitFor(async () => (await bodyText()).includes('DONE_A') && existsSync(join(project, 'effort-seen.txt')), 90000, 'A-complete')
  const seen = existsSync(join(project, 'effort-seen.txt')) ? readFileSync(join(project, 'effort-seen.txt'), 'utf8').trim() : null
  await shot('effort-applied')
  log('effort-applied-in-app', { aCompleted: aDone, claudeEffortSeenByBash: seen })

  // 3b. Needs Input：真实 AskUserQuestion。Session Q 等待回答时，Session B 并发完成；再从卡片选择答案。
  await newChat(); await pickModel('Haiku 5.5')
  const ask = 'Use the AskUserQuestion tool exactly once to ask which fruit I prefer (options: Apple and Banana). Then reply with only the chosen fruit in UPPERCASE.'
  const sessionQ = await send(ask)
  const questionSeen = await waitFor(() => workspace().getByRole('region', { name: '等待你的回答' }).isVisible().catch(() => false), 90000, 'question-card')
  if (questionSeen) {
    await shot('needs-input-question')
    log('question-card', { text: (await workspace().getByRole('region', { name: '等待你的回答' }).innerText()).replace(/\s+/g, ' ').slice(0, 240), needsInputDot: await row(sessionQ.id).getByRole('img', { name: 'Needs Input' }).isVisible() })
  }
  await newChat(); await pickModel('Haiku 5.5')
  const sessionB = await send('Reply exactly APP_B_DONE. Use no tools.')
  const bDone = await waitFor(async () => (await bodyText()).includes('APP_B_DONE') && await row(sessionB.id).getByRole('img', { name: 'Running' }).count() === 0, 90000, 'B-complete')
  const qStillWaiting = questionSeen ? await row(sessionQ.id).getByRole('img', { name: 'Needs Input' }).isVisible() : null
  await shot('concurrent-b-done-question-waiting')
  log('concurrent', { bCompleted: bDone, questionStillNeedsInput: qStillWaiting })
  await row(sessionQ.id).locator('.session-row__open').click()
  if (questionSeen) {
    const card = workspace().getByRole('region', { name: '等待你的回答' })
    await card.getByRole('radio', { name: /Banana/i }).click(); await card.getByRole('button', { name: '提交回答', exact: true }).click()
    const answered = await waitFor(async () => (await bodyText()).toUpperCase().includes('BANANA') && await row(sessionQ.id).getByRole('img', { name: 'Needs Input' }).count() === 0 && await row(sessionQ.id).getByRole('img', { name: 'Running' }).count() === 0, 90000, 'question-answered')
    await shot('question-answered-from-card')
    log('question-answered-from-card', { agentUsedChoice: answered })
    // 第二次：用输入框文字作答
    await input().waitFor({ state: 'visible' })
    await input().fill(ask); await workspace().getByRole('button', { name: 'Send', exact: true }).click()
    const second = await waitFor(() => workspace().getByRole('region', { name: '等待你的回答' }).isVisible().catch(() => false), 90000, 'question-card-2')
    if (second) {
      await workspace().getByRole('textbox', { name: '回复 Agent', exact: true }).fill('Cherry'); await workspace().getByRole('button', { name: 'Send', exact: true }).click()
      const viaText = await waitFor(async () => (await bodyText()).toUpperCase().includes('CHERRY') && await row(sessionQ.id).getByRole('img', { name: 'Needs Input' }).count() === 0, 90000, 'question-answered-text')
      await shot('question-answered-from-text')
      log('question-answered-from-text', { agentUsedText: viaText })
    }
  }

  // 4. Session C：长命令 → 授权 → Stop → 进程退出 → 同一 Session 继续
  await newChat(); await pickModel('Haiku 5.5')
  const mark = `STOPMARK${Date.now()}`
  const sessionC = await send(`Run exactly this Bash command once and wait for completion: python3 -c 'import time;time.sleep(120)' ${mark}`)
    const running = await waitFor(() => { try { return execFileSync('pgrep', ['-f', mark], { encoding: 'utf8' }).trim().length > 0 } catch { return false } }, 60000, 'command-running')
  await shot('before-stop')
  await workspace().getByRole('button', { name: 'Stop', exact: true }).click()
  const stopped = await waitFor(async () => (await workspace().locator('.transcript-turn-end').last().innerText().catch(() => '')).includes('已停止'), 60000, 'stopped')
  await sleep(1500)
  let leftover = false; try { leftover = execFileSync('pgrep', ['-f', mark], { encoding: 'utf8' }).trim().length > 0 } catch { leftover = false }
  await shot('after-stop')
  log('stop', { commandWasRunning: running, uiShowsStopped: stopped, commandProcessLeftover: leftover })
  const rowsAfter = await sessions()
  log('other-sessions-after-stop', { states: rowsAfter.map((session) => ({ id: session.id === sessionC.id ? 'C' : session.id === sessionB.id ? 'B' : session.id === sessionQ.id ? 'Q' : 'A', status: session.status })) })
  await input().fill('Reply exactly APP_C_AFTER_STOP. Use no tools.'); await workspace().getByRole('button', { name: 'Send', exact: true }).click()
  const cAfter = await waitFor(async () => (await bodyText()).includes('APP_C_AFTER_STOP'), 90000, 'C-continues')
  await shot('continue-after-stop')
  log('continue-after-stop', { replied: cAfter })
} catch (error) {
  log('script-error', { message: String(error?.message ?? error).slice(0, 300) })
  try { await shot('error') } catch { /* ignore */ }
} finally {
  // 与 e2e/quit.ts 相同：有进行中的会话时走真实的「停止并退出」确认；超时则强制结束，避免遗留 Runtime。
  const closing = app.close().catch(() => {})
  const confirm = page.getByRole('button', { name: '停止并退出', exact: true })
  const confirmed = await confirm.waitFor({ state: 'visible', timeout: 8000 }).then(() => confirm.click()).then(() => true).catch(() => false)
  const exited = await Promise.race([closing.then(() => true), sleep(30000).then(() => false)])
  log('quit', { confirmationShown: confirmed, exitedCleanly: exited })
  if (!exited) { try { process.kill(app.process().pid, 'SIGKILL') } catch { /* already gone */ } }
  rmSync(dir, { recursive: true, force: true })
}
console.log(JSON.stringify({ done: true, steps: result.steps.length }))
