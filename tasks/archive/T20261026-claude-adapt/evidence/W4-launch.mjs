// Independent verification launcher. Run only after acquiring the shared native-window slot.
// Fixture injection is limited to the directory picker; all tested behavior is driven by agent-browser.
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const appDir = join(root, 'apps/desktop')
const mode = process.argv[2] ?? 'real'
const port = Number(process.argv[3] ?? 9344)
const { _electron: electron } = createRequire(join(appDir, 'package.json'))('@playwright/test')
const temp = mkdtempSync(join(tmpdir(), `studio-w4-${mode}-`))
const project = join(temp, 'W4 Isolated Project')
mkdirSync(join(project, '.claude'), { recursive: true })
// Default is a non-escalating project override. Ask rules force the two synthetic
// write commands through the application even if another allow rule exists.
writeFileSync(join(project, '.claude/settings.local.json'), JSON.stringify({
  permissions: { defaultMode: 'default', ask: ['Bash(*)'] },
  disableAllHooks: true,
}, null, 2))
const { resolveSettings } = await import(join(root, 'packages/agent-adapter/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs'))
const settings = await resolveSettings({ cwd: project })
const effective = { permissionMode: settings.effective?.permissions?.defaultMode,
  askBash: settings.effective?.permissions?.ask?.includes('Bash(*)') === true }
if (effective.permissionMode !== 'default' || !effective.askBash) throw new Error('Isolated approval configuration did not resolve')
const env = { ...process.env }
delete env.STUDIO_E2E_PROVIDERS
delete env.STUDIO_ENABLE_CLAUDE_CODE
if (mode === 'real') env.STUDIO_ENABLE_CLAUDE_CODE = '1'
const app = await electron.launch({ args: [appDir, `--remote-debugging-port=${port}`, `--studio-user-data-dir=${join(temp, 'user-data')}`], cwd: appDir, env })
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
await app.evaluate(({ dialog, BrowserWindow }, path) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  BrowserWindow.getAllWindows()[0].setContentSize(1280, 800)
}, project)
console.log(JSON.stringify({ ready: true, mode, port, project, userData: join(temp, 'user-data'), effective }))
const control = readline.createInterface({ input: process.stdin })
control.on('line', async (line) => {
  if (line !== 'quit') return
  try { await app.close(); console.log(JSON.stringify({ exited: true })); process.exit(0) }
  catch (error) { console.log(JSON.stringify({ closeError: String(error.message).slice(0, 200) })) }
})
