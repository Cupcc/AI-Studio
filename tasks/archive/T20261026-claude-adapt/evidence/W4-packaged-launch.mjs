import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const appDir = join(root, 'apps/desktop')
const appBundle = resolve(process.argv[2] ?? join(appDir, 'dist', 'mac-arm64', 'AI Developer Studio.app'))
const appPath = join(appBundle, 'Contents', 'MacOS', 'AI Developer Studio')
const port = Number(process.argv[3] ?? 9346)
const { _electron: electron } = createRequire(join(appDir, 'package.json'))('@playwright/test')
const temp = mkdtempSync(join(tmpdir(), 'studio-w4-packaged-'))
const project = join(temp, 'W4 Packaged Project')
mkdirSync(project)
const app = await electron.launch({ executablePath: appPath,
  args: [`--remote-debugging-port=${port}`, `--studio-user-data-dir=${join(temp, 'user-data')}`], cwd: appDir,
  env: { ...process.env, STUDIO_ENABLE_CLAUDE_CODE: '1' } })
const page = await app.firstWindow()
await page.waitForTimeout(2500)
await app.evaluate(({ dialog, BrowserWindow }, path) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  BrowserWindow.getAllWindows()[0].setContentSize(1280, 800)
}, project)
console.log(JSON.stringify({ ready: true, packaged: true, port, appBundle, appPath, project, userData: join(temp, 'user-data'), switch: 'STUDIO_ENABLE_CLAUDE_CODE=1' }))
const control = readline.createInterface({ input: process.stdin })
control.on('line', async (line) => {
  if (line !== 'quit') return
  try { await app.close(); console.log(JSON.stringify({ exited: true })); process.exit(0) }
  catch (error) { console.log(JSON.stringify({ closeError: String(error.message).slice(0, 200) })) }
})
