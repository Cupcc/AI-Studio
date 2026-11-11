import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import readline from 'node:readline'
const root = resolve(process.argv[2] ?? process.cwd())
const appDir = join(root, 'apps/desktop')
const evidence = join(root, 'tasks/archive/T20261111-workbench-plugins/evidence')
const { _electron: electron } = createRequire(join(appDir, 'package.json'))('@playwright/test')
const fixture = mkdtempSync(join(tmpdir(), 'studio-w5-workbench-'))
const project = join(fixture, 'W5 Workbench Project'), userData = join(fixture, 'user-data'), port = 9475
mkdirSync(join(project, 'src'), { recursive: true })
mkdirSync(join(project, 'source files'), { recursive: true })
writeFileSync(join(project, 'src/app.ts'), 'export const review = "W5"\n')
writeFileSync(join(project, 'source files/entry.ts'), 'export const spacedPath = true\n')
let app, starts = 0
async function launch() {
 app = await electron.launch({ args: [appDir, `--remote-debugging-port=${port}`, `--studio-user-data-dir=${userData}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' }, colorScheme: null })
 const page = await app.firstWindow()
 await page.waitForLoadState('domcontentloaded')
 page.on('pageerror', error => appendFileSync(join(evidence, 'W5-page-errors.log'), String(error.message) + '\n'))
 page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') appendFileSync(join(evidence, 'W5-console.log'), `${message.type()}: ${message.text()}\n`) })
 await app.evaluate(({ dialog, BrowserWindow, app }, selected) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] })
  const win = BrowserWindow.getAllWindows()[0]
  win.setContentSize(1440, 900); app.focus({ steal: true }); win.focus()
 }, project)
 const result = { ready: true, starts: ++starts, port, fixture, project, userData, providerMode: 'simulated; no model messages sent', fixtureInjection: 'test source files, native-directory-picker and window-size only', isPackaged: await app.evaluate(({app})=>app.isPackaged) }
 writeFileSync(join(evidence, 'W5-launch.json'), JSON.stringify(result, null, 2)); appendFileSync(join(evidence, 'W5-launch-history.jsonl'), JSON.stringify(result) + '\n'); console.log(JSON.stringify(result))
}
await launch()
readline.createInterface({ input: process.stdin }).on('line', async line => {
 try {
  if (line === 'restart') { await app.close(); await launch() }
  if (line === 'quit') { await app.close(); console.log('closed'); process.exit(0) }
 } catch(error) { console.log(JSON.stringify({error: String(error.message)})) }
})
