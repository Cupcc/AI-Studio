import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import readline from 'node:readline'
const root = resolve(process.argv[2] ?? process.cwd())
const appDir = join(root, 'apps/desktop')
const evidence = join(root, 'tasks/archive/T20261111-workbench-plugins/evidence')
const { _electron: electron } = createRequire(join(appDir, 'package.json'))('@playwright/test')
const fixture = process.argv[3] ?? mkdtempSync(join(tmpdir(), 'studio-w3-workbench-'))
const projects = [join(fixture, 'W3 Workbench Project'), join(fixture, 'W3 Second Project')]
projects.forEach(path => mkdirSync(path, { recursive: true }))
const userData = join(fixture, 'user-data'), port = 9473
let app, page, nextProject = 0, starts = 0
const env = { ...process.env }
delete env.STUDIO_E2E_PROVIDERS
async function launch() {
 app = await electron.launch({ args: [appDir, `--remote-debugging-port=${port}`, `--studio-user-data-dir=${userData}`], cwd: appDir, env, colorScheme: null })
 page = await app.firstWindow()
 await page.waitForLoadState('domcontentloaded')
 page.on('pageerror', error => appendFileSync(join(evidence, 'W3-page-errors.log'), String(error.message) + '\n'))
 page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') appendFileSync(join(evidence, 'W3-console.log'), `${message.type()}: ${message.text()}\n`) })
 await app.evaluate(({ dialog, BrowserWindow, app }, project) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] })
  BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
  app.focus({ steal: true }); BrowserWindow.getAllWindows()[0].focus()
 }, projects[nextProject])
 await page.waitForSelector('iframe', { timeout: 3000 }).catch(() => {})
 const native = await app.evaluate(({nativeTheme}) => ({themeSource:nativeTheme.themeSource,shouldUseDarkColors:nativeTheme.shouldUseDarkColors}))
 const media = await Promise.all(page.frames().map(async frame => ({url:frame.url(),...await frame.evaluate(()=>({title:document.title,dark:matchMedia('(prefers-color-scheme: dark)').matches,background:getComputedStyle(document.documentElement).backgroundColor}))})))
 writeFileSync(join(evidence,'W3-before-agent-browser-theme.json'),JSON.stringify({native,media},null,2))
 await page.screenshot({path:join(evidence,'W3-native-dark-before-browser.png')})
 const result = { ready: true, starts: ++starts, port, fixture, projects, userData, providerMode: 'real', messagesSentByLauncher: 0, fixtureInjection: 'native-directory-picker and window-size only', isPackaged: await app.evaluate(({app})=>app.isPackaged) }
 writeFileSync(join(evidence, 'W3-launch.json'), JSON.stringify(result, null, 2)); appendFileSync(join(evidence, 'W3-launch-history.jsonl'), JSON.stringify(result) + '\n'); console.log(JSON.stringify(result))
}
await launch()
const control = readline.createInterface({ input: process.stdin })
control.on('line', async line => {
 try {
  if (line === 'project2') { nextProject = 1; await app.evaluate(({dialog}, project) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] }) }, projects[1]); console.log('project2 picker ready') }
  if (line === 'restart') { await app.close(); await launch() }
  if (line === 'quit') { await app.close(); console.log('closed'); process.exit(0) }
 } catch(error) { console.log(JSON.stringify({error: String(error.message)})) }
})
