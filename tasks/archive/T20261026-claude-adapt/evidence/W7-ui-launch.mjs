// Independent UI verification. No messages are sent by this launcher.
// Only the native directory picker and window size are overridden.
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const appDir = join(root, 'apps/desktop')
const { _electron: electron } = createRequire(join(appDir, 'package.json'))('@playwright/test')
const fixture = mkdtempSync(join(tmpdir(), 'studio-w7-claude-ui-'))
const project = join(fixture, 'W7 Isolated Project')
mkdirSync(project)
const port = Number(process.argv[2] ?? 9459)
const env = { ...process.env, STUDIO_ENABLE_CLAUDE_CODE: '1' }
delete env.STUDIO_E2E_PROVIDERS
const app = await electron.launch({
  args: [appDir, `--remote-debugging-port=${port}`, `--studio-user-data-dir=${join(fixture, 'data')}`],
  cwd: appDir,
  env,
})
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
await app.evaluate(({ dialog, BrowserWindow }, path) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  BrowserWindow.getAllWindows()[0].setContentSize(1280, 800)
}, project)
const runtime = await app.evaluate(({ app }) => ({ isPackaged: app.isPackaged }))
const result = {
  ready: true, port, fixture, project, userData: join(fixture, 'data'),
  ...runtime, switch: 'STUDIO_ENABLE_CLAUDE_CODE=1',
  providerMode: 'real', messagesSentByLauncher: 0,
}
writeFileSync(join(root, '.runtime/w7-claude-development.json'), JSON.stringify(result))
console.log(JSON.stringify(result))
const control = readline.createInterface({ input: process.stdin })
control.on('line', async (line) => {
  if (line !== 'quit') return
  await app.close()
  console.log(JSON.stringify({ exited: true }))
  process.exit(0)
})
