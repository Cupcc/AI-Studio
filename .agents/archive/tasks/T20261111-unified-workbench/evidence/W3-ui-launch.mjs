import { createRequire } from 'node:module'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import readline from 'node:readline'

const root = resolve(process.argv[2] ?? process.cwd())
const appDir = join(root, 'apps/desktop')
const evidence = join(root, '.agents/archive/tasks/T20261111-unified-workbench/evidence')
const { _electron: electron } = createRequire(join(appDir, 'package.json'))('@playwright/test')
const fixture = process.argv[3] ?? mkdtempSync(join(tmpdir(), 'studio-unified-review-'))
const projects = [join(fixture, 'Unified Review Project'), join(fixture, 'Second Review Project')]
projects.forEach(path => mkdirSync(path, { recursive: true }))
const userData = join(fixture, 'user-data')
const port = 9483
const env = { ...process.env }
delete env.STUDIO_E2E_PROVIDERS
let app, page, projectIndex = 0, starts = 0

async function launch() {
  app = await electron.launch({ args: [appDir, `--remote-debugging-port=${port}`, `--studio-user-data-dir=${userData}`], cwd: appDir, env, colorScheme: null })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  page.on('pageerror', error => appendFileSync(join(evidence, 'W3-page-errors.log'), `${error.name}: ${error.message.slice(0, 1000)}\n`))
  await app.evaluate(({ dialog, BrowserWindow, app }, project) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] })
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
    app.focus({ steal: true })
    BrowserWindow.getAllWindows()[0].focus()
  }, projects[projectIndex])
  const info = { ready: true, starts: ++starts, port, fixture, projects, userData, providerMode: 'real', messagesSentByLauncher: 0, fixtureInjection: 'native directory picker result and window size/focus only', isPackaged: await app.evaluate(({ app }) => app.isPackaged) }
  writeFileSync(join(evidence, 'W3-launch.json'), JSON.stringify(info, null, 2))
  appendFileSync(join(evidence, 'W3-launch-history.jsonl'), `${JSON.stringify(info)}\n`)
  console.log(JSON.stringify(info))
}

await launch()
const control = readline.createInterface({ input: process.stdin })
control.on('line', async line => {
  try {
    if (line === 'project2') {
      projectIndex = 1
      await app.evaluate(({ dialog }, project) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] }) }, projects[projectIndex])
      console.log('Second Project picker ready')
    }
    if (line === 'restart') { await app.close(); await launch() }
    if (line === 'quit') { await app.close(); console.log('Closed review application'); process.exit(0) }
  } catch (error) { console.log(JSON.stringify({ error: error.message })) }
})
